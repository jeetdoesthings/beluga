//! beluga-spatial::render — Real-time spatial renderer (spec §30, §56).
//!
//! Bridges spatial math and audio I/O. Pre-computes speaker azimuths from the
//! project geometry, then per-block computes VBAP gains for the current source
//! position and applies them to the input audio.
//!
//! Port of Python `render.py` adapted for real-time: `render_block` writes
//! directly into the output buffer (no allocation).

use beluga_core::{to_listener_relative, BelugaProject};
use beluga_dsp::{
    apply_smoothed_gain_per_sample, compute_delays, FractionalDelay, SmoothingConfig,
};

/// The core real-time renderer.
pub struct RealTimeRenderer {
    /// Pre-computed listener-relative azimuths (degrees) for each enabled speaker.
    speaker_azimuths: Vec<f64>,
    /// Per-speaker listener-relative distances (meters), for delay alignment.
    speaker_distances: Vec<f64>,
    n_speakers: usize,
    pub sample_rate: u32,
    prev_gains: Vec<f32>,
    delay_lines: Vec<FractionalDelay>,
    /// Delay in samples for each speaker (farthest = 0 delay reference).
    pub delays: Vec<f64>,
    smoothing: SmoothingConfig,
}

impl RealTimeRenderer {
    /// Create a renderer from a BelugaProject.
    ///
    /// Speaker azimuths and distances are computed once at construction from
    /// the project's active listener and enabled speakers.
    pub fn new(project: &BelugaProject, sample_rate: u32) -> Self {
        let listener = project
            .active_listener()
            .expect("project must have a listener");

        let mut speaker_azimuths = Vec::new();
        let mut speaker_distances = Vec::new();

        for sp in &project.speakers {
            if !sp.enabled {
                continue;
            }
            let (sph, _) =
                to_listener_relative(sp.position, listener.position, listener.orientation);
            // Azimuth of speaker relative to listener (horizontal projection).
            speaker_azimuths.push(sph.azimuth);
            speaker_distances.push(sph.distance);
        }

        let n = speaker_azimuths.len();

        // Compute delay alignment: farthest speaker = 0 delay, closer = positive.
        let delays_sec = compute_delays(&speaker_distances);

        // Pre-allocate delay lines: max delay = max delay in samples + safety margin.
        let max_delay_sec = delays_sec.iter().cloned().fold(0.0_f64, f64::max);
        let max_delay_samples = if max_delay_sec > 0.0 {
            (max_delay_sec * sample_rate as f64).ceil() as usize + 2
        } else {
            0
        };
        let delay_lines: Vec<FractionalDelay> = (0..n)
            .map(|_| FractionalDelay::new(max_delay_samples.max(1)))
            .collect();

        // Convert delays to sample counts.
        let delays: Vec<f64> = delays_sec.iter().map(|&d| d * sample_rate as f64).collect();

        RealTimeRenderer {
            speaker_azimuths,
            speaker_distances,
            n_speakers: n,
            sample_rate,
            prev_gains: vec![0.0; n],
            delay_lines,
            delays,
            smoothing: SmoothingConfig::default(),
        }
    }

    /// Number of active (enabled) speakers.
    pub fn n_speakers(&self) -> usize {
        self.n_speakers
    }

    /// Compute raw VBAP gains for a given source azimuth/elevation.
    ///
    /// Does NOT update internal state. Elevation is accepted for API
    /// compatibility but 2D VBAP is used (horizontal plane).
    /// Height-layer blending can be added later.
    pub fn compute_gains(&self, source_az: f64, _source_el: f64) -> Vec<f32> {
        super::vbap::render_vbap_2d(&self.speaker_azimuths, source_az)
    }

    /// Update speaker azimuths/distances in real-time (e.g. when the user
    /// drags a speaker in the 3D viewport while audio is playing).
    pub fn update_speaker_positions(&mut self, azimuths: Vec<f64>, distances: Vec<f64>) {
        if azimuths.len() != distances.len() {
            return;
        }
        self.speaker_azimuths = azimuths;
        self.speaker_distances = distances.clone();
        // Recompute delays from new distances.
        let delays_sec = compute_delays(&distances);
        self.delays = delays_sec
            .iter()
            .map(|&d| d * self.sample_rate as f64)
            .collect();
    }

    /// Render one audio block into `output` (per-speaker interleaved:
    /// speaker 0 block, speaker 1 block, ... of `n_frames` each).
    ///
    /// `gains` is the pre-computed VBAP gain vector (length n_speakers).
    /// `source_gain` is an additional linear gain multiplier.
    ///
    /// Returns the number of frames written.
    pub fn render_block(
        &mut self,
        input: &[f32],
        gains: &[f32],
        source_gain: f32,
        output: &mut [f32],
    ) -> usize {
        let n_frames = input.len();

        if self.n_speakers == 0 || n_frames == 0 {
            for s in output.iter_mut() {
                *s = 0.0;
            }
            return 0;
        }

        assert_eq!(
            output.len(),
            n_frames * self.n_speakers,
            "output buffer must be n_frames * n_speakers"
        );

        for (si, &g) in gains.iter().enumerate() {
            let old_g = self.prev_gains[si];
            let new_g = g * source_gain;

            // Per-sample gain smoothing: ramp from old_g to new_g over the block.
            let ramp = apply_smoothed_gain_per_sample(input, old_g, new_g, &self.smoothing);

            // Apply fractional delay per speaker.
            let ch_out: &mut [f32] = &mut output[si * n_frames..(si + 1) * n_frames];
            self.delay_lines[si].process(&ramp, self.delays[si], ch_out);

            self.prev_gains[si] = new_g;
        }

        n_frames
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use beluga_core::{Listener, Room, Speaker, Vector3};

    fn make_test_project() -> BelugaProject {
        let mut proj = BelugaProject::new("Test");
        proj.room = Room::new("Room", 6.0, 5.0, 2.8);
        proj.listeners
            .push(Listener::new("L1", "Main", Vector3::new(0.0, 0.0, 1.1)));
        proj.active_listener_id = Some("L1".to_string());
        // Stereo pair: left at -30deg, right at +30deg
        proj.speakers.push(Speaker::new(
            "S1",
            "Left",
            "Bookshelf",
            Vector3::new(-1.0, 2.0, 0.0),
        ));
        proj.speakers.push(Speaker::new(
            "S2",
            "Right",
            "Bookshelf",
            Vector3::new(1.0, 2.0, 0.0),
        ));
        proj
    }

    #[test]
    fn renderer_construction() {
        let proj = make_test_project();
        let r = RealTimeRenderer::new(&proj, 48000);
        assert_eq!(r.n_speakers(), 2);
    }

    #[test]
    fn renderer_gains_sum_to_one() {
        let proj = make_test_project();
        let r = RealTimeRenderer::new(&proj, 48000);
        let gains = r.compute_gains(0.0, 0.0);
        assert_eq!(gains.len(), 2);
        let sum_sq: f32 = gains.iter().map(|g| g * g).sum();
        let norm = sum_sq.sqrt();
        assert!((norm - 1.0).abs() < 1e-3, "norm = {}", norm);
    }

    #[test]
    fn renderer_silence_when_disabled() {
        let mut proj = make_test_project();
        proj.speakers[0].enabled = false;
        proj.speakers[1].enabled = false;
        let r = RealTimeRenderer::new(&proj, 48000);
        assert_eq!(r.n_speakers(), 0);
    }

    #[test]
    fn render_block_output_size() {
        let proj = make_test_project();
        let mut r = RealTimeRenderer::new(&proj, 48000);
        let input = [0.5_f32; 256];
        let gains = r.compute_gains(0.0, 0.0);
        let mut output = vec![0.0_f32; 256 * 2];
        let written = r.render_block(&input, &gains, 1.0, &mut output);
        assert_eq!(written, 256);
    }

    #[test]
    fn render_block_no_clipping() {
        let proj = make_test_project();
        let mut r = RealTimeRenderer::new(&proj, 48000);
        let input = vec![1.0_f32; 256];
        let gains = r.compute_gains(0.0, 0.0);
        let mut output = vec![0.0_f32; 256 * 2];
        r.render_block(&input, &gains, 1.0, &mut output);

        for s in &output {
            assert!(s.abs() <= 1.0 + 1e-5, "sample {} exceeds 1.0", s);
        }
    }

    #[test]
    fn render_block_sine() {
        // Generate a sine wave input and verify output is non-trivial.
        let proj = make_test_project();
        let mut r = RealTimeRenderer::new(&proj, 48000);
        let n = 480;
        let input: Vec<f32> = (0..n)
            .map(|i| (2.0 * std::f64::consts::PI * 440.0 * i as f64 / 48000.0).sin() as f32)
            .collect();
        let gains = r.compute_gains(30.0, 0.0);
        let mut output = vec![0.0_f32; n * 2];
        r.render_block(&input, &gains, 1.0, &mut output);

        let max_val = output.iter().cloned().fold(0.0_f32, f32::max);
        assert!(max_val > 0.0, "expected non-zero output from sine");
    }

    #[test]
    fn delay_alignment_applied_correctly() {
        // Verify delay computation works - speakers at same distance have zero delay.
        // This is the key invariant: farther speakers get 0 delay (reference), closer speakers get positive delays.
        let sr = 48000u32;

        // Test: speakers at same distance
        let mut proj_same = BelugaProject::new("Same Distances");
        proj_same.room = Room::new("Room", 10.0, 5.0, 3.0);
        proj_same
            .listeners
            .push(Listener::new("L1", "Main", Vector3::new(0.0, 0.0, 1.1)));
        proj_same.active_listener_id = Some("L1".to_string());
        proj_same.speakers.push(Speaker::new(
            "S1",
            "S",
            "Bookshelf",
            Vector3::new(0.0, 2.0, 0.0),
        ));
        proj_same.speakers.push(Speaker::new(
            "S2",
            "S",
            "Bookshelf",
            Vector3::new(0.0, 2.0, 0.0),
        ));

        let r_same = RealTimeRenderer::new(&proj_same, sr);
        assert!(
            r_same.delays[0].abs() < 1e-6,
            "Same distance speakers should have 0 delay"
        );
        assert!(
            r_same.delays[1].abs() < 1e-6,
            "Same distance speakers should have 0 delay"
        );
    }

    #[test]
    fn update_speaker_positions_recomputes_delays() {
        let mut proj = make_test_project();
        let sr = 48000u32;
        let mut r = RealTimeRenderer::new(&proj, sr);

        // Move speakers (simulating drag) - closer distances
        let new_azimuths = vec![-30.0_f64, 30.0_f64];
        let new_distances = vec![1.0_f64, 1.0_f64]; // Both at same distance now

        r.update_speaker_positions(new_azimuths.clone(), new_distances);

        // Both should now have 0 delay since same distance
        assert!(r.delays[0].abs() < 1e-6, "Distance 1 should have 0 delay");
        assert!(r.delays[1].abs() < 1e-6, "Distance 1 should have 0 delay");

        // Different distances
        let new_distances2 = vec![2.0_f64, 4.0_f64];
        r.update_speaker_positions(new_azimuths, new_distances2);

        let expected = (4.0 - 2.0) / 343.0 * sr as f64;
        assert!(
            (r.delays[0] - expected).abs() < 1.0,
            "Delay should update when speaker moves"
        );
    }
}
