//! beluga-dsp::gain_management — headroom, normalization, safety limiting (spec §67).
//! Port of `research/python/beluga/gain_management.py`.
//!
//! Spatial summation can clip. This enforces:
//!   - a global headroom factor to keep sums below 1.0
//!   - a final soft limiter (tanh) to prevent hard clipping

/// Scale a signal by a headroom factor derived from a dB value.
///
/// headroom_db = -1.0 → factor = 10^(-1/20) ≈ 0.891.
pub fn apply_headroom(signal: &mut [f32], headroom_db: f64) {
    let factor = 10.0_f64.powf(headroom_db / 20.0);
    let f = factor as f32;
    for s in signal.iter_mut() {
        *s *= f;
    }
}

/// Apply a soft limiting curve (tanh-based) to prevent hard clipping.
///
/// Signals below threshold pass nearly unchanged; signals above are
/// progressively compressed. The output is bounded by ±threshold.
pub fn soft_limit(signal: &mut [f32], threshold: f64) {
    let threshold_f32 = threshold.max(1e-6) as f32;
    let drive = 1.0 / threshold_f32;

    for s in signal.iter_mut() {
        let x = *s * drive;
        let limited = x.tanh() / drive;
        *s = limited;
    }
}

/// Full output processing: headroom then soft limiter.
pub fn process_output(signal: &mut [f32], headroom_db: f64, threshold: f64) {
    apply_headroom(signal, headroom_db);
    soft_limit(signal, threshold);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headroom_scaling() {
        let factor = 10.0_f64.powf(-1.0_f64 / 20.0);
        let expected = (factor * 0.5) as f32;

        let mut signal = [0.5_f32, 0.5, 0.5];
        apply_headroom(&mut signal, -1.0);

        for s in &signal {
            assert!((s - expected).abs() < 1e-6);
        }
    }

    #[test]
    fn soft_limit_never_exceeds_threshold() {
        let mut signal = [0.5_f32, 2.0, -3.0, 0.1, -10.0, 0.0];
        soft_limit(&mut signal, 0.99);

        for s in &signal {
            assert!(*s <= 1.0 + 1e-5, "value {} exceeds 1.0", s);
            assert!(*s >= -1.0 - 1e-5, "value {} below -1.0", s);
        }
    }

    #[test]
    fn soft_limit_passthrough_below_threshold() {
        let mut signal = [0.1_f32, 0.2, -0.05];
        let original = signal;
        soft_limit(&mut signal, 0.99);

        for i in 0..3 {
            // Below threshold, tanh is nearly linear — small error acceptable.
            assert!((signal[i] - original[i]).abs() < 0.01);
        }
    }

    #[test]
    fn process_output_full_chain() {
        let mut signal = [0.0_f32, 1.0, -1.0, 2.0, -2.0];
        process_output(&mut signal, -1.0, 0.99);

        for s in &signal {
            assert!(*s <= 1.0 + 1e-5);
            assert!(*s >= -1.0 - 1e-5);
        }
    }

    #[test]
    fn headroom_zero_db_unity() {
        let mut signal = [0.3_f32, 0.7];
        apply_headroom(&mut signal, 0.0);
        // factor = 10^0 = 1.0
        assert!((signal[0] - 0.3).abs() < 1e-6);
        assert!((signal[1] - 0.7).abs() < 1e-6);
    }
}
