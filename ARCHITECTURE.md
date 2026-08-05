# Beluga — Living Architecture Document

> **This document evolves with the project.** It explains what Beluga is, how it is built, what each code module does, and the current state of the project. Update it whenever the architecture changes.

---

## 1. What Beluga Is

**Beluga is a room-aware spatial audio renderer designed for arbitrary loudspeaker geometries.**

Traditional surround systems begin with a predefined layout (5.1, 7.1.4, etc.) and ask the user to place speakers accordingly. Beluga reverses the relationship: it starts with the user's actual room, the speakers they actually own, where those speakers physically fit, and where the listener actually sits. It then determines what spatial sound field that physical arrangement can reproduce.

**Core abstraction:** a speaker is an independently controllable acoustic actuator at a known 3D location, not a predefined semantic channel like "Front Left."

**Core technical problem:**

> Given N independently controllable loudspeakers at arbitrary positions, a listener at a known position and orientation, and optional acoustic measurements of the room, calculate in real time the loudspeaker signals that best approximate a desired spatial audio scene.

**Key principle:**

> Do not build the room around the audio system. Build the audio system around the room.

**What Beluga is NOT:** a Dolby Atmos decoder, a codec, an AVR emulator, an amplifier, a streaming service, a speaker manufacturer, or an AI remix tool. It is a rendering and calibration layer between audio content and physical playback hardware.

---

## 2. System Layers (target architecture)

Conceptually, the mature Beluga system has four layers.

```
AUDIO CONTENT  →  BELUGA  →  PHYSICAL AUDIO OUTPUTS  →  SPEAKERS

Layer A: Content      Mono/stereo/FLAC/multichannel PCM / future object-based
                        ↓
Layer B: Spatial Scene Beluga's hardware-independent internal representation
                        ↓
Layer C: Rendering    Knows geometry, calibration, room; computes per-speaker signals
                        ↓
Layer D: Physical Output  Independent PCM streams to CoreAudio/USB/HDMI/...
```

- **Layer A (Content)** answers: *What audio exists, and where should it ideally exist?*
- **Layer B (Spatial Scene)** converts any input into Beluga's universal `SpatialScene` representation.
- **Layer C (Rendering)** knows speaker geometry, listener geometry, calibration, and room info. It calculates the optimal signal for each physical speaker. This is Beluga's core intellectual asset.
- **Layer D (Physical Output)** sends independent PCM streams to available endpoints.

---

## 3. Roadmap Overview

Beluga is built incrementally. Each milestone has a clear goal and acceptance criteria (see `spec.md`).

| Milestone | Goal | Key deliverables | Status |
|-----------|------|-----------------|--------|
| 0.1 | Prove the mathematics | Python research implementation: listener coordinates, 2D VBAP, offline WAV export, tests | ✅ **Complete** |
| 0.2 | Build the visual world | Tauri + React + Three.js: room viewer, speaker/listener placement, listener view | ⬜ Not started |
| 0.3 | Make sound physical | Rust real-time renderer, CoreAudio/CPAL, device enumeration, real-time VBAP | ⬜ Not started |
| 0.4 | Geometry calibration | Distance/delay alignment, level matching, capability analysis | ⬜ Not started |
| 0.5 | Music playback | WAV/FLAC stereo pipeline, Faithful Mode | ⬜ Not started |
| 0.6 | Measure reality | Mic input, calibration sweep, impulse response, parametric EQ | ⬜ Not started |
| 0.7 | Consumer-quality setup | Wizards, project bundles, polished UX | ⬜ Not started |
| 0.8 | Immersive stereo | Mid/Side, correlation, ambience extraction, immersion slider | ⬜ Not started |
| 0.9+ | Research frontier | System audio capture, network speakers, AI spatial, head tracking, iOS companion | ⬜ Not started |

---

## 4. Current State (Beluga 0.1)

**Goal:** Validate the core math with no UI and no real-time audio.

**What's being built:**

- Listener-relative coordinate system (azimuth, elevation, distance)
- Arbitrary speaker placement in 3D
- 2D Vector Base Amplitude Panning (VBAP)
- Smooth gain interpolation for moving sources
- Geometric distance delay alignment
- Offline per-speaker WAV export
- Comprehensive automated tests

**Acceptance criteria (spec §82):**
- Arbitrary speaker XYZ positions are accepted ✅
- Listener XYZ + orientation accepted ✅
- Source position accepted ✅
- Listener-relative coordinates are correct ✅
- 2D VBAP produces valid normalized gains ✅
- Source movement produces smooth transitions ✅
- Per-speaker WAVs can be exported ✅
- Tests verify calculations ✅ (90 tests, all passing)

---

## 5. Repository Structure

```
beluga/
  research/python/
    beluga/               # Core Python package (sync with §6 below)
      __init__.py
      geometry.py         # Vector3, listener-relative conversion
      speaker.py          # Speaker, Listener, BelugaProject data models
      scene.py            # SpatialScene, SpatialObject
      vbap.py              # 2D VBAP pair selection + gain solving
      gain_smoothing.py   # Smooth gain ramps for moving sources
      delay_alignment.py  # Geometric distance delay
      gain_management.py  # Headroom, normalization, safety limiter
      render.py           # Offline renderer producing per-speaker PCM
      export.py           # WAV file writer
      cli.py              # Command-line demo entry point
    tests/                # pytest unit + integration tests
  test-assets/audio/      # Sample WAV fixtures
  docs/research/          # VBAP math notes and conventions
  spec.md                 # Master product & engineering specification
  ARCHITECTURE.md         # This living document
  README.md               # Project overview and quick start
  pyproject.toml          # Python package config
```

Target structure for later milestones (from spec §58, not yet created):

```
  apps/desktop/           # Tauri desktop app (0.2+)
  crates/                 # Rust crates (0.3+)
    beluga-core/
    beluga-spatial/
    beluga-dsp/
    beluga-audio-io/
    beluga-calibration/
    beluga-room/
  packages/
    ui/
    shared-types/
  docs/                    # Formal documentation
    product/
    architecture/
    dsp/
    research/
```

---

## 6. Code Module Reference

> Each module below is part of the `research/python/beluga/` package.

### beluga/geometry.py — 3D vector math and listener-relative conversion

**Responsibility:** coordinate transforms that convert room-space positions into listener-relative spherical coordinates (azimuth, elevation, distance).

**Key types:**
- `Vector3(x, y, z)` — basic 3D vector with add, sub, scale, dot, cross, norm, normalize
- `Orientation(yaw, pitch, roll)` — degrees-based rotation (0.1 simplicity; quaternion later)

**Key functions:**
- `to_listener_relative(position, listener) -> (distance, azimuth, elevation, rel_pos)` — translate speaker position into listener's local coordinate frame using listener position + orientation, then compute spherical coordinates.

**Conventions:**
- World units: 1 unit = 1 meter.
- Coordinate frame: right-handed (X right, Y forward, Z up).
- Azimuth: degrees clockwise from listener-forward (−180 to +180).
- Elevation: degrees above horizontal plane (−90 to +90).
- Listener forward direction: +Y in local frame.

### beluga/speaker.py — Data models for speakers, listeners, projects

**Key types:**

```python
@dataclass
class Speaker:
    id: str
    name: str
    category: str          # "Generic", "Bookshelf", "Floorstanding", ...
    position: Vector3      # room-space meters
    orientation: Orientation  # yaw/pitch/roll degrees
    enabled: bool = True

@dataclass
class Listener:
    id: str
    name: str
    position: Vector3
    orientation: Orientation
    ear_height: float      # meters

@dataclass
class BelugaProject:
    room: Room
    speakers: list[Speaker]
    listener: Listener
    ...
```

Supports JSON serialization (to_dict / from_dict / save / load) per spec §60/§61.

### beluga/scene.py — Spatial scene representation

The hardware-agnostic internal scene model (spec §29):

```python
@dataclass
class SpatialObject:
    id: str
    audio: AudioBuffer      # mono PCM reference
    azimuth: float          # degrees, listener-relative
    elevation: float        # degrees
    distance: float         # meters
    width: float            # 0..1 spatial width
    spread: float           # 0..1 spread
    gain: float             # linear gain

@dataclass
class SpatialScene:
    objects: list[SpatialObject]
    metadata: dict
```

### beluga/vbap.py — Vector Base Amplitude Panning (2D)

**Responsibility:** for a desired source direction and a set of speaker directions (all on the horizontal plane around the listener), compute per-speaker gains.

**Algorithm (spec §31–§33):**
1. Project speaker positions to listener-relative unit direction vectors on the horizontal plane.
2. For target azimuth θ, find the pair of adjacent speakers enclosing θ.
3. Solve g1, g2 so that source vector S ≈ g1·L1 + g2·L2.
4. Normalize gains using L2 (energy) normalization.

**Key functions:**
- `select_pair(speaker_dirs, target_dir) -> (int, int)` — returns indices of enclosing speaker pair.
- `solve_gains(L1, L2, target) -> (g1, g2)` — solve the linear system.
- `render_vbap_2d(speaker_dirs, target_azimuth) -> np.ndarray[gains]` — full pipeline returning normalized gain vector for all speakers.

### beluga/gain_smoothing.py — Smooth gain transitions

**Responsibility:** prevent audible clicks/discontinuities when the virtual source moves.

**Approach:**
- Each speaker's gain ramps linearly (or exponentially) from the previous gain to the newly-computed target over a short window (e.g., 5–20ms).
- Same module will support exponential interpolation; configured by `SmoothingConfig(interp="linear"|"exp", ramp_samples=128)`.

### beluga/delay_alignment.py — Geometric distance delay

**Responsibility:** delay closer speakers so direct arrivals align at the listener (spec §35).

**Approach:**
- For each speaker: raw travel time = distance / 343 m/s.
- Reference = farthest speaker.
- Per-speaker delay = (max_distance − speaker_distance) / 343 seconds.
- Implement as fractional-sample delay with linear interpolation for 0.1 accuracy.

### beluga/gain_management.py — Headroom and safety

**Responsibility:** ensure spatial summation never clips (spec §67).

**Approach:**
- Normalize VBAP gains (energy normalization).
- Apply global headroom factor (scalar) to keep sum below 1.0.
- Soft safety limiter (tanh or soft clipper) as final stage — no hard clipping.

### beluga/render.py — Offline renderer

**Responsibility:** turn a `SpatialScene` + `SpeakerGeometry` + `Listener` into per-speaker PCM frames (spec §30, §56).

**Pipeline:**
1. Compute speaker directions in listener-relative frame.
2. Per spatial object: compute source direction on horizontal plane.
3. Run `render_vbap_2d(...)` → per-speaker gains.
4. Apply gain smoothing.
5. Multiply audio buffer by smoothed gains → per-speaker contribution.
6. Sum contributions from all spatial objects → per-speaker buffers.
7. Apply delay alignment.
8. Apply gain management (headroom, limiter).
9. Return dict of speaker_id → float32 PCM numpy array.

**Key functions:**
- `render_offline(project, scene, sample_rate=48000) -> dict[str, np.ndarray]`

### beluga/export.py — WAV file writer

**Responsibility:** write per-speaker PCM frames to 32-bit float WAV files.

Uses `soundfile` (libsndfile) for robust float WAV support.

**Key functions:**
- `export_speaker_wavs(per_speaker_pcm, sample_rate, output_dir)` — writes `speaker_<index>.wav`.

### beluga/cli.py — Command-line demo entry point

**Responsibility:** provide a working demo proving the 0.1 math:

- Generate or load a mono WAV.
- Create a BelugaProject with N speakers at user-specified or demo positions.
- Define a moving virtual source trajectory (azimuth sweep).
- Render offline.
- Export per-speaker WAVs.

**Key functions:**
- `main()` — argparse entry point invoked by `beluga-render` console script.

---

## 7. Core Math Notes

### 7.1 Coordinate system

- Right-handed: +X right, +Y forward, +Z up.
- 1 unit = 1 meter (spec §8).
- Listener forward is derived from listener orientation; default +Y.

### 7.2 Listener-relative conversion (§18)

For speaker world position P and listener at position L_p with orientation (yaw, pitch, roll):

1. rel = P − L_p
2. Rotate rel by inverse listener yaw (and pitch/roll for full 3D) to get local-frame vector v.
3. distance = |v|
4. azimuth = atan2(v.x, v.y)   (clockwise from forward, in degrees)
5. elevation = atan2(v.z, sqrt(v.x^2 + v.y^2))

### 7.3 2D VBAP (§31–§33)

Given loudspeaker unit direction vectors L_1..L_N on the horizontal plane and target unit vector S (also horizontal):

1. Sort speakers by azimuth.
2. Find pair (i, j) such that target azimuth ∈ [az_i, az_j].
3. Let L_i, L_j be the 2D (or 3D) unit direction vectors. Form linear system:
   S = g1·L_i + g2·L_j   (vector equation)
4. Durbin-Vaughan formula:
   g1 = det([S, L_j]) / det([L_i, L_j])
   g2 = det([L_i, S]) / det([L_i, L_j])
   g_k = 0 for other k
5. If any g < 0, set to 0 (non-negative gains only).
6. Normalize: g = g / sqrt(sum(g^2))

### 7.4 Delay alignment (§35)

- delay_i = (max_distance − distance_i) / 343   [seconds]
- Apply as fractional-sample delay at sample_rate.

### 7.5 Gain normalization (§67)

- Ensure VBAP gains are L2-normalized (sum of squares ≤ 1).
- Apply additional global headroom (e.g. 0.9) before final limiter.
- Final stage: soft limiter (tanh scale) prevents any hard clipping.

---

## 8. Testing Strategy (spec §69)

Tests live in `research/python/tests/`.  0.1 relies on:

| Area | Tests |
|------|-------|
| Coordinate conversion | Known vector → correct (distance, azimuth, elevation) |
| Listener orientation | Rotated listener → rotated relative coordinates |
| VBAP pair selection | Source between known pair → that pair selected |
| VBAP gain normalization | Sum of squares ≤ 1; gains ≥ 0 |
| Gain interpolation | Moving source → max Δgain/sample < threshold; no NaNs |
| Delay calculations | Far speaker delayed relative to near by expected ms |
| Serialization | Save/load project JSON round-trip identical |
| End-to-end | Mono WAV in → N speaker WAVs out: correct length, no clipping, expected gain energy |

Each test maps to a spec §82 MVP acceptance criterion.

---

## 9. Engineering Constraints (spec §85)

The implementation respects these rules:

1. No Dolby decoding.
2. No Spotify integration initially.
3. No iPhone app initially.
4. No AI source separation initially.
5. No network speakers initially.
6. Renderer not coupled to Three.js.
7. Renderer not coupled to CoreAudio.
8. No hardcoded conventional speaker layouts.
9. No semantic roles assigned by speaker position.
10. No assumption all speakers are identical.
11. No invented height reproduction without height geometry.
12. No DSP on the UI thread (not yet relevant; enforced at 0.3).
13. Never block the audio callback.
14. No room geometry as substitute for measured calibration.
15. No premature optimization before math correctness.
16. No visual polish delaying renderer testing.

---

## 10. Future Architecture Evolution

### 0.2 — Visual world (planned)

- Tauri shell, React, TypeScript, Three.js frontend.
- Manual rectangular room + GLB/glTF import with normalization pipeline (spec §8).
- Interactive speaker/listener placement via surface raycasting, gizmos, and numeric input.
- Listener View and real-time gain visualization overlay.
- Renderer remains Python/algorithmic; audio may stay offline.

### 0.3 — Physical audio (planned)

- Rust crates: `beluga-core`, `beluga-spatial`, `beluga-dsp`, `beluga-audio-io`, `beluga-calibration`, `beluga-room`.
- Real-time audio callback via CPAL/CoreAudio with strict no-block rules (spec §42).
- Device enumeration, multi-channel output, endpoint mapping wizard, real-time VBAP, debug telemetry.

### 0.4 — Calibration

- Distance/delay alignment, manual level matching, capability analysis, coverage visualization.

### 0.5 — Music playback

- WAV/FLAC, stereo pipeline, Faithful Mode, virtual stereo stage.

### 0.6 — Measurement

- Mic input, calibration sweep, impulse response, arrival detection, parametric EQ.

### 0.7 — Consumer polish

- Wizards for room/speaker/listener/output/calibration, Beluga project bundles.

### 0.8+ — Immersive & research

- M/S analysis, correlation, ambience extraction, immersion slider, AI source separation, system audio capture, network speakers, dedicated iOS companion.

---

## 11. Change log

| Date | Change |
|------|--------|
| 2026-08-05 | Initialized repo, scaffolding, ARCHITECTURE.md baseline. Implemented Beluga 0.1: geometry, VBAP, gain smoothing, delay alignment, gain management, offline renderer, WAV export, CLI demo. 90 tests passing. Pushed to GitHub. |
| 2026-08-05 | Added MIT LICENSE file, GitHub repo link and badges to README, requirements.txt for non-pip-install users. |