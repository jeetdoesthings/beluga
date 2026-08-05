"""
beluga.render — offline spatial renderer (spec §30, §56).

Turns a SpatialScene + Speaker geometry + Listener into per-speaker PCM frames.
This is the **offline** renderer for Beluga 0.1: no real-time audio, no hardware.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .delay_alignment import apply_fractional_delay, compute_delays
from .gain_management import process_output
from .gain_smoothing import SmoothingConfig, apply_smoothed_gain_per_sample
from .geometry import Orientation, Vector3, azimuth_to_unit_vector, to_listener_relative
from .scene import SpatialObject, SpatialScene
from .speaker import BelugaProject, Listener, Speaker
from .vbap import render_vbap_2d_dirs

__all__ = ["RenderSettings", "render_offline"]

SPEED_OF_SOUND = 343.0


@dataclass
class RenderSettings:
    """Settings for the offline renderer."""

    sample_rate: int = 48000
    block_size: int = 256        # samples per processing block
    headroom_db: float = -1.0   # global headroom
    smoothing: SmoothingConfig = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.smoothing is None:
            self.smoothing = SmoothingConfig(interp="linear", ramp_samples=128)


def _project_speaker_dirs(
    speakers: list[Speaker],
    listener: Listener,
) -> tuple[list[Vector3], list[float]]:
    """Compute per-speaker listener-relative unit direction vectors and distances.

    Directions are projected onto the horizontal plane (z=0) for 2D VBAP.
    Speakers that are at the listener position (distance ~0) are skipped.
    """
    dirs: list[Vector3] = []
    dists: list[float] = []
    for sp in speakers:
        if not sp.enabled:
            dirs.append(Vector3(0.0, 0.0, 0.0))
            dists.append(0.0)
            continue
        sph, _ = to_listener_relative(sp.position, listener.position, listener.orientation)
        # Project to horizontal plane unit vector
        d = azimuth_to_unit_vector(sph.azimuth)
        dirs.append(d)
        dists.append(sph.distance)
    return dirs, dists


def _direction_from_azimuth(azimuth_deg: float) -> Vector3:
    """Convert a listener-relative azimuth to a horizontal unit vector."""
    return azimuth_to_unit_vector(azimuth_deg)


def render_offline(
    project: BelugaProject,
    scene: SpatialScene,
    settings: RenderSettings | None = None,
) -> dict[str, np.ndarray]:
    """Render a SpatialScene to per-speaker PCM frames.

    Args:
      project: BelugaProject with speakers and an active listener.
      scene: SpatialScene containing one or more SpatialObjects.
      settings: RenderSettings (defaults to 48kHz, 256-sample blocks).

    Returns:
      dict mapping speaker.id -> float32 1-D numpy array of PCM samples.
    """
    if settings is None:
        settings = RenderSettings()

    listener = project.active_listener()
    if listener is None:
        raise ValueError("Project has no listener")

    active_speakers = [s for s in project.speakers if s.enabled]
    if not active_speakers:
        raise ValueError("Project has no enabled speakers")

    speaker_dirs, speaker_dists = _project_speaker_dirs(active_speakers, listener)

    # Compute per-speaker delays (so all arrivals align)
    delays = compute_delays(speaker_dists)

    n_speakers = len(active_speakers)
    sample_rate = settings.sample_rate

    # Determine total output length from the longest audio object.
    max_samples = 0
    for obj in scene.objects:
        max_samples = max(max_samples, len(obj.audio.samples))
    if max_samples == 0:
        return {sp.id: np.zeros(0, dtype=np.float32) for sp in active_speakers}

    # We render in blocks, re-computing VBAP gains each block (or per-object).
    # For 0.1, each SpatialObject contributes to each speaker.
    # Accumulate per-speaker raw buffers.
    speaker_buffers: list[np.ndarray] = [np.zeros(max_samples, dtype=np.float32) for _ in range(n_speakers)]
    prev_gains = np.zeros(n_speakers, dtype=np.float32)

    for obj in scene.objects:
        audio = obj.audio.samples
        n = len(audio)
        if n == 0:
            continue

        obj_gain = obj.gain

        # Process in blocks for gain smoothing.
        block = settings.block_size
        offset = 0
        while offset < n:
            end = min(offset + block, n)
            t = offset / sample_rate  # time at start of block
            az, _el, _dist = obj.position_at(t)
            target_dir = _direction_from_azimuth(az)

            gains = render_vbap_2d_dirs(speaker_dirs, target_dir)
            # Apply per-sample smoothing within this block.
            block_audio = audio[offset:end].copy()

            for si in range(n_speakers):
                old_g = float(prev_gains[si])
                new_g = float(gains[si]) * obj_gain
                smoothed = apply_smoothed_gain_per_sample(
                    block_audio, old_g, new_g, settings.smoothing
                )
                speaker_buffers[si][offset:end] += smoothed

            prev_gains = gains
            offset = end

    # Apply delay alignment per speaker.
    delayed: list[np.ndarray] = []
    for si in range(n_speakers):
        delayed.append(apply_fractional_delay(speaker_buffers[si], delays[si], sample_rate))

    # Pad all to the same length.
    out_len = max(len(b) for b in delayed) if delayed else 0

    # Apply gain management (headroom + soft limiter) per speaker.
    result: dict[str, np.ndarray] = {}
    for si, sp in enumerate(active_speakers):
        buf = delayed[si]
        if len(buf) < out_len:
            buf = np.pad(buf, (0, out_len - len(buf)), mode="constant")
        buf = process_output(buf, headroom_db=settings.headroom_db)
        result[sp.id] = buf

    return result