"""
beluga.delay_alignment — geometric distance delay (spec §35).

Delay closer speakers so direct arrivals align at the listener.
  raw_travel_time = distance / 343 m/s
  per_speaker_delay = (max_distance - distance) / 343 seconds

Applied as fractional-sample delay using linear interpolation.
"""

from __future__ import annotations

import numpy as np

SPEED_OF_SOUND = 343.0  # m/s

__all__ = ["compute_delays", "apply_fractional_delay"]


def compute_delays(distances: list[float]) -> list[float]:
    """Return per-speaker delay in seconds so all arrivals align.

    Args:
      distances: list of speaker-to-listener distances in meters.

    Returns:
      list of delays in seconds. The farthest speaker gets 0 delay.
    """
    if not distances:
        return []
    max_d = max(distances)
    return [(max_d - d) / SPEED_OF_SOUND for d in distances]


def apply_fractional_delay(
    signal: np.ndarray,
    delay_seconds: float,
    sample_rate: int,
) -> np.ndarray:
    """Delay a 1-D signal by delay_seconds using linear interpolation.

    A delay of 0 returns the signal unchanged. Negative delays are clamped to 0.

    The output length grows by ceil(delay_samples) so no samples are lost.
    """
    signal = np.asarray(signal, dtype=np.float32)
    if delay_seconds <= 0:
        return signal

    delay_samples = delay_seconds * sample_rate
    whole = int(np.floor(delay_samples))
    frac = delay_samples - whole

    # Output has room for the integer shift plus a possible fractional extra sample.
    extra = 2 if frac > 1e-9 else 1
    out = np.zeros(len(signal) + whole + extra, dtype=np.float32)

    # Place the signal starting at index `whole`.
    if whole < len(out):
        out[whole : whole + len(signal)] += signal * (1.0 - frac)

    # Add the fractional-shifted-by-one copy.
    if frac > 1e-9 and whole + 1 < len(out):
        out[whole + 1 : whole + 1 + len(signal)] += signal * frac

    return out