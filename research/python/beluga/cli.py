"""
beluga.cli — command-line demo entry point (spec §45, §56, §57).

Generates a mono sine test signal, creates a demo speaker layout,
defines a moving virtual source (azimuth sweep), renders offline,
and exports per-speaker WAVs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from .export import export_speaker_wavs, load_mono_wav
from .geometry import Orientation, Vector3
from .render import RenderSettings, render_offline
from .scene import AudioBuffer, SpatialObject, SpatialScene
from .speaker import BelugaProject, Listener, Room, Speaker


def _generate_sine(duration: float = 2.0, freq: float = 440.0, sr: int = 48000) -> AudioBuffer:
    t = np.linspace(0, duration, int(duration * sr), endpoint=False, dtype=np.float32)
    samples = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return AudioBuffer(samples=samples, sample_rate=sr)


def _make_demo_project() -> BelugaProject:
    """Create a 4-speaker rectangular layout with a centered listener."""
    room = Room(name="Demo Room", length=5.0, width=4.0, height=2.8)
    listener = Listener(
        name="Main Listener",
        position=Vector3(0.0, 0.0, 1.1),
        orientation=Orientation(yaw=0.0),
        ear_height=1.10,
    )
    speakers = [
        Speaker(
            name="FL",
            category="Bookshelf",
            position=Vector3(-1.5, 2.0, 1.1),
            orientation=Orientation(yaw=-30.0),
        ),
        Speaker(
            name="FR",
            category="Bookshelf",
            position=Vector3(1.5, 2.0, 1.1),
            orientation=Orientation(yaw=30.0),
        ),
        Speaker(
            name="RL",
            category="Bookshelf",
            position=Vector3(-1.5, -2.0, 1.1),
            orientation=Orientation(yaw=-150.0),
        ),
        Speaker(
            name="RR",
            category="Bookshelf",
            position=Vector3(1.5, -2.0, 1.1),
            orientation=Orientation(yaw=150.0),
        ),
    ]
    return BelugaProject(
        name="Demo",
        room=room,
        speakers=speakers,
        listeners=[listener],
        active_listener_id=listener.id,
    )


def _azimuth_sweep(t: float, duration: float = 2.0) -> tuple[float, float, float]:
    """Sweep azimuth from -180 to +180 over `duration` seconds."""
    az = -180.0 + (360.0 * t / duration) if duration > 0 else 0.0
    # Normalize to (-180, 180]
    while az > 180.0:
        az -= 360.0
    while az <= -180.0:
        az += 360.0
    return (az, 0.0, 2.0)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="beluga-render",
        description="Beluga 0.1 offline spatial renderer — render a mono source to per-speaker WAVs.",
    )
    parser.add_argument("--demo", action="store_true", help="Use built-in demo (4-speaker sweep)")
    parser.add_argument("--input", type=str, help="Path to mono input WAV (overrides --demo sine generator)")
    parser.add_argument("--config", type=str, help="Path to BelugaProject JSON config")
    parser.add_argument("--output", type=str, default="output", help="Output directory for per-speaker WAVs")
    parser.add_argument("--sr", type=int, default=48000, help="Sample rate (Hz)")
    parser.add_argument("--duration", type=float, default=2.0, help="Demo sine duration (seconds)")
    parser.add_argument("--freq", type=float, default=440.0, help="Demo sine frequency (Hz)")
    args = parser.parse_args(argv)

    # Load or generate audio
    if args.input:
        samples, sr = load_mono_wav(args.input)
        audio = AudioBuffer(samples=samples, sample_rate=sr)
    else:
        audio = _generate_sine(duration=args.duration, freq=args.freq, sr=args.sr)
        sr = args.sr

    # Load or create project
    if args.config:
        project = BelugaProject.load(args.config)
    else:
        project = _make_demo_project()

    # Build scene with a moving virtual source
    duration = len(audio.samples) / audio.sample_rate
    sweep_fn = lambda t: _azimuth_sweep(t, duration)
    obj = SpatialObject(
        id="source_1",
        audio=audio,
        trajectory=sweep_fn,
        gain=0.8,
    )
    scene = SpatialScene(objects=[obj], metadata={"mode": "demo_sweep"})

    # Render
    settings = RenderSettings(sample_rate=audio.sample_rate)
    per_speaker = render_offline(project, scene, settings)

    # Export
    names = {sp.id: sp.name for sp in project.speakers}
    paths = export_speaker_wavs(per_speaker, audio.sample_rate, args.output, speaker_names=names)

    print(f"Rendered {len(paths)} speaker channels at {audio.sample_rate} Hz")
    spk_names = {sp.id: sp.name for sp in project.speakers}
    for p in paths:
        print(f"  {p}")
    print(f"Duration: {duration:.2f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())