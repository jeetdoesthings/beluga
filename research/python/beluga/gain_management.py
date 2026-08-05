"""
beluga.gain_management — headroom, normalization, and safety limiting (spec §67).

Spatial summation can clip. This module enforces:
  - normalized VBAP gains (energy normalization, done in vbap.py)
  - a global headroom factor to keep sums below 1.0
  - a final soft limiter (tanh) to prevent hard clipping
"""

from __future__ import annotations

import numpy as np

__all__ = ["apply_headroom", "soft_limit", "process_output"]


def apply_headroom(signal: np.ndarray, headroom_db: float = -1.0) -> np.ndarray:
    """Scale a signal by a headroom factor derived from a dB value.

    headroom_db = -1.0 → multiply by 10^(-1/20) ≈ 0.891.
    """
    factor = 10.0 ** (headroom_db / 20.0)
    return (signal * factor).astype(np.float32, copy=False)


def soft_limit(signal: np.ndarray, threshold: float = 0.99) -> np.ndarray:
    """Apply a soft limiting curve (tanh-based) to prevent hard clipping.

    Signals below threshold pass nearly unchanged; signals above are
    progressively compressed.
    """
    # tanh-based smooth limiter centered on threshold
    # For |x| < threshold: nearly linear. For |x| > threshold: compresses.
    drive = 1.0 / max(threshold, 1e-6)
    limited = np.tanh(signal * drive) / drive
    return limited.astype(np.float32, copy=False)


def process_output(
    signal: np.ndarray,
    headroom_db: float = -1.0,
    threshold: float = 0.99,
) -> np.ndarray:
    """Full output processing: headroom then soft limiter."""
    return soft_limit(apply_headroom(signal, headroom_db), threshold)