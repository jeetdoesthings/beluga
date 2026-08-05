"""
beluga.geometry — 3D vector math and listener-relative coordinate conversion.

Conventions (spec §8, §18):
  - Right-handed coordinate frame: +X right, +Y forward, +Z up.
  - World units: 1 unit = 1 meter.
  - Listener forward: +Y in local frame before rotation.
  - Azimuth: degrees clockwise from listener-forward, range (-180, 180].
  - Elevation: degrees above horizontal plane, range [-90, 90].
"""

from __future__ import annotations

import math
from dataclasses import dataclass

__all__ = [
    "Vector3",
    "Orientation",
    "Spherical",
    "to_listener_relative",
]


@dataclass(frozen=True)
class Vector3:
    """A 3D vector in meters within Beluga's coordinate frame."""

    x: float
    y: float
    z: float

    # ---- basic vector ops ----
    def __add__(self, other: "Vector3") -> "Vector3":
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: "Vector3") -> "Vector3":
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)

    def scale(self, s: float) -> "Vector3":
        return Vector3(self.x * s, self.y * s, self.z * s)

    def dot(self, other: "Vector3") -> float:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: "Vector3") -> "Vector3":
        return Vector3(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )

    def norm(self) -> float:
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    def normalize(self) -> "Vector3":
        n = self.norm()
        if n < 1e-12:
            return Vector3(0.0, 0.0, 0.0)
        return Vector3(self.x / n, self.y / n, self.z / n)

    def to_tuple(self) -> tuple[float, float, float]:
        return (self.x, self.y, self.z)

    def to_list(self) -> list[float]:
        return [self.x, self.y, self.z]


@dataclass(frozen=True)
class Orientation:
    """Listener/speaker orientation in degrees (yaw, pitch, roll).

    yaw   = rotation around Z (vertical), clockwise from +Y forward
    pitch = rotation around X (right), positive = looking up
    roll  = rotation around Y (forward), positive = tilting right
    """

    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0

    def to_dict(self) -> dict:
        return {"yaw": self.yaw, "pitch": self.pitch, "roll": self.roll}

    @staticmethod
    def from_dict(d: dict) -> "Orientation":
        return Orientation(
            yaw=d.get("yaw", 0.0),
            pitch=d.get("pitch", 0.0),
            roll=d.get("roll", 0.0),
        )


@dataclass(frozen=True)
class Spherical:
    """Listener-relative spherical coordinates for a speaker or source."""

    distance: float   # meters
    azimuth: float    # degrees, clockwise from forward, (-180, 180]
    elevation: float  # degrees above horizontal, [-90, 90]

    def __repr__(self) -> str:
        return (
            f"Spherical(distance={self.distance:.4g} m, "
            f"azimuth={self.azimuth:.4g}°, elevation={self.elevation:.4g}°)"
        )


def _rot_z(vec: Vector3, angle_deg: float) -> Vector3:
    """Rotate a vector around the Z axis (yaw). Clockwise when viewed from above (+Z down)."""
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    # For a right-handed frame with +Y forward and +X right:
    # yaw rotation (clockwise from above) sends +Y toward +X as yaw increases.
    # x' = x*cos + y*sin
    # y' = -x*sin + y*cos
    return Vector3(
        vec.x * cos_a + vec.y * sin_a,
        -vec.x * sin_a + vec.y * cos_a,
        vec.z,
    )


def _rot_x(vec: Vector3, angle_deg: float) -> Vector3:
    """Rotate a vector around the X axis (pitch)."""
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    # y' = y*cos - z*sin
    # z' = y*sin + z*cos
    return Vector3(
        vec.x,
        vec.y * cos_a - vec.z * sin_a,
        vec.y * sin_a + vec.z * cos_a,
    )


def _rot_y(vec: Vector3, angle_deg: float) -> Vector3:
    """Rotate a vector around the Y axis (roll)."""
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    # x' = x*cos + z*sin
    # z' = -x*sin + z*cos
    return Vector3(
        vec.x * cos_a + vec.z * sin_a,
        vec.y,
        -vec.x * sin_a + vec.z * cos_a,
    )


def _apply_inverse_orientation(vec: Vector3, orient: Orientation) -> Vector3:
    """Apply inverse of the orientation rotation to vec.

    For Beluga, we rotate the world-relative vector INTO the listener's local frame
    so that the listener's forward direction maps to +Y.  The listener orientation
    describes how the listener is rotated relative to the world, so to go
    world->local we rotate by the *negated* yaw/pitch/roll in reverse order.
    """
    v = _rot_y(vec, -orient.roll)
    v = _rot_x(v, -orient.pitch)
    v = _rot_z(v, -orient.yaw)
    return v


def to_listener_relative(
    position: Vector3,
    listener_position: Vector3,
    listener_orientation: Orientation,
) -> tuple[Spherical, Vector3]:
    """Convert a room-space position into listener-relative spherical coords.

    Returns (Spherical, local_frame_vector).

    Steps (spec §18):
      1. rel = position - listener_position
      2. Rotate rel by inverse listener orientation -> local frame vector.
      3. distance = |v|
      4. azimuth = atan2(v.x, v.y) in degrees, clockwise from forward (+Y)
      5. elevation = atan2(v.z, sqrt(v.x^2 + v.y^2)) in degrees
    """
    rel = position - listener_position
    v = _apply_inverse_orientation(rel, listener_orientation)

    distance = v.norm()
    xy = math.sqrt(v.x * v.x + v.y * v.y)
    azimuth = math.degrees(math.atan2(v.x, v.y))  # clockwise from +Y
    elevation = math.degrees(math.atan2(v.z, xy)) if xy > 1e-12 else (90.0 if v.z > 0 else -90.0)

    # Normalize azimuth to (-180, 180]
    if azimuth > 180.0:
        azimuth -= 360.0
    elif azimuth <= -180.0:
        azimuth += 360.0

    return Spherical(distance, azimuth, elevation), v


def azimuth_to_unit_vector(azimuth_deg: float) -> Vector3:
    """Convert an azimuth (degrees, clockwise from +Y forward) to a unit direction vector on the horizontal plane (z=0)."""
    a = math.radians(azimuth_deg)
    return Vector3(math.sin(a), math.cos(a), 0.0).normalize()