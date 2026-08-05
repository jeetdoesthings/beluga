"""Tests for beluga.scene — SpatialObject and SpatialScene."""

import numpy as np
import pytest

from beluga.scene import AudioBuffer, SpatialObject, SpatialScene


class TestAudioBuffer:
    def test_basic(self):
        samples = np.ones(100, dtype=np.float32)
        ab = AudioBuffer(samples=samples, sample_rate=48000)
        assert len(ab.samples) == 100
        assert ab.sample_rate == 48000
        assert abs(ab.duration - 100 / 48000) < 1e-9

    def test_auto_mono(self):
        stereo = np.zeros((100, 2), dtype=np.float32)
        stereo[:, 0] = 0.5
        stereo[:, 1] = 0.5
        ab = AudioBuffer(samples=stereo, sample_rate=48000)
        assert ab.samples.ndim == 1
        assert len(ab.samples) == 100

    def test_float32(self):
        samples = np.ones(10, dtype=np.float64)
        ab = AudioBuffer(samples=samples, sample_rate=48000)
        assert ab.samples.dtype == np.float32


class TestSpatialObject:
    def test_static_position(self):
        audio = AudioBuffer(np.zeros(10, dtype=np.float32), 48000)
        obj = SpatialObject(id="s1", audio=audio, azimuth=30.0, elevation=0.0, distance=2.0)
        az, el, dist = obj.position_at(0.5)
        assert az == 30.0
        assert el == 0.0
        assert dist == 2.0

    def test_trajectory(self):
        audio = AudioBuffer(np.zeros(10, dtype=np.float32), 48000)
        traj = lambda t: (t * 100, 0.0, 2.0)
        obj = SpatialObject(id="s1", audio=audio, trajectory=traj)
        az, el, dist = obj.position_at(1.0)
        assert az == 100.0
        assert el == 0.0
        assert dist == 2.0


class TestSpatialScene:
    def test_empty(self):
        scene = SpatialScene()
        assert len(scene.objects) == 0
        assert len(scene.beds) == 0

    def test_with_objects(self):
        audio = AudioBuffer(np.zeros(10, dtype=np.float32), 48000)
        obj = SpatialObject(id="s1", audio=audio)
        scene = SpatialScene(objects=[obj])
        assert len(scene.objects) == 1
        d = scene.to_dict()
        assert "objects" in d