# Beluga 🐋

**A room-aware, hardware-agnostic spatial audio platform.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 90 passing](https://img.shields.io/badge/tests-90%20passing-brightgreen.svg)](#testing)

**Repository:** <https://github.com/jeetdoesthings/beluga>

Beluga transforms arbitrary speaker arrangements into the best coherent spatial playback system that the available physical hardware can produce. Instead of asking the user to place speakers according to a predefined layout (5.1, 7.1.4, etc.), Beluga builds the audio system around the room.

> **Do not build the room around the audio system. Build the audio system around the room.**

## Current status: Beluga 0.1 — Prove the mathematics

This repository is at the **0.1 milestone**: a Python research implementation that validates the core spatial-audio math with no UI, no real-time audio, and no hardware.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full project description, architecture, code module docs, and current state.

## What 0.1 includes

- Listener-relative coordinate system (azimuth, elevation, distance)
- Arbitrary speaker placement in 3D
- 2D Vector Base Amplitude Panning (VBAP)
- Smooth gain interpolation for moving sources
- Geometric distance delay alignment
- Offline per-speaker WAV export
- Automated tests verifying all calculations

## Quick start

```bash
# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install in dev mode
pip install -e ".[dev]"

# Run tests
pytest

# Demo: render a mono WAV to per-speaker outputs
python -m beluga.cli --demo
```

## Project structure

```
beluga/
  research/python/
    beluga/          # Core Python package
    tests/           # pytest unit + integration tests
  test-assets/audio/ # Sample WAV fixtures
  docs/research/     # VBAP math notes and conventions
  spec.md            # Master product & engineering specification
  ARCHITECTURE.md    # Living architecture document
```

## Roadmap

| Milestone | Goal |
|-----------|------|
| 0.1 (current) | Prove the math (Python) |
| 0.2 | Build the visual world (Tauri + Three.js) |
| 0.3 | Make sound physical (Rust real-time audio) |
| 0.4 | Geometry calibration |
| 0.5 | Music playback |
| 0.6+ | Measurement, consumer polish, immersive modes |

See `spec.md` for the complete multi-stage specification.

## Testing

```bash
source .venv/bin/activate
pytest
```

90 tests covering coordinate conversion, VBAP pair selection and gain normalization, gain smoothing, delay alignment, gain management, data model serialization, and end-to-end offline rendering. All spec §82 MVP acceptance criteria are verified by tests.

## License

[MIT](LICENSE)