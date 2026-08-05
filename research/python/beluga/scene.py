"""
beluga.scene — Beluga's universal spatial scene representation (spec §29).

A SpatialScene is the hardware-independent internal representation that the
renderer consumes. Any input (mono WAV, stereo, future object-audio) is
converted into a SpatialScene before rendering.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

__all__ = [
    "AudioBuffer",
    "SpatialObject",
    "SpatialScene",
]


@dataclass
class AudioBuffer:
    """A mono PCM audio buffer (32-bit float samples).

    `samples` is a 1-D numpy float32 array.
    `sample_rate` is in Hz.
    """

    samples: np.ndarray
    sample_rate: int

    def __post_init__(self) -> None:
        if not isinstance(self.samples, np.ndarray):
            self.samples = np.asarray(self.samples, dtype=np.float32)
        if self.samples.ndim != 1:
            # flatten multi-channel by averaging to mono
            if self.samples.ndim == 2:
                self.samples = self.samples.mean(axis=1)
            self.samples = np.ravel(self.samples)
        self.samples = self.samples.astype(np.float32, copy=False)

    @property
    def duration(self) -> float:
        return len(self.samples) / self.sample_rate

    def to_dict(self) -> dict:
        return {
            "sample_rate": self.sample_rate,
            "num_samples": int(len(self.samples)),
            "duration": self.duration,
        }


@dataclass
class SpatialObject:
    """A single virtual spatial audio source (spec §29).

    For 0.1, objects may be static (fixed azimuth/elevation/distance) or
    carry a trajectory function that returns (azimuth, elevation, distance)
    for a given time in seconds. If `trajectory` is set, it overrides the
    static `azimuth`/`elevation`/`distance` fields.
    """

    id: str
    audio: AudioBuffer
    azimuth: float = 0.0        # degrees, listener-relative
    elevation: float = 0.0      # degrees
    distance: float = 2.0       # meters
    width: float = 0.0           # 0..1 spatial width (future)
    spread: float = 0.0          # 0..1 spread (future)
    gain: float = 1.0            # linear gain
    trajectory: Any | None = None  # callable(t_seconds) -> (az, el, dist) | None

    def position_at(self, t: float) -> tuple[float, float, float]:
        """Return (azimuth, elevation, distance) at time t (seconds)."""
        if self.trajectory is not None:
            return self.trajectory(t)
        return (self.azimuth, self.elevation, self.distance)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "azimuth": self.azimuth,
            "elevation": self.elevation,
            "distance": self.distance,
            "width": self.width,
            "spread": self.spread,
            "gain": self.gain,
            "audio": self.audio.to_dict(),
            "has_trajectory": self.trajectory is not None,
        }


@dataclass
class SpatialScene:
    """A Beluga Spatial Scene (spec §29): objects[] + beds[] + metadata.

    For 0.1 we only populate `objects`. `beds` (channel-based beds) arrive later.
    """

    objects: list[SpatialObject] = field(default_factory=list)
    beds: list[Any] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "objects": [o.to_dict() for o in self.objects],
            "beds": self.beds,
            "metadata": self.metadata,
        }