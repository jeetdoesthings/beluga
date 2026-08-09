//! beluga-audio-io::engine — Real-time audio engine with CPAL.
//!
//! Wraps a CPAL output stream with a strict no-block callback. The renderer
//! is NOT coupled to CoreAudio directly — CPAL provides the abstraction.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use beluga_core::BelugaProject;
use beluga_dsp::process_output;
use beluga_spatial::RealTimeRenderer;

use crate::mapping::ChannelMapping;

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct SourcePosition {
    pub azimuth: f64,
    pub elevation: f64,
    pub distance: f64,
}

impl Default for SourcePosition {
    fn default() -> Self {
        SourcePosition {
            azimuth: 0.0,
            elevation: 0.0,
            distance: 2.0,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Telemetry {
    pub speaker_gains: Vec<f32>,
    pub speaker_delays_ms: Vec<f64>,
    pub playhead_samples: usize,
    pub playing: bool,
    pub source_len: usize,
    pub sample_rate: u32,
    pub n_channels: u32,
    pub elapsed_ms: u64,
}

const MAX_BLOCK: usize = 16384;

struct SharedState {
    source: Arc<Vec<f32>>,
    source_len: Arc<AtomicUsize>,
    playhead: Arc<AtomicUsize>,
    playing: Arc<AtomicBool>,
    speaker_gains: Arc<Mutex<Vec<f32>>>,
    /// Per-speaker calibration gain multipliers (default: 1.0).
    speaker_cal_gains: Arc<Mutex<Vec<f32>>>,
    renderer: Arc<Mutex<RealTimeRenderer>>,
    mapping: ChannelMapping,
    sample_rate: u32,
    n_channels: u32,
    start_time: Arc<Mutex<Option<Instant>>>,
    /// Last output block for level matching measurements.
    last_output: Arc<Mutex<Vec<f32>>>,
}

pub struct AudioEngine {
    shared: SharedState,
    source_pos_rx: Option<mpsc::Receiver<SourcePosition>>,
    source_pos_tx: mpsc::Sender<SourcePosition>,
    _host: cpal::Host,
    _stream: Option<cpal::Stream>,
    _device: cpal::Device,
}

impl AudioEngine {
    pub fn new(
        project: &BelugaProject,
        device: cpal::Device,
        mapping: ChannelMapping,
    ) -> Result<Self, String> {
        let host = cpal::default_host();
        let sample_rate = 48000u32;
        let n_channels = mapping.n_output_channels.max(1);

        let renderer = RealTimeRenderer::new(project, sample_rate);
        let n_speakers = renderer.n_speakers();

        let (pos_tx, pos_rx) = mpsc::channel::<SourcePosition>();
        let _ = pos_tx.send(SourcePosition::default());

        let shared = SharedState {
            source: Arc::new(Vec::new()),
            source_len: Arc::new(AtomicUsize::new(0)),
            playhead: Arc::new(AtomicUsize::new(0)),
            playing: Arc::new(AtomicBool::new(false)),
            speaker_gains: Arc::new(Mutex::new(vec![0.0; n_speakers])),
            speaker_cal_gains: Arc::new(Mutex::new(vec![1.0; n_speakers])),
            renderer: Arc::new(Mutex::new(renderer)),
            mapping,
            sample_rate,
            n_channels,
            start_time: Arc::new(Mutex::new(None)),
            last_output: Arc::new(Mutex::new(Vec::new())),
        };

        Ok(AudioEngine {
            shared,
            source_pos_rx: Some(pos_rx),
            source_pos_tx: pos_tx,
            _host: host,
            _stream: None,
            _device: device,
        })
    }

    pub fn load_source(&mut self, samples: &[f32], sample_rate: u32) {
        self.shared.source = Arc::new(samples.to_vec());
        self.shared
            .source_len
            .store(samples.len(), Ordering::Relaxed);
        if sample_rate > 0 {
            self.shared.sample_rate = sample_rate;
            let mut r = self.shared.renderer.lock().unwrap();
            r.sample_rate = sample_rate;
        }
    }

    pub fn start(&mut self) -> Result<(), String> {
        let rx = self
            .source_pos_rx
            .take()
            .ok_or("AudioEngine::start called twice without stop")?;

        let config = self
            ._device
            .default_output_config()
            .map_err(|e| format!("Device config error: {}", e))?;

        let stream_config = cpal::StreamConfig {
            channels: config.channels(),
            sample_rate: config.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        let sample_rate = self.shared.sample_rate;
        let n_channels = self.shared.n_channels;
        let source = Arc::clone(&self.shared.source);
        let source_len = Arc::clone(&self.shared.source_len);
        let playhead = Arc::clone(&self.shared.playhead);
        let playing = Arc::clone(&self.shared.playing);
        let speaker_gains = Arc::clone(&self.shared.speaker_gains);
        let speaker_cal_gains = Arc::clone(&self.shared.speaker_cal_gains);
        let renderer = Arc::clone(&self.shared.renderer);
        let mapping = self.shared.mapping.clone();
        let start_time = Arc::clone(&self.shared.start_time);
        let last_output = Arc::clone(&self.shared.last_output);

        let err_fn = |err: cpal::StreamError| {
            eprintln!("[beluga-audio-io] stream error: {}", err);
        };

        let stream = self
            ._device
            .build_output_stream::<f32, _, _>(
                &stream_config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    audio_callback(
                        data,
                        &source,
                        &source_len,
                        &playhead,
                        &playing,
                        &speaker_gains,
                        &speaker_cal_gains,
                        &renderer,
                        &mapping,
                        &rx,
                        sample_rate,
                        n_channels,
                        &start_time,
                        &last_output,
                    );
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to play stream: {}", e))?;

        self.shared.playhead.store(0, Ordering::Relaxed);
        self.shared.playing.store(true, Ordering::Relaxed);
        *self.shared.start_time.lock().unwrap() = Some(Instant::now());

        self._stream = Some(stream);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.shared.playing.store(false, Ordering::Relaxed);
        self._stream = None;
        let (tx, rx) = mpsc::channel::<SourcePosition>();
        self.source_pos_tx = tx;
        self.source_pos_rx = Some(rx);
    }

    pub fn set_source_position(&self, pos: SourcePosition) -> Result<(), String> {
        self.source_pos_tx
            .send(pos)
            .map_err(|e| format!("Failed to send position: {}", e))
    }

    /// Update speaker positions in the renderer (non-blocking, thread-safe).
    /// Called when the user drags a speaker in the 3D viewport.
    pub fn set_speaker_positions(
        &self,
        azimuths: Vec<f64>,
        distances: Vec<f64>,
    ) -> Result<(), String> {
        let mut r = self.shared.renderer.lock().unwrap();
        r.update_speaker_positions(azimuths, distances);
        Ok(())
    }

    /// Set a per-speaker calibration gain (for level matching).
    pub fn set_speaker_cal_gain(&self, speaker_index: usize, gain: f32) -> Result<(), String> {
        let mut cal = self.shared.speaker_cal_gains.lock().unwrap();
        if speaker_index >= cal.len() {
            return Err(format!(
                "Speaker index {} out of range ({} speakers)",
                speaker_index,
                cal.len()
            ));
        }
        cal[speaker_index] = gain;
        Ok(())
    }

    /// Get the current per-speaker calibration gains.
    pub fn speaker_cal_gains(&self) -> Vec<f32> {
        self.shared.speaker_cal_gains.lock().unwrap().clone()
    }

    pub fn set_playing(&self, playing: bool) {
        self.shared.playing.store(playing, Ordering::Relaxed);
    }

    pub fn playhead_samples(&self) -> usize {
        self.shared.playhead.load(Ordering::Relaxed)
    }

    pub fn sample_rate(&self) -> u32 {
        self.shared.sample_rate
    }

    pub fn n_channels(&self) -> u32 {
        self.shared.n_channels
    }

    pub fn n_speakers(&self) -> usize {
        self.shared.renderer.lock().unwrap().n_speakers()
    }

    /// Compute RMS levels for each speaker from the last output block.
    /// Returns None if no audio has been rendered yet.
    pub fn level_match(&self) -> Option<Vec<f64>> {
        let output = self.shared.last_output.lock().unwrap();
        if output.is_empty() {
            return None;
        }
        let n_speakers = self.shared.mapping.n_output_channels as usize;
        let n_frames = output.len() / n_speakers;
        if n_frames == 0 {
            return None;
        }

        let mut rms = Vec::with_capacity(n_speakers);
        for si in 0..n_speakers {
            let ch: Vec<f32> = output[si * n_frames..(si + 1) * n_frames].to_vec();
            let sum_sq: f64 = ch.iter().map(|s| *s as f64 * *s as f64).sum();
            rms.push((sum_sq / n_frames as f64).sqrt());
        }
        Some(rms)
    }

    pub fn telemetry(&self) -> Telemetry {
        let gains = self.shared.speaker_gains.lock().unwrap();
        let ph = self.shared.playhead.load(Ordering::Relaxed);
        let playing = self.shared.playing.load(Ordering::Relaxed);
        let sl = self.shared.source_len.load(Ordering::Relaxed);

        // Get delay info from renderer.
        let delays_ms = {
            let r = self.shared.renderer.lock().unwrap();
            r.delays
                .iter()
                .map(|d| d / r.sample_rate as f64 * 1000.0)
                .collect::<Vec<f64>>()
        };

        let elapsed_ms = {
            let st = self.shared.start_time.lock().unwrap();
            if let Some(t) = st.as_ref() {
                if playing {
                    t.elapsed().as_millis() as u64
                } else {
                    0
                }
            } else {
                0
            }
        };

        Telemetry {
            speaker_gains: gains.clone(),
            speaker_delays_ms: delays_ms,
            playhead_samples: ph,
            playing,
            source_len: sl,
            sample_rate: self.shared.sample_rate,
            n_channels: self.shared.n_channels,
            elapsed_ms,
        }
    }

    /// Open a CPAL device by id (name). "default" opens the system default.
    pub fn open_device(id: &str) -> Result<cpal::Device, String> {
        let host = cpal::default_host();
        if id == "default" || id.is_empty() {
            return host
                .default_output_device()
                .ok_or("No default output device found".to_string());
        }
        for dev in host
            .output_devices()
            .map_err(|e| format!("Device enumeration error: {}", e))?
        {
            if dev.name().map(|n| n == id).unwrap_or(false) {
                return Ok(dev);
            }
        }
        Err(format!("Device '{}' not found", id))
    }

    /// Query a device's default output channel count.
    pub fn device_channels(device: &cpal::Device) -> Result<u16, String> {
        device
            .default_output_config()
            .map(|c| c.channels())
            .map_err(|e| format!("Device config error: {}", e))
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.shared.playing.store(false, Ordering::Relaxed);
        if self._stream.take().is_some() {
            // Dropping the stream stops the audio callback.
        }
    }
}

/// The CPAL audio callback (operates on f32 buffer).
///
/// NO BLOCKING on the audio thread.
#[allow(clippy::too_many_arguments)]
fn audio_callback(
    output: &mut [f32],
    source: &Arc<Vec<f32>>,
    source_len: &Arc<AtomicUsize>,
    playhead: &Arc<AtomicUsize>,
    playing: &Arc<AtomicBool>,
    speaker_gains: &Arc<Mutex<Vec<f32>>>,
    speaker_cal_gains: &Arc<Mutex<Vec<f32>>>,
    renderer: &Arc<Mutex<RealTimeRenderer>>,
    mapping: &ChannelMapping,
    source_pos_rx: &mpsc::Receiver<SourcePosition>,
    _sample_rate: u32,
    n_channels: u32,
    _start_time: &Arc<Mutex<Option<Instant>>>,
    last_output: &Arc<Mutex<Vec<f32>>>,
) {
    let n_frames = output.len() / n_channels as usize;
    if n_frames == 0 {
        return;
    }

    // 1. Non-blocking: drain position channel, keep latest.
    let mut current_pos = SourcePosition::default();
    while let Ok(pos) = source_pos_rx.try_recv() {
        current_pos = pos;
    }

    // 2. Check playing state and source bounds.
    let playing_now = playing.load(Ordering::Relaxed);
    let src_len = source_len.load(Ordering::Relaxed).min(source.len());
    let ph = playhead.load(Ordering::Relaxed);

    if !playing_now || ph >= src_len || src_len == 0 {
        for s in output.iter_mut() {
            *s = 0.0;
        }
        return;
    }

    // 3. Read input block from source at playhead (mono).
    let end = (ph + n_frames).min(src_len);
    let input = &source[ph..end];

    // Stack buffer for input block (zeroed beyond input length).
    // Guard against unexpectedly large CPAL buffers to avoid panic.
    if n_frames > MAX_BLOCK {
        for s in output.iter_mut() {
            *s = 0.0;
        }
        return;
    }
    let mut block_buf = [0.0f32; MAX_BLOCK];
    let copy_len = input.len().min(MAX_BLOCK);
    block_buf[..copy_len].copy_from_slice(&input[..copy_len]);

    // 4. Compute VBAP gains, render per-speaker, update telemetry.
    let n_speakers;
    let mut speaker_output: Vec<f32>;

    {
        let mut r = renderer.lock().unwrap();
        n_speakers = r.n_speakers();

        if n_speakers == 0 {
            for s in output.iter_mut() {
                *s = 0.0;
            }
            return;
        }

        let gains = r.compute_gains(current_pos.azimuth, current_pos.elevation);

        {
            let mut tg = speaker_gains.lock().unwrap();
            tg.clear();
            tg.extend_from_slice(&gains);
        }

        let total = n_frames * n_speakers;
        speaker_output = vec![0.0f32; total];
        r.render_block(&block_buf[..n_frames], &gains, 1.0, &mut speaker_output);
    }

    // 5. Apply output processing (headroom + soft limiter) per speaker,
    //    including per-speaker calibration gains for level matching.
    let cal_gains = speaker_cal_gains.lock().unwrap();
    for (si, ch) in speaker_output.chunks_mut(n_frames).enumerate() {
        if si < cal_gains.len() {
            let cal = cal_gains[si];
            for s in ch.iter_mut() {
                *s *= cal;
            }
        }
        process_output(ch, -1.0, 0.99);
    }
    drop(cal_gains);

    // 6. Interleave per-speaker output into CPAL output buffer using mapping.
    for s in output.iter_mut() {
        *s = 0.0;
    }

    for (si, ch_idx) in mapping.speaker_to_channel.iter().enumerate() {
        if si < n_speakers && *ch_idx < n_channels as usize {
            let data = &speaker_output[si * n_frames..(si + 1) * n_frames];
            for f in 0..n_frames {
                output[f * n_channels as usize + ch_idx] = data[f];
            }
        }
    }

    // 7. Update playhead.
    playhead.store(end, Ordering::Relaxed);

    // 8. Store output for level matching (non-blocking, replace in-place).
    let mut lo = last_output.lock().unwrap();
    *lo = output.to_vec();
}

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
    fn source_position_default() {
        let p = SourcePosition::default();
        assert_eq!(p.azimuth, 0.0);
    }

    #[test]
    fn engine_construction_without_audio() {
        let proj = make_test_project();
        let host = cpal::default_host();
        if let Some(device) = host.default_output_device() {
            let mapping = ChannelMapping::auto(2, 2);
            let engine = AudioEngine::new(&proj, device, mapping);
            assert!(engine.is_ok());
            let engine = engine.unwrap();
            let n = 480;
            let samples: Vec<f32> = (0..n)
                .map(|i| (2.0 * std::f64::consts::PI * 440.0 * i as f64 / 48000.0).sin() as f32)
                .collect();
            let mut engine = engine;
            engine.load_source(&samples, 48000);
            assert_eq!(engine.playhead_samples(), 0);
            assert_eq!(engine.sample_rate(), 48000);
            assert_eq!(engine.n_speakers(), 2);
            let tel = engine.telemetry();
            assert_eq!(tel.source_len, n);
            assert!(!tel.playing);
        }
    }

    #[test]
    fn engine_set_source_position() {
        let proj = make_test_project();
        let host = cpal::default_host();
        if let Some(device) = host.default_output_device() {
            let mapping = ChannelMapping::auto(2, 2);
            if let Ok(engine) = AudioEngine::new(&proj, device, mapping) {
                let result = engine.set_source_position(SourcePosition {
                    azimuth: 45.0,
                    elevation: 0.0,
                    distance: 2.0,
                });
                assert!(result.is_ok());
            }
        }
    }
}
