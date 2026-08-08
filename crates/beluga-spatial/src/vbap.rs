//! beluga-spatial::vbap — Vector Base Amplitude Panning for 2D (spec §31–§33).
//! Port of `research/python/beluga/vbap.py`.
//!
//! For a desired source direction S and loudspeaker direction vectors L_i on
//! the horizontal plane, find the speaker pair enclosing S and solve gains:
//!
//! ```text
//! S ~= g1*L1 + g2*L2
//! ```
//!
//! using the determinant formulation, then normalize gains (energy normalization).

use beluga_core::{azimuth_to_unit_vector, Vector3};

/// Select the pair of speaker indices whose azimuths enclose the target azimuth.
///
/// Speakers are sorted by azimuth; the pair (i, j) is selected such that
/// target_azimuth is between az_i and az_j going clockwise.
/// If the target falls in the gap between the last and first speaker
/// (wrapping around), that wraparound pair is returned.
///
/// Args:
///   speaker_azimuths: slice of azimuths in degrees (-180, 180].
///   target_azimuth: desired source azimuth in degrees.
///
/// Returns:
///   tuple (i, j) of indices into the *original* speaker_azimuths slice.
pub fn select_pair(speaker_azimuths: &[f64], target_azimuth: f64) -> (usize, usize) {
    let n = speaker_azimuths.len();
    if n < 2 {
        panic!("VBAP 2D requires at least 2 speakers");
    }

    const TWO_PI: f64 = std::f64::consts::PI * 2.0;

    // Normalize to [0, 2π)
    let to_0_2pi = |a: f64| -> f64 {
        let r = (a.to_radians()) % TWO_PI;
        if r < 0.0 {
            r + TWO_PI
        } else {
            r
        }
    };

    // (rad, original_index) pairs
    let mut azs: Vec<(f64, usize)> = speaker_azimuths
        .iter()
        .enumerate()
        .map(|(idx, &a)| (to_0_2pi(a), idx))
        .collect();
    azs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let t = to_0_2pi(target_azimuth);

    for k in 0..n {
        let (a0, idx0) = azs[k];
        let (a1, idx1) = azs[(k + 1) % n];

        if a0 <= a1 {
            if a0 <= t && t <= a1 {
                return (idx0, idx1);
            }
        } else {
            // Wraps around 0
            if t >= a0 || t <= a1 {
                return (idx0, idx1);
            }
        }
    }

    // Fallback: return closest pair
    let best = azs
        .iter()
        .min_by(|a, b| (a.0 - t).abs().partial_cmp(&(b.0 - t).abs()).unwrap())
        .unwrap();
    let best_pos = azs.iter().position(|x| x.1 == best.1).unwrap();
    let next_idx = azs[(best_pos + 1) % n].1;
    (best.1, next_idx)
}

/// Solve g1, g2 such that target ≈ g1·L1 + g2·L2 using the generalized VBAP
/// determinant formulation.
///
/// Formula (generalized VBAP):
///   base = L1 × L2  (normal to the spanned plane)
///   g1 = ((target × L2) · base) / |base|^2
///   g2 = ((L1 × target) · base) / |base|^2
pub fn solve_gains(l1: &Vector3, l2: &Vector3, target: &Vector3) -> (f64, f64) {
    let base = l1.cross(l2);
    let base_norm_sq = base.dot(&base);
    if base_norm_sq < 1e-14 {
        return (0.0, 0.0);
    }

    let g1 = target.cross(l2).dot(&base) / base_norm_sq;
    let g2 = l1.cross(target).dot(&base) / base_norm_sq;
    (g1, g2)
}

/// Energy-normalize gains so sqrt(sum(g^2)) == 1. Clamp negatives to 0 first.
fn normalize_gains(gains: &mut [f64]) {
    for g in gains.iter_mut() {
        if *g < 0.0 {
            *g = 0.0;
        }
    }
    let norm: f64 = gains.iter().map(|g| g * g).sum::<f64>().sqrt();
    if norm < 1e-12 {
        for g in gains.iter_mut() {
            *g = 0.0;
        }
    } else {
        for g in gains.iter_mut() {
            *g /= norm;
        }
    }
}

/// Full 2D VBAP pipeline given speaker unit-direction vectors and a target unit vector.
///
/// Returns a Vec of length `speaker_dirs.len()` with energy-normalized gains (f32).
pub fn render_vbap_2d_dirs(speaker_dirs: &[Vector3], target_dir: &Vector3) -> Vec<f32> {
    let n = speaker_dirs.len();
    let mut gains: Vec<f64> = vec![0.0; n];

    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        // Single speaker: full gain if target has non-zero magnitude.
        if target_dir.norm() > 1e-9 {
            gains[0] = 1.0;
        }
        return gains.iter().map(|&g| g as f32).collect();
    }

    // Compute azimuths from speaker directions for pair selection.
    // azimuth = atan2(x, y) — clockwise from +Y forward (spec §7.2).
    let speaker_azs: Vec<f64> = speaker_dirs
        .iter()
        .map(|d| d.x.atan2(d.y).to_degrees())
        .collect();

    let target_az = target_dir.x.atan2(target_dir.y).to_degrees();
    let (i, j) = select_pair(&speaker_azs, target_az);
    let (g1, g2) = solve_gains(&speaker_dirs[i], &speaker_dirs[j], target_dir);

    gains[i] = g1;
    gains[j] = g2;

    normalize_gains(&mut gains);

    gains.iter().map(|&g| g as f32).collect()
}

/// Convenience: 2D VBAP from azimuths only.
///
/// Convert azimuths to unit direction vectors, then run the full pipeline.
/// Returns energy-normalized per-speaker gains.
pub fn render_vbap_2d(speaker_azimuths: &[f64], target_azimuth: f64) -> Vec<f32> {
    let speaker_dirs: Vec<Vector3> = speaker_azimuths
        .iter()
        .map(|&a| azimuth_to_unit_vector(a))
        .collect();
    let target_dir = azimuth_to_unit_vector(target_azimuth);
    render_vbap_2d_dirs(&speaker_dirs, &target_dir)
}

// ---------------------------------------------------------------------------
// Tests — mirror research/python/tests/test_vbap.py
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn select_pair_basic() {
        let azs = [0.0_f64, 90.0, 180.0, 270.0];
        // Target 45 should be between 0 and 90
        let (i, j) = select_pair(&azs, 45.0);
        assert_eq!(i, 0);
        assert_eq!(j, 1);
    }

    #[test]
    fn select_pair_wraparound() {
        let azs = [0.0_f64, 90.0, 180.0, 270.0];
        // Target 350 should be between 270 and 0 (wraparound)
        let (i, j) = select_pair(&azs, 350.0);
        // 350 deg is in the gap between 270 and 0 (wraps to 360)
        assert!((i == 3 && j == 0) || (i == 0 && j == 3));
    }

    #[test]
    fn select_pair_between_rear() {
        let azs = [0.0_f64, 90.0, 180.0, 270.0];
        let (i, j) = select_pair(&azs, 135.0);
        assert_eq!(i, 1);
        assert_eq!(j, 2);
    }

    #[test]
    fn solve_gains_orthogonal() {
        // L1 at 0 deg, L2 at 90 deg, target at 45 deg
        let l1 = azimuth_to_unit_vector(0.0); // +Y
        let l2 = azimuth_to_unit_vector(90.0); // +X
        let target = azimuth_to_unit_vector(45.0);

        let (g1, g2) = solve_gains(&l1, &l2, &target);

        // At 45 degrees between two orthogonal speakers, gains should be equal
        assert!((g1 - g2).abs() < 1e-9);
        // And each should be cos(45) = 0.7071
        assert!(
            (g1 - 0.5_f64.sqrt()).abs() < 1e-9,
            "g1 = {}, expected {}",
            g1,
            0.5_f64.sqrt()
        );
    }

    #[test]
    fn render_vbap_2d_energy_normalized() {
        let azs = [0.0_f64, 90.0, 180.0, 270.0];
        let gains = render_vbap_2d(&azs, 45.0);

        assert_eq!(gains.len(), 4);

        // Energy normalization: sqrt(sum(g^2)) == 1
        let sum_sq: f32 = gains.iter().map(|g| g * g).sum();
        let norm = sum_sq.sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "norm = {}", norm);

        // Only 2 speakers should have non-zero gain
        let active: Vec<_> = gains.iter().filter(|&&g| g > 1e-6).collect();
        assert_eq!(active.len(), 2);
    }

    #[test]
    fn render_vbap_2d_non_negative() {
        let azs = [0.0_f64, 120.0, 240.0];
        let gains = render_vbap_2d(&azs, 50.0);
        for g in &gains {
            assert!(*g >= 0.0, "gain {} is negative", g);
        }
    }

    #[test]
    fn render_vbap_2d_single_speaker() {
        let azs = [0.0_f64];
        let gains = render_vbap_2d(&azs, 45.0);
        assert_eq!(gains.len(), 1);
        assert!((gains[0] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn render_vbap_2d_reconstruction() {
        // With 2 speakers at 0 and 90, a target at 45 should give equal gains
        // that reconstruct the target direction.
        let azs = [0.0_f64, 90.0];
        let gains = render_vbap_2d(&azs, 45.0);

        let l1 = azimuth_to_unit_vector(0.0);
        let l2 = azimuth_to_unit_vector(90.0);
        let reconstructed = l1.scale(gains[0] as f64).add(&l2.scale(gains[1] as f64));
        let target = azimuth_to_unit_vector(45.0);

        let diff = reconstructed.sub(&target);
        assert!(diff.norm() < 1e-4, "reconstruction error: {}", diff.norm());
    }

    #[test]
    fn render_vbap_2d_three_speakers() {
        let azs = [0.0_f64, 120.0, 240.0];
        let gains = render_vbap_2d(&azs, 60.0);
        let sum_sq: f32 = gains.iter().map(|g| g * g).sum();
        let norm = sum_sq.sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }
}
