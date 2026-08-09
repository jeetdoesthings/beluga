"""End-to-end integration tests: mono WAV → N speaker WAVs (spec §56, §82)."""

import math
import tempfile
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from beluga.export import export_speaker_wavs, load_mono_wav
from beluga.geometry import Orientation, Vector3
from beluga.render import RenderSettings, render_offline
from beluga.scene import AudioBuffer, SpatialObject, SpatialScene
from beluga.speaker import BelugaProject, Listener, Room, Speaker


def _make_test_project(n_speakers: int = 4) -> BelugaProject:
    listener = Listener(
        name="Main",
        position=Vector3(0, 0, 1.1),
        orientation=Orientation(yaw=0),
    )
    angles = [-45, 45, -135, 135][:n_speakers]
    radius = 2.0
    speakers = []
    for i, az in enumerate(angles):
        a = math.radians(az)
        speakers.append(
            Speaker(
                name=f"S{i+1}",
                position=Vector3(radius * math.sin(a), radius * math.cos(a), 1.1),
                orientation=Orientation(yaw=az),
            )
        )
    return BelugaProject(
        name="E2E Test",
        room=Room(name="Test", length=5, width=4, height=2.8),
        speakers=speakers,
        listeners=[listener],
        active_listener_id=listener.id,
    )


def _make_test_audio(duration: float = 1.0, sr: int = 48000) -> AudioBuffer:
    t = np.linspace(0, duration, int(duration * sr), endpoint=False, dtype=np.float32)
    samples = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    return AudioBuffer(samples=samples, sample_rate=sr)


class TestEndToEnd:
    def test_render_outputs(self):
        project = _make_test_project(4)
        audio = _make_test_audio(1.0)
        obj = SpatialObject(id="src", audio=audio, azimuth=0.0, distance=2.0, gain=0.8)
        scene = SpatialScene(objects=[obj])
        settings = RenderSettings(sample_rate=48000)
        per_speaker = render_offline(project, scene, settings)
        assert len(per_speaker) == 4
        for sp_id, pcm in per_speaker.items():
            assert isinstance(pcm, np.ndarray)
            assert pcm.dtype == np.float32
            assert len(pcm) >= len(audio.samples)

    def test_no_clipping(self):
        """Output should never hard clip (no samples > 1.0)."""
        project = _make_test_project(4)
        audio = _make_test_audio(1.0)
        obj = SpatialObject(id="src", audio=audio, azimuth=0.0, distance=2.0, gain=1.0)
        scene = SpatialScene(objects=[obj])
        per_speaker = render_offline(project, scene, RenderSettings())
        for pcm in per_speaker.values():
            assert np.all(np.abs(pcm) <= 1.0 + 1e-6), "Hard clip detected"

    def test_export_wavs(self):
        project = _make_test_project(4)
        audio = _make_test_audio(0.5)
        obj = SpatialObject(id="src", audio=audio, azimuth=0.0, distance=2.0, gain=0.8)
        scene = SpatialScene(objects=[obj])
        per_speaker = render_offline(project, scene, RenderSettings(sample_rate=48000))

        with tempfile.TemporaryDirectory() as tmp:
            paths = export_speaker_wavs(per_speaker, 48000, tmp)
            assert len(paths) == 4
            for p in paths:
                assert Path(p).exists()
                data, sr = sf.read(p, dtype="float32")
                assert sr == 48000
                assert len(data) > 0
                assert np.all(np.isfinite(data))

    def test_static_source_gain_distribution(self):
        """Source at azimuth 0 with speakers at ±45 → front two speakers get gain."""
        project = _make_test_project(4)
        audio = _make_test_audio(0.1)
        obj = SpatialObject(id="src", audio=audio, azimuth=0.0, distance=2.0, gain=1.0)
        scene = SpatialScene(objects=[obj])
        per_speaker = render_offline(project, scene, RenderSettings(sample_rate=48000))

        sp_ids = [s.id for s in project.speakers]
        # Speakers 0 (−45) and 1 (+45) should have signal; 2,3 should be near-silent.
        front_0 = np.max(np.abs(per_speaker[sp_ids[0]]))
        front_1 = np.max(np.abs(per_speaker[sp_ids[1]]))
        rear_2 = np.max(np.abs(per_speaker[sp_ids[2]]))
        rear_3 = np.max(np.abs(per_speaker[sp_ids[3]]))

        assert front_0 > 0.01
        assert front_1 > 0.01
        assert rear_2 < 0.01
        assert rear_3 < 0.01

    def test_moving_source_smooth(self):
        """A sweeping source should produce smooth gain transitions (no NaNs, no huge jumps)."""
        project = _make_test_project(4)
        audio = _make_test_audio(2.0)
        duration = 2.0
        sweep = lambda t: (-180.0 + 360.0 * t / duration, 0.0, 2.0)
        obj = SpatialObject(id="src", audio=audio, trajectory=sweep, gain=0.8)
        scene = SpatialScene(objects=[obj])
        per_speaker = render_offline(project, scene, RenderSettings(sample_rate=48000))

        for pcm in per_speaker.values():
            assert np.all(np.isfinite(pcm)), "NaN/Inf in output"
            # No sample-to-sample discontinuity larger than a reasonable threshold
            if len(pcm) > 1:
                diffs = np.abs(np.diff(pcm))
                # Allow some change but flag extreme discontinuities (clicks)
                assert np.max(diffs) < 0.5, f"Large discontinuity: {np.max(diffs)}"

    def test_load_and_render_wav(self, tmp_path):
        """Write a test WAV, load it, render, and verify output files match duration."""
        sr = 48000
        samples = (0.5 * np.sin(2 * np.pi * 220 * np.linspace(0, 0.5, int(0.5 * sr), endpoint=False))).astype(np.float32)
        wav_path = tmp_path / "input.wav"
        sf.write(str(wav_path), samples, sr, subtype="FLOAT")

        loaded, loaded_sr = load_mono_wav(wav_path)
        assert loaded_sr == sr
        assert len(loaded) == len(samples)

        audio = AudioBuffer(samples=loaded, sample_rate=sr)
        project = _make_test_project(2)
        obj = SpatialObject(id="src", audio=audio, azimuth=0.0, distance=2.0, gain=0.8)
        scene = SpatialScene(objects=[obj])
        per_speaker = render_offline(project, scene, RenderSettings(sample_rate=sr))

        with tempfile.TemporaryDirectory() as out_dir:
            paths = export_speaker_wavs(per_speaker, sr, out_dir)
            assert len(paths) == 2
            for p in paths:
                data, _ = sf.read(p, dtype="float32")
                assert len(data) >= len(samples)

    def test_stereo_wav_averaged_to_mono(self, tmp_path):
        """Stereo WAV input should be averaged to mono and load the same length."""
        sr = 48000
        n = 4800
        left = (0.5 * np.sin(2 * np.pi * 220 * np.linspace(0, 0.1, n, endpoint=False))).astype(np.float32)
        right = (0.5 * np.sin(2 * np.pi * 330 * np.linspace(0, 0.1, n, endpoint=False))).astype(np.float32)
        stereo_data = np.stack([left, right], axis=1)
        wav_path = tmp_path / "stereo.wav"
        sf.write(str(wav_path), stereo_data, sr, subtype="FLOAT")

        loaded, loaded_sr = load_mono_wav(wav_path)
        assert loaded_sr == sr
        assert len(loaded) == n  # Same sample count, averaged to mono
        assert loaded.dtype == np.float32

        # Verify the averaged result
        expected = ((left + right) / 2.0).astype(np.float32)
        np.testing.assert_allclose(loaded, expected, atol=1e-6)