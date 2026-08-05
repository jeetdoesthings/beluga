"""
beluga.gain_smoothing — smooth gain transitions for moving sources (spec §34).

Moving virtual sources must not cause abrupt gain discontinuities, audible
clicks, or zipper noise. This module ramps gains from previous to target
values over a short window.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

__all__ = ["SmoothingConfig", "smooth_gains"]


@dataclass
class SmoothingConfig:
    """Configuration for gain smoothing.

    interp: "linear" or "exp" (exponential approach).
    ramp_samples: number of samples over which to ramp from old to new gain.
    """

    interp: str = "linear"
    ramp_samples: int = 128  # ~2.7ms at 48kHz

    def __post_init__(self) -> None:
        if self.interp not in ("linear", "exp"):
            raise ValueError(f"Unknown interp '{self.interp}', use 'linear' or 'exp'")
        if self.ramp_samples < 1:
            raise ValueError("ramp_samples must be >= 1")


def smooth_gains(
    old_gains: np.ndarray,
    new_gains: np.ndarray,
    config: SmoothingConfig,
) -> np.ndarray:
    """Produce an interpolated gain trajectory from old_gains to new_gains.

    Returns an array of shape (ramp_samples, n_speakers) where row 0 ≈
    old_gains and the ramp approaches new_gains by the final row.

    The renderer applies this per-block: the returned ramp is multiplied
    elementwise against the audio block to produce a smooth transition.
    """
    n_speakers = len(new_gains)
    if len(old_gains) != n_speakers:
        old_gains = np.zeros(n_speakers, dtype=np.float32)

    t = np.linspace(0.0, 1.0, config.ramp_samples, dtype=np.float32).reshape(-1, 1)

    if config.interp == "linear":
        ramp = old_gains[np.newaxis, :] * (1.0 - t) + new_gains[np.newaxis, :] * t
    else:  # exp
        # exponential approach: g(t) = old + (new - old) * (1 - exp(-3*t))
        # 3* is chosen so that at t=1 we are ~95% of the way.
        approach = 1.0 - np.exp(-3.0 * t)
        ramp = old_gains[np.newaxis, :] + (new_gains[np.newaxis, :] - old_gains[np.newaxis, :]) * approach

    return ramp.astype(np.float32, copy=False)


def apply_smoothed_gain_per_sample(
    block: np.ndarray,
    old_gain: float,
    new_gain: float,
    config: SmoothingConfig,
) -> np.ndarray:
    """Apply a per-sample gain ramp to a 1-D block.

    Args:
      block: 1-D float32 audio block.
      old_gain: gain at start of block.
      new_gain: gain at end of block.
      config: smoothing config.

    Returns:
      1-D float32 block with gain ramp applied.
    """
    n = len(block)
    # If the block is shorter than ramp_samples, use the block length.
    ramp_len = min(n, config.ramp_samples)
    t = np.linspace(0.0, 1.0, max(ramp_len, 1), dtype=np.float32)

    if config.interp == "linear":
        gains = old_gain * (1.0 - t) + new_gain * t
    else:
        approach = 1.0 - np.exp(-3.0 * t)
        gains = old_gain + (new_gain - old_gain) * approach

    # For samples beyond ramp_len, hold final gain.
    if n > ramp_len:
        gains = np.concatenate([gains, np.full(n - ramp_len, new_gain, dtype=np.float32)])

    return block * gains.astype(np.float32, copy=False)