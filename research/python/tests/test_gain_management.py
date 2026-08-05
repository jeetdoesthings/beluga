"""Tests for beluga.gain_management — headroom and limiting."""

import numpy as np
import pytest

from beluga.gain_management import apply_headroom, process_output, soft_limit


class TestApplyHeadroom:
    def test_scales_signal(self):
        signal = np.ones(100, dtype=np.float32)
        out = apply_headroom(signal, headroom_db=-6.0)
        factor = 10 ** (-6.0 / 20)
        assert np.allclose(out, factor, atol=1e-5)

    def test_zero_db_passthrough(self):
        signal = np.ones(10, dtype=np.float32) * 0.5
        out = apply_headroom(signal, headroom_db=0.0)
        assert np.allclose(out, 0.5, atol=1e-5)


class TestSoftLimit:
    def test_below_threshold(self):
        """Signals well below threshold pass nearly unchanged."""
        signal = np.ones(10, dtype=np.float32) * 0.3
        out = soft_limit(signal, threshold=0.99)
        assert np.allclose(out, 0.3, atol=0.02)

    def test_above_threshold_compressed(self):
        """Large signals are compressed toward 1.0 but never hard clip."""
        signal = np.ones(10, dtype=np.float32) * 5.0
        out = soft_limit(signal, threshold=0.99)
        assert np.all(out < 1.0)
        assert np.all(out > 0.9)

    def test_no_hard_clip(self):
        signal = np.ones(10, dtype=np.float32) * 100.0
        out = soft_limit(signal, threshold=0.99)
        assert np.all(out <= 1.0)
        assert np.all(np.isfinite(out))


class TestProcessOutput:
    def test_full_chain(self):
        signal = np.ones(100, dtype=np.float32) * 0.8
        out = process_output(signal, headroom_db=-1.0, threshold=0.99)
        assert np.all(np.isfinite(out))
        assert np.all(out <= 1.0)
        # headroom then tanh limiter: out = tanh(headroom_signal/threshold)*threshold
        headroom_signal = 0.8 * 10 ** (-1.0 / 20)
        expected = np.tanh(headroom_signal / 0.99) * 0.99
        assert np.allclose(out, expected, atol=0.02)