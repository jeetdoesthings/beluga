"""Tests for beluga.gain_smoothing — smooth gain transitions."""

import numpy as np
import pytest

from beluga.gain_smoothing import SmoothingConfig, apply_smoothed_gain_per_sample, smooth_gains


class TestSmoothingConfig:
    def test_default(self):
        c = SmoothingConfig()
        assert c.interp == "linear"
        assert c.ramp_samples == 128

    def test_exp(self):
        c = SmoothingConfig(interp="exp")
        assert c.interp == "exp"

    def test_invalid_interp(self):
        with pytest.raises(ValueError):
            SmoothingConfig(interp="cubic")

    def test_invalid_ramp(self):
        with pytest.raises(ValueError):
            SmoothingConfig(ramp_samples=0)


class TestSmoothGains:
    def test_ramp_shape(self):
        old = np.array([0.0, 0.0], dtype=np.float32)
        new = np.array([1.0, 0.5], dtype=np.float32)
        c = SmoothingConfig(ramp_samples=64)
        ramp = smooth_gains(old, new, c)
        assert ramp.shape == (64, 2)

    def test_linear_start_end(self):
        old = np.array([0.0], dtype=np.float32)
        new = np.array([1.0], dtype=np.float32)
        c = SmoothingConfig(interp="linear", ramp_samples=100)
        ramp = smooth_gains(old, new, c)
        assert abs(ramp[0, 0]) < 1e-6
        assert abs(ramp[-1, 0] - 1.0) < 1e-4

    def test_no_discontinuity(self):
        """The max per-sample delta should be small."""
        old = np.array([0.0, 1.0], dtype=np.float32)
        new = np.array([1.0, 0.0], dtype=np.float32)
        c = SmoothingConfig(ramp_samples=256)
        ramp = smooth_gains(old, new, c)
        diffs = np.abs(np.diff(ramp, axis=0))
        # Per-sample change should be small (< 0.02 for 256 samples over a 1.0 change).
        assert diffs.max() < 0.02

    def test_no_nan(self):
        old = np.array([0.0, 1.0], dtype=np.float32)
        new = np.array([1.0, 0.0], dtype=np.float32)
        c = SmoothingConfig(interp="exp", ramp_samples=128)
        ramp = smooth_gains(old, new, c)
        assert np.all(np.isfinite(ramp))


class TestApplySmoothedGainPerSample:
    def test_constant_gain(self):
        block = np.ones(256, dtype=np.float32)
        out = apply_smoothed_gain_per_sample(block, 0.5, 0.5, SmoothingConfig(ramp_samples=128))
        assert np.allclose(out, 0.5, atol=1e-5)

    def test_ramp_from_0_to_1(self):
        block = np.ones(256, dtype=np.float32)
        out = apply_smoothed_gain_per_sample(block, 0.0, 1.0, SmoothingConfig(ramp_samples=256))
        assert out[0] < 0.01
        assert out[-1] > 0.99

    def test_no_nan(self):
        block = np.ones(100, dtype=np.float32)
        out = apply_smoothed_gain_per_sample(block, 0.0, 1.0, SmoothingConfig(interp="exp", ramp_samples=128))
        assert np.all(np.isfinite(out))