//! beluga-dsp::delay_alignment — geometric distance delay (spec §35).
//! Port of `research/python/beluga/delay_alignment.py`.
//!
//! Delay closer speakers so direct arrivals align at the listener.
//!   raw_travel_time = distance / 343 m/s
//!   per_speaker_delay = (max_distance - distance) / 343 seconds
//!
//! Implemented as a fractional-sample delay using linear interpolation.

use crate::SPEED_OF_SOUND;

/// Return per-speaker delay in seconds so all arrivals align.
///
/// The farthest speaker gets 0 delay; closer speakers get positive delays
/// equal to (max_distance - distance) / SPEED_OF_SOUND.
pub fn compute_delays(distances: &[f64]) -> Vec<f64> {
    if distances.is_empty() {
        return Vec::new();
    }
    let max_d = distances.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    distances
        .iter()
        .map(|&d| (max_d - d) / SPEED_OF_SOUND)
        .collect()
}

/// Fractional-sample delay line using a ring buffer with linear interpolation.
///
/// Pre-allocated at construction — `process` never allocates.
pub struct FractionalDelay {
    buf: Vec<f32>,
    write_pos: usize,
    buf_len: usize,
}

impl FractionalDelay {
    /// Create a delay line that can handle up to `max_delay_samples` of delay.
    pub fn new(max_delay_samples: usize) -> Self {
        let buf_len = max_delay_samples + 2;
        FractionalDelay {
            buf: vec![0.0; buf_len],
            write_pos: 0,
            buf_len,
        }
    }

    /// Delay `input` by `delay_samples` (fractional), writing into `output`.
    ///
    /// `output.len()` must equal `input.len()`.
    ///
    /// Algorithm (read-then-write ring buffer):
    ///   For each input sample i:
    ///     1. Compute read_pos = write_pos - delay_samples (float)
    ///     2. idx_floor = floor(read_pos) mod buf_len
    ///     3. idx_ceil  = (idx_floor + 1) mod buf_len
    ///     4. output[i] = buf[idx_floor]*(1-frac) + buf[idx_ceil]*frac
    ///     5. buf[write_pos] = input[i]; write_pos = (write_pos+1) mod buf_len
    pub fn process(&mut self, input: &[f32], delay_samples: f64, output: &mut [f32]) {
        assert_eq!(
            input.len(),
            output.len(),
            "input and output must have equal length"
        );

        for (i, &sample) in input.iter().enumerate() {
            let out = if delay_samples <= 0.0 {
                sample
            } else {
                let read_pos = self.write_pos as f64 - delay_samples;
                let idx_floor = read_pos.floor() as isize;
                let frac = read_pos - idx_floor as f64;

                let idx_floor = (((idx_floor % self.buf_len as isize) + self.buf_len as isize)
                    % self.buf_len as isize) as usize;
                let idx_ceil = (idx_floor + 1) % self.buf_len;

                let s0 = self.buf[idx_floor];
                let s1 = self.buf[idx_ceil];
                s0 * (1.0 - frac as f32) + s1 * (frac as f32)
            };

            output[i] = out;

            self.buf[self.write_pos] = sample;
            self.write_pos = (self.write_pos + 1) % self.buf_len;
        }
    }

    /// Delay a signal by `delay_seconds` using linear interpolation.
    ///
    /// The output length grows by ceil(delay_samples) so no samples are lost.
    /// This is the standalone (non-ring-buffer) version matching the Python
    /// `apply_fractional_delay` exactly — used for offline rendering.
    pub fn apply_delay(signal: &[f32], delay_seconds: f64, sample_rate: u32) -> Vec<f32> {
        if delay_seconds <= 0.0 {
            return signal.to_vec();
        }

        let delay_samples = delay_seconds * sample_rate as f64;
        let whole = delay_samples.floor() as usize;
        let frac = delay_samples - whole as f64;

        let extra = if frac > 1e-9 { 2 } else { 1 };
        let out_len = signal.len() + whole + extra;
        let mut out = vec![0.0_f32; out_len];

        let dest_start = whole;
        let dest_end = (whole + signal.len()).min(out_len);
        for i in 0..(dest_end - dest_start) {
            out[dest_start + i] += signal[i] * (1.0 - frac as f32);
        }

        if frac > 1e-9 {
            let src_start = whole + 1;
            if src_start < out.len() {
                let dest_end2 = (src_start + signal.len()).min(out_len);
                for i in 0..(dest_end2 - src_start) {
                    out[src_start + i] += signal[i] * (frac as f32);
                }
            }
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_delays_empty() {
        let d = compute_delays(&[]);
        assert!(d.is_empty());
    }

    #[test]
    fn compute_delays_far_zero() {
        let distances = [1.0_f64, 3.0, 5.0];
        let delays = compute_delays(&distances);
        assert!(delays[2].abs() < 1e-9);
        let expected_0 = (5.0 - 1.0) / SPEED_OF_SOUND;
        assert!((delays[0] - expected_0).abs() < 1e-9);
    }

    #[test]
    fn fractional_delay_zero() {
        let input = [1.0_f32, 2.0, 3.0];
        let out = FractionalDelay::apply_delay(&input, 0.0, 48000);
        assert_eq!(out.len(), input.len());
        for i in 0..3 {
            assert!((out[i] - input[i]).abs() < 1e-6);
        }
    }

    #[test]
    fn fractional_delay_whole_samples() {
        let input = [1.0_f32, 2.0, 3.0, 4.0];
        let out = FractionalDelay::apply_delay(&input, 2.0 / 48000.0, 48000);
        // Python: len = 4 + 2 + 1 = 7 (extra=1 for no fractional part)
        assert_eq!(out.len(), 7);
        assert!(out[0].abs() < 1e-6);
        assert!(out[1].abs() < 1e-6);
        assert!((out[2] - 1.0).abs() < 1e-6);
        assert!((out[3] - 2.0).abs() < 1e-6);
        assert!((out[4] - 3.0).abs() < 1e-6);
        assert!((out[5] - 4.0).abs() < 1e-6);
        assert!(out[6].abs() < 1e-6); // trailing zero from extra=1
    }

    #[test]
    fn fractional_delay_fractional_energy() {
        let input = [1.0_f32];
        let out = FractionalDelay::apply_delay(&input, 1.5 / 48000.0, 48000);
        // Python: len = 1 + 1 + 2 = 4 (extra=2 for fractional part)
        assert_eq!(out.len(), 4);
        assert!(out[0].abs() < 1e-6); // leading zero
        assert!((out[1] - 0.5).abs() < 1e-6); // signal * (1-0.5) = 0.5
        assert!((out[2] - 0.5).abs() < 1e-6); // signal * 0.5 = 0.5
        assert!(out[3].abs() < 1e-6); // trailing zero from extra=2
    }

    #[test]
    fn ring_buffer_passthrough() {
        let mut fd = FractionalDelay::new(8);
        let input = [1.0_f32, 2.0, 3.0, 4.0];
        let mut output = vec![0.0_f32; 4];
        fd.process(&input, 0.0, &mut output);
        assert_eq!(output, input);
    }

    #[test]
    fn ring_buffer_whole_delay() {
        let mut fd = FractionalDelay::new(16);
        let input = [1.0_f32, 2.0, 3.0, 4.0];
        let mut output = vec![0.0_f32; 4];
        fd.process(&input, 2.0, &mut output);
        assert!(output[0].abs() < 1e-6);
        assert!(output[1].abs() < 1e-6);
        assert!((output[2] - 1.0).abs() < 1e-6);
        assert!((output[3] - 2.0).abs() < 1e-6);
    }

    #[test]
    fn ring_buffer_continuity() {
        let mut fd = FractionalDelay::new(16);
        let block1 = [1.0_f32, 2.0, 3.0, 4.0];
        let block2 = [10.0_f32, 20.0, 30.0, 40.0];
        let mut out1 = vec![0.0_f32; 4];
        let mut out2 = vec![0.0_f32; 4];
        fd.process(&block1, 1.0, &mut out1);
        // out1: [0, 1, 2, 3] (block1 delayed by 1, pad with 0)
        assert!((out1[0]).abs() < 1e-6);
        assert!((out1[1] - 1.0).abs() < 1e-6);
        assert!((out1[2] - 2.0).abs() < 1e-6);
        fd.process(&block2, 1.0, &mut out2);
        // out2: ring buffer continues — delay=1 reads buf[write_pos-1]
        // After block1, write_pos=4, buf=[1,2,3,4,0,…]
        // block2[0]: read at 3 → buf[3]=4, block2[1]: read at 4 → buf[4]=10
        assert!((out2[0] - 4.0).abs() < 1e-6); // block1[3] delayed by 1
        assert!((out2[1] - 10.0).abs() < 1e-6); // block2[0] delayed by 1
        assert!((out2[2] - 20.0).abs() < 1e-6); // block2[1] delayed by 1
    }
}
