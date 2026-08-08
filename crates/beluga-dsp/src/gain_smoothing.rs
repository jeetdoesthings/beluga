//! beluga-dsp::gain_smoothing — smooth gain transitions for moving sources (spec §34).
//! Port of `research/python/beluga/gain_smoothing.py`.

/// Interpolation method for gain ramps.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Interp {
    Linear,
    Exp,
}

/// Configuration for gain smoothing.
#[derive(Clone, Copy, Debug)]
pub struct SmoothingConfig {
    pub interp: Interp,
    pub ramp_samples: usize,
}

impl Default for SmoothingConfig {
    fn default() -> Self {
        SmoothingConfig {
            interp: Interp::Linear,
            ramp_samples: 128,
        }
    }
}

impl SmoothingConfig {
    pub fn new(interp: Interp, ramp_samples: usize) -> Self {
        assert!(ramp_samples >= 1, "ramp_samples must be >= 1");
        SmoothingConfig {
            interp,
            ramp_samples,
        }
    }

    fn t_at(&self, i: usize) -> f32 {
        if self.ramp_samples <= 1 {
            1.0
        } else {
            i as f32 / (self.ramp_samples - 1) as f32
        }
    }
}

/// Produce an interpolated gain trajectory from old_gains to new_gains.
///
/// Returns a Vec of length `ramp_samples * n_speakers`, row-major:
/// row 0 = old_gains, last row approaches new_gains.
pub fn smooth_gains(old_gains: &[f32], new_gains: &[f32], config: &SmoothingConfig) -> Vec<f32> {
    let n_speakers = new_gains.len();
    let ramp = config.ramp_samples;

    let effective_old: Vec<f32> = if old_gains.len() != n_speakers {
        vec![0.0; n_speakers]
    } else {
        old_gains.to_vec()
    };

    let mut result = Vec::with_capacity(ramp * n_speakers);

    for i in 0..ramp {
        let t = config.t_at(i);
        let approach = match config.interp {
            Interp::Linear => t,
            Interp::Exp => 1.0 - (-3.0 * t).exp(),
        };

        for s in 0..n_speakers {
            let g = effective_old[s] + (new_gains[s] - effective_old[s]) * approach;
            result.push(g);
        }
    }

    result
}

/// Apply a per-sample gain ramp to a 1-D block.
///
/// `old_gain` is applied at sample 0, `new_gain` is approached by the end
/// of the ramp window. Samples beyond the ramp hold `new_gain`.
pub fn apply_smoothed_gain_per_sample(
    block: &[f32],
    old_gain: f32,
    new_gain: f32,
    config: &SmoothingConfig,
) -> Vec<f32> {
    let n = block.len();
    if n == 0 {
        return Vec::new();
    }

    let ramp_len = config.ramp_samples.min(n).max(1);

    let mut result = Vec::with_capacity(n);

    for (i, &sample) in block.iter().enumerate() {
        let t = if i >= ramp_len || ramp_len <= 1 {
            1.0
        } else {
            i as f32 / (ramp_len - 1) as f32
        };

        let approach = match config.interp {
            Interp::Linear => t,
            Interp::Exp => 1.0 - (-3.0 * t).exp(),
        };

        let gain = old_gain + (new_gain - old_gain) * approach;
        result.push(sample * gain);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config() {
        let c = SmoothingConfig::default();
        assert_eq!(c.interp, Interp::Linear);
        assert_eq!(c.ramp_samples, 128);
    }

    #[test]
    fn reject_zero_ramp() {
        let result = std::panic::catch_unwind(|| SmoothingConfig::new(Interp::Linear, 0));
        assert!(result.is_err());
    }

    #[test]
    fn smooth_gains_start_end() {
        let old = [0.0_f32, 1.0];
        let new = [1.0_f32, 0.0];
        let config = SmoothingConfig::new(Interp::Linear, 5);
        let ramp = smooth_gains(&old, &new, &config);
        assert_eq!(ramp.len(), 5 * 2);
        assert!((ramp[0] - 0.0).abs() < 1e-6);
        assert!((ramp[1] - 1.0).abs() < 1e-6);
        let last = ramp.len();
        assert!((ramp[last - 2] - 1.0).abs() < 1e-6);
        assert!((ramp[last - 1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn smooth_gains_mismatched_lengths() {
        let old = [0.5_f32];
        let new = [0.0_f32, 1.0, 0.0];
        let config = SmoothingConfig::new(Interp::Linear, 3);
        let ramp = smooth_gains(&old, &new, &config);
        assert_eq!(ramp.len(), 3 * 3);
        assert!((ramp[0] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn apply_smoothed_gain_linear() {
        let block = [1.0_f32; 10];
        let config = SmoothingConfig::new(Interp::Linear, 5);
        let result = apply_smoothed_gain_per_sample(&block, 0.0, 1.0, &config);
        assert_eq!(result.len(), 10);
        assert!(result[0].abs() < 1e-6);
        assert!((result[4] - 1.0).abs() < 1e-6);
        assert!((result[7] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn apply_smoothed_gain_no_big_jumps() {
        let block = [0.5_f32; 128];
        let config = SmoothingConfig::default();
        let result = apply_smoothed_gain_per_sample(&block, 0.0, 0.8, &config);
        for i in 1..result.len() {
            let delta = (result[i] - result[i - 1]).abs();
            assert!(delta < 0.1, "delta at {} was {}", i, delta);
        }
    }
}
