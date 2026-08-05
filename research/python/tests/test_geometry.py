"""Tests for beluga.geometry — coordinate conversion, azimuth, elevation, distance."""

import math

import pytest

from beluga.geometry import (
    Orientation,
    Spherical,
    Vector3,
    azimuth_to_unit_vector,
    to_listener_relative,
)


class TestVector3:
    def test_add(self):
        assert Vector3(1, 2, 3) + Vector3(4, 5, 6) == Vector3(5, 7, 9)

    def test_sub(self):
        assert Vector3(5, 7, 9) - Vector3(1, 2, 3) == Vector3(4, 5, 6)

    def test_scale(self):
        assert Vector3(1, 2, 3).scale(2) == Vector3(2, 4, 6)

    def test_dot(self):
        assert Vector3(1, 0, 0).dot(Vector3(0, 1, 0)) == 0
        assert Vector3(1, 2, 3).dot(Vector3(4, 5, 6)) == 32

    def test_cross(self):
        assert Vector3(1, 0, 0).cross(Vector3(0, 1, 0)) == Vector3(0, 0, 1)

    def test_norm(self):
        assert abs(Vector3(3, 4, 0).norm() - 5.0) < 1e-9

    def test_normalize(self):
        n = Vector3(3, 4, 0).normalize()
        assert abs(n.norm() - 1.0) < 1e-9

    def test_normalize_zero(self):
        assert Vector3(0, 0, 0).normalize() == Vector3(0, 0, 0)


class TestToListenerRelative:
    def test_speaker_directly_in_front(self):
        """Speaker at +Y 2m, listener at origin facing +Y → azimuth 0°, dist 2m, elev 0°."""
        sph, v = to_listener_relative(
            Vector3(0, 2, 0), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        assert abs(sph.distance - 2.0) < 1e-6
        assert abs(sph.azimuth) < 1e-6
        assert abs(sph.elevation) < 1e-6

    def test_speaker_to_the_right(self):
        """Speaker at +X 2m → azimuth +90°."""
        sph, _ = to_listener_relative(
            Vector3(2, 0, 0), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        assert abs(sph.distance - 2.0) < 1e-6
        assert abs(sph.azimuth - 90.0) < 1e-4
        assert abs(sph.elevation) < 1e-6

    def test_speaker_directly_left(self):
        """Speaker at -X 2m → azimuth -90°."""
        sph, _ = to_listener_relative(
            Vector3(-2, 0, 0), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        assert abs(sph.azimuth + 90.0) < 1e-4

    def test_speaker_behind(self):
        """Speaker at -Y 2m → azimuth ±180°."""
        sph, _ = to_listener_relative(
            Vector3(0, -2, 0), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        assert abs(abs(sph.azimuth) - 180.0) < 1e-4

    def test_elevation_above(self):
        """Speaker at +Z 2m → elevation +90°."""
        sph, _ = to_listener_relative(
            Vector3(0, 0, 2), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        assert abs(sph.elevation - 90.0) < 1e-4
        assert abs(sph.distance - 2.0) < 1e-6

    def test_elevation_at_45(self):
        """Speaker at (0, 1, 1) → elevation +45°."""
        sph, _ = to_listener_relative(
            Vector3(0, 1, 1), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        assert abs(sph.elevation - 45.0) < 1e-4
        assert abs(sph.azimuth) < 1e-4

    def test_3d_distance(self):
        sph, _ = to_listener_relative(
            Vector3(1, 2, 3), Vector3(0, 0, 0), Orientation(yaw=0)
        )
        expected = math.sqrt(1 + 4 + 9)
        assert abs(sph.distance - expected) < 1e-6

    def test_listener_offset(self):
        """Listener at (1,1,0) facing +Y, speaker at (1,3,0) → distance 2, azimuth 0."""
        sph, _ = to_listener_relative(
            Vector3(1, 3, 0), Vector3(1, 1, 0), Orientation(yaw=0)
        )
        assert abs(sph.distance - 2.0) < 1e-6
        assert abs(sph.azimuth) < 1e-4

    def test_listener_yaw_90(self):
        """Listener rotated 90° clockwise (yaw=90). Speaker at world +X is now 'forward' → azimuth 0°."""
        sph, _ = to_listener_relative(
            Vector3(2, 0, 0), Vector3(0, 0, 0), Orientation(yaw=90)
        )
        assert abs(sph.azimuth) < 1e-4
        assert abs(sph.distance - 2.0) < 1e-6

    def test_listener_yaw_90_speaker_still_forward_of_world(self):
        """Listener yaw=90, speaker at world +Y 2m → should be at -90° (listener's left)."""
        sph, _ = to_listener_relative(
            Vector3(0, 2, 0), Vector3(0, 0, 0), Orientation(yaw=90)
        )
        assert abs(sph.azimuth + 90.0) < 1e-4

    def test_listener_yaw_neg90(self):
        """Listener yaw=-90 (turned left), speaker at world -X → forward → az 0."""
        sph, _ = to_listener_relative(
            Vector3(-2, 0, 0), Vector3(0, 0, 0), Orientation(yaw=-90)
        )
        assert abs(sph.azimuth) < 1e-4

    def test_listener_pitch_up(self):
        """Listener pitch up 90°, speaker at world +Z → forward → az 0, elev 0."""
        sph, _ = to_listener_relative(
            Vector3(0, 0, 2), Vector3(0, 0, 0), Orientation(pitch=90)
        )
        # With pitch=90, forward (+Y) rotates to +Z, so speaker at +Z is now "forward".
        assert abs(sph.azimuth) < 1e-4
        assert abs(sph.elevation) < 1e-4


class TestAzimuthToUnitVector:
    def test_zero_azimuth(self):
        v = azimuth_to_unit_vector(0)
        assert abs(v.x) < 1e-9
        assert abs(v.y - 1.0) < 1e-9

    def test_90_azimuth(self):
        v = azimuth_to_unit_vector(90)
        assert abs(v.x - 1.0) < 1e-9
        assert abs(v.y) < 1e-9

    def test_neg90_azimuth(self):
        v = azimuth_to_unit_vector(-90)
        assert abs(v.x + 1.0) < 1e-9
        assert abs(v.y) < 1e-9

    def test_180_azimuth(self):
        v = azimuth_to_unit_vector(180)
        assert v.y < 0
        assert abs(v.x) < 1e-9