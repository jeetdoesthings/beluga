"""Tests for beluga.delay_alignment — geometric delay and fractional delay."""

import numpy as np
import pytest

from beluga.delay_alignment import SPEED_OF_SOUND, apply_fractional_delay, compute_delays


class TestComputeDelays:
    def test_equal_distances(self):
        delays = compute_delays([2.0, 2.0, 2.0])
        assert all(d == 0.0 for d in delays)

    def test_far_speaker_zero_delay(self):
        delays = compute_delays([1.0, 3.0, 2.0])
        assert delays[1] == 0.0  # farthest
        assert delays[0] > 0    # closer
        assert delays[2] > 0

    def test_expected_delay(self):
        delays = compute_delays([1.0, 3.0])
        expected = (3.0 - 1.0) / SPEED_OF_SOUND
        assert abs(delays[0] - expected) < 1e-9

    def test_empty(self):
        assert compute_delays([]) == []


class TestFractionalDelay:
    def test_zero_delay(self):
        signal = np.ones(100, dtype=np.float32)
        out = apply_fractional_delay(signal, 0.0, 48000)
        assert np.allclose(out, signal)

    def test_integer_sample_delay(self):
        """Delay of 1 sample at 48kHz → 1 sample shift."""
        signal = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        out = apply_fractional_delay(signal, 1.0 / 48000, 48000)
        assert len(out) >= 5
        assert out[0] == 0.0
        assert abs(out[1] - 1.0) < 1e-5
        # rest should be near-zero
        assert abs(out[2]) < 1e-5
        assert abs(out[3]) < 1e-5

    def test_fractional_delay(self):
        """Delay of 1.5 samples → energy split between samples 1 and 2."""
        signal = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        out = apply_fractional_delay(signal, 1.5 / 48000, 48000)
        assert abs(out[1] - 0.5) < 1e-4
        assert abs(out[2] - 0.5) < 1e-4

    def test_negative_delay_clamped(self):
        signal = np.ones(10, dtype=np.float32)
        out = apply_fractional_delay(signal, -0.001, 48000)
        assert np.allclose(out, signal)

    def test_output_longer(self):
        signal = np.ones(100, dtype=np.float32)
        out = apply_fractional_delay(signal, 0.01, 48000)  # 480 samples delay
        assert len(out) > 100