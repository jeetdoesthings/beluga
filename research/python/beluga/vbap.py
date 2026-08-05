"""
beluga.vbap — Vector Base Amplitude Panning for 2D (spec §31-§33).

For a desired source direction S and loudspeaker direction vectors L_i on
the horizontal plane, find the speaker pair enclosing S and solve gains:

    S ≈ g1·L1 + g2·L2

using the determinant formulation, then normalize gains (energy normalization).
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

from .geometry import Vector3, azimuth_to_unit_vector

__all__ = [
    "select_pair",
    "solve_gains",
    "render_vbap_2d",
    "render_vbap_2d_dirs",
]


def select_pair(speaker_azimuths: Sequence[float], target_azimuth: float) -> tuple[int, int]:
    """Select the pair of speaker indices whose azimuths enclose the target azimuth.

    Speakers are sorted by azimuth; the pair (i, j) is selected such that
    target_azimuth is between az_i and az_j going clockwise.
    If the target falls in the gap between the last and first speaker
    (wrapping around), that wraparound pair is returned.

    Args:
      speaker_azimuths: list of azimuths in degrees (-180, 180].
      target_azimuth: desired source azimuth in degrees.

    Returns:
      tuple (i, j) of indices into the *original* speaker_azimuths list.
    """
    n = len(speaker_azimuths)
    if n < 2:
        raise ValueError("VBAP 2D requires at least 2 speakers")

    # Work in radians [0, 2*pi) for clean wraparound.
    azs = [(math.radians(a) % (2 * math.pi), idx) for idx, a in enumerate(speaker_azimuths)]
    azs.sort()
    t = math.radians(target_azimuth) % (2 * math.pi)

    for k in range(n):
        a0, idx0 = azs[k]
        a1, idx1 = azs[(k + 1) % n]
        # Check if t is between a0 and a1 going clockwise.
        if a0 <= a1:
            if a0 <= t <= a1:
                return (idx0, idx1)
        else:
            # Wraps around 0
            if t >= a0 or t <= a1:
                return (idx0, idx1)

    # Fallback: return closest pair
    best = min(azs, key=lambda x: abs(x[0] - t))
    best_idx = best[1]
    next_idx = azs[(azs.index(best) + 1) % n][1]
    return (best_idx, next_idx)


def solve_gains(L1: Vector3, L2: Vector3, target: Vector3) -> tuple[float, float]:
    """Solve g1, g2 such that target ≈ g1·L1 + g2·L2 using the 2D determinant method.

    Uses the full 3D vectors but projects onto the plane spanned by L1 and L2.
    For a horizontal-plane 2D VBAP, pass vectors with z=0 or near-zero.

    Formula (generalized VBAP):
      Let base = L1 × L2  (normal to the spanned plane)
      g1 = ((target × L2) · base) / |base|^2
      g2 = ((L1 × target) · base) / |base|^2
    """
    base = L1.cross(L2)
    base_norm_sq = base.dot(base)
    if base_norm_sq < 1e-14:
        return (0.0, 0.0)

    g1 = target.cross(L2).dot(base) / base_norm_sq
    g2 = L1.cross(target).dot(base) / base_norm_sq
    return (g1, g2)


def _normalize_gains(gains: list[float]) -> list[float]:
    """Energy-normalize gains so sqrt(sum(g^2)) == 1. Clamp negatives to 0 first."""
    g = [max(0.0, gv) for gv in gains]
    norm = math.sqrt(sum(gv * gv for gv in g))
    if norm < 1e-12:
        return [0.0] * len(g)
    return [gv / norm for gv in g]


def render_vbap_2d_dirs(
    speaker_dirs: Sequence[Vector3],
    target_dir: Vector3,
) -> np.ndarray:
    """Full 2D VBAP pipeline given speaker unit-direction vectors and a target unit vector.

    Args:
      speaker_dirs: list of Vector3, each a unit direction (z assumed ~0 for 2D).
      target_dir: Vector3, unit direction of the virtual source.

    Returns:
      float32 numpy array of length len(speaker_dirs) with energy-normalized gains.
    """
    n = len(speaker_dirs)
    gains = [0.0] * n
    if n == 0:
        return np.zeros(0, dtype=np.float32)
    if n == 1:
        # Single speaker: full gain
        gains[0] = 1.0 if target_dir.norm() > 1e-9 else 0.0
        return np.array(gains, dtype=np.float32)

    # Compute azimuths from the speaker directions for pair selection.
    speaker_azs = [math.degrees(math.atan2(d.x, d.y)) for d in speaker_dirs]
    target_az = math.degrees(math.atan2(target_dir.x, target_dir.y))

    i, j = select_pair(speaker_azs, target_az)
    g1, g2 = solve_gains(speaker_dirs[i], speaker_dirs[j], target_dir)

    gains[i] = g1
    gains[j] = g2
    gains = _normalize_gains(gains)
    return np.array(gains, dtype=np.float32)


def render_vbap_2d(
    speaker_azimuths: Sequence[float],
    target_azimuth: float,
) -> np.ndarray:
    """Convenience: 2D VBAP from azimuths only.

    Args:
      speaker_azimuths: list of speaker azimuths in degrees (-180, 180].
      target_azimuth: desired source azimuth in degrees.

    Returns:
      float32 numpy array of per-speaker energy-normalized gains.
    """
    speaker_dirs = [azimuth_to_unit_vector(a) for a in speaker_azimuths]
    target_dir = azimuth_to_unit_vector(target_azimuth)
    return render_vbap_2d_dirs(speaker_dirs, target_dir)