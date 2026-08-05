"""Tests for beluga.vbap — 2D VBAP pair selection and gain solving."""

import math

import numpy as np
import pytest

from beluga.geometry import Vector3, azimuth_to_unit_vector
from beluga.vbap import render_vbap_2d, render_vbap_2d_dirs, select_pair, solve_gains


class TestSelectPair:
    def test_two_speakers(self):
        """With speakers at -45 and +45, target 0 → pair (0, 1)."""
        idx = select_pair([-45, 45], 0)
        assert set(idx) == {0, 1}

    def test_four_speakers_front(self):
        """Speakers at -45, 45, -135, 135, target 0 → front pair."""
        idx = select_pair([-45, 45, -135, 135], 0)
        assert set(idx) == {0, 1}

    def test_four_speakers_rear(self):
        """Target 180 → rear pair (2, 3)."""
        idx = select_pair([-45, 45, -135, 135], 180)
        assert set(idx) == {2, 3}

    def test_target_between_rear(self):
        """Target -170 → wrapping pair between 135 and -135 (i.e. -135,135 or 135,-135)."""
        idx = select_pair([-45, 45, -135, 135], -170)
        assert set(idx) == {2, 3}

    def test_target_between_right(self):
        """Target 30 → between -45 and 45."""
        idx = select_pair([-45, 45, -135, 135], 30)
        assert set(idx) == {0, 1}


class TestSolveGains:
    def test_source_aligned_with_speaker(self):
        """Target directly on speaker 1 → g1=1, g2=0 (after normalization g1=1)."""
        L1 = azimuth_to_unit_vector(-45)
        L2 = azimuth_to_unit_vector(45)
        target = azimuth_to_unit_vector(-45)
        g1, g2 = solve_gains(L1, L2, target)
        # g1 should be ~1, g2 ~0
        assert abs(g1 - 1.0) < 1e-4
        assert abs(g2) < 1e-4

    def test_source_between_speakers_equal(self):
        """Target exactly between -45 and +45 (azimuth 0) → equal gains."""
        L1 = azimuth_to_unit_vector(-45)
        L2 = azimuth_to_unit_vector(45)
        target = azimuth_to_unit_vector(0)
        g1, g2 = solve_gains(L1, L2, target)
        assert abs(g1 - g2) < 1e-4
        assert g1 > 0 and g2 > 0


class TestRenderVBAP2D:
    def test_output_length(self):
        gains = render_vbap_2d([-45, 45, -135, 135], 0)
        assert len(gains) == 4

    def test_normalization(self):
        """Energy normalization: sqrt(sum(g²)) == 1."""
        for az in [-170, -45, 0, 30, 90, 135, 180]:
            gains = render_vbap_2d([-45, 45, -135, 135], az)
            energy = math.sqrt(sum(g * g for g in gains))
            assert abs(energy - 1.0) < 1e-4, f"az={az}: energy={energy}, gains={gains}"

    def test_non_negative_gains(self):
        """All gains ≥ 0."""
        for az in [-170, -45, 0, 30, 90, 135, 180]:
            gains = render_vbap_2d([-45, 45, -135, 135], az)
            for g in gains:
                assert g >= -1e-9, f"az={az}: negative gain {g}"

    def test_target_on_speaker(self):
        """Target at -45° → speaker 0 gets (nearly) all the gain."""
        gains = render_vbap_2d([-45, 45, -135, 135], -45)
        assert gains[0] > 0.99

    def test_target_between_two_speakers(self):
        """Target at 0° → gains split between speakers 0 and 1 only."""
        gains = render_vbap_2d([-45, 45, -135, 135], 0)
        assert gains[0] > 0
        assert gains[1] > 0
        assert gains[2] < 1e-4
        assert gains[3] < 1e-4

    def test_two_speaker_stereo(self):
        """Classic stereo: speakers at -30 and +30, source at 0 → equal gains."""
        gains = render_vbap_2d([-30, 30], 0)
        assert abs(gains[0] - gains[1]) < 1e-3
        assert abs(math.sqrt(gains[0]**2 + gains[1]**2) - 1.0) < 1e-4

    def test_moving_source_no_nan(self):
        """Sweep around and ensure no NaN/Inf."""
        for az_deg in range(-180, 181, 5):
            gains = render_vbap_2d([-45, 45, -135, 135], float(az_deg))
            assert np.all(np.isfinite(gains))

    def test_reconstruction_accuracy(self):
        """The weighted sum of speaker direction vectors should approximate the target direction."""
        speaker_azs = [-45, 45, -135, 135]
        speaker_dirs = [azimuth_to_unit_vector(a) for a in speaker_azs]
        for target_az in [-40, -20, 0, 20, 40, 100, -100, 170]:
            gains = render_vbap_2d(speaker_azs, float(target_az))
            target = azimuth_to_unit_vector(float(target_az))
            # Reconstruct: sum of g_i * L_i
            recon = Vector3(0, 0, 0)
            for g, d in zip(gains, speaker_dirs):
                recon = recon + d.scale(float(g))
            # The reconstructed vector should point roughly in the target direction.
            # Compare angles.
            recon_az = math.degrees(math.atan2(recon.x, recon.y))
            # Normalize
            while recon_az > 180:
                recon_az -= 360
            while recon_az <= -180:
                recon_az += 360
            # For directions that fall exactly on a speaker, this should be very close.
            # For directions between speakers, the azimuth should match well.
            diff = abs(recon_az - target_az)
            diff = min(diff, 360 - diff)
            assert diff < 1.0, f"target={target_az} recon={recon_az} diff={diff}"