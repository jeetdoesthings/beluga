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
| 0.2 | Build the visual world | Tauri + React + Three.js: room viewer, speaker/listener placement, listener view | ✅ **Complete** |
| 0.3 | Make sound physical | Rust real-time renderer, CPAL device enumeration, real-time VBAP, endpoint mapping, audio controls UI | ✅ **Complete** |
| 0.4 | Geometry calibration | Distance/delay alignment, level matching, capability analysis | ✅ **Complete** |
| 0.5 | Music playback | WAV/FLAC stereo pipeline, Faithful Mode | ⬜ Not started |
| 0.6 | Measure reality | Mic input, calibration sweep, impulse response, parametric EQ | ⬜ Not started |
| 0.7 | Consumer-quality setup | Wizards, project bundles, polished UX | ⬜ Not started |
| 0.8 | Immersive stereo | Mid/Side, correlation, ambience extraction, immersion slider | ⬜ Not started |
| 0.9+ | Research frontier | System audio capture, network speakers, AI spatial, head tracking, iOS companion | ⬜ Not started |

---

## 4. Current State (Beluga 0.3)

### 0.1 — Prove the mathematics (complete)

**Goal:** Validate the core math with no UI and no real-time audio.

**What was built:**

- Listener-relative coordinate system (azimuth, elevation, distance) — `geometry.py`
- Arbitrary speaker placement in 3D — `speaker.py`
- 2D Vector Base Amplitude Panning (VBAP) — `vbap.py`
- Smooth gain interpolation for moving sources — `gain_smoothing.py`
- Geometric distance delay alignment — `delay_alignment.py`
- Gain management with headroom and soft limiting — `gain_management.py`
- Offline per-speaker WAV export — `render.py`, `export.py`, `cli.py`
- Comprehensive automated tests — `tests/` (90 tests, all passing)

**Acceptance criteria (spec §82):**
- Arbitrary speaker XYZ positions are accepted ✅
- Listener XYZ + orientation accepted ✅
- Source position accepted ✅
- Listener-relative coordinates are correct ✅
- 2D VBAP produces valid normalized gains ✅
- Source movement produces smooth transitions ✅
- Per-speaker WAVs can be exported ✅
- Tests verify calculations ✅ (90 tests, all passing)

### 0.2 — Build the visual world (complete)

**Goal:** Interactive 3D desktop app for room and speaker layout design.

**What was built:**
- Tauri shell, React, TypeScript, Vite, Three.js frontend
- Interactive 3D room viewer (orbit / top / front / listener views)
- Speaker placement via surface raycasting, gizmos, and numeric input
- Speaker orientation, listener placement/orientation, virtual source
- VBAP gain visualization overlay (client-side `vbap.ts`)
- GLB/glTF import with normalization pipeline
- JSON project save/load, presets (stereo, 5.1, 7.1.4), draggable UI windows
- TypeScript compiles clean, frontend builds, Rust backend compiles

### 0.3 — Make sound physical (complete)

**Goal:** Real-time spatial audio playback through the user's actual speakers.

**What was built:**
- Rust crate workspace at `crates/` with 5 crates: `beluga-core`, `beluga-dsp`, `beluga-spatial`, `beluga-room`, `beluga-audio-io`
- `beluga-core`: `Vector3`, `Orientation`, `Spherical`, `to_listener_relative`, `azimuth_to_unit_vector` — ported from Python with matching test coverage
- `beluga-dsp`: `compute_delays`, `FractionalDelay` (ring-buffer linear interpolation), `smooth_gains`, `apply_smoothed_gain_per_sample`, `apply_headroom`, `soft_limit`, `process_output`
- `beluga-spatial`: `SpatialScene`/`SpatialObject`, `RealTimeRenderer` with real-time VBAP gain computation and per-block rendering
- `beluga-room`: `BoundingBox3`, `RoomGeometry` with floor/ceiling dimensions and model bounds
- `beluga-audio-io`: `DeviceEnumerator` (CPAL device enumeration), `ChannelMapping` (speaker→channel assignment), `AudioEngine` (real-time CPAL output stream with non-blocking callback)
- Tauri backend integration: `enumerate_audio_devices`, `start_playback`, `stop_playback`, `set_source_position`, `get_telemetry`, `set_playing`, `set_speaker_positions`, `get_device_capabilities`, `play_channel_test_tone` commands
- Frontend: `audio.ts` Tauri bridge, `AudioControls` component with device selector, transport, source position sliders, live telemetry, device capabilities display, channel calibration UI
- Channel calibration UI: "Play Test" buttons per output channel, endpoint-to-channel mapping selector
- Real-time speaker panning: `set_speaker_positions` command updates VBAP azimuths when speakers are dragged in 3D viewport while playing
- Device-centric endpoint model: `n_channels` in `AudioDevice`, `channel: Option<u32>` in `Speaker`, explicit channel assignment from presets

**Acceptance criteria (spec §42–§47):**
- Audio device enumeration via CPAL ✅
- Real-time VBAP computed per audio callback block ✅
- No blocking in audio callback ✅
- Non-negative, energy-normalized gains ✅
- Soft limiting prevents clipping ✅
- Channel mapping wizard (auto + custom) ✅
- Frontend audio controls (device, transport, position, telemetry) ✅
- Device capabilities display (stereo/surround/spatial detection) ✅
- Channel calibration UI (Play Test per channel, endpoint mapping) ✅
- Real-time speaker position updates during playback ✅
- All crates compile with `cargo clippy -D warnings` ✅
- All tests pass: 89 Rust tests (73 core + 16 integration), 90 Python tests ✅
- `cargo fmt --check` clean ✅
- Frontend TypeScript compiles clean, Vite build succeeds ✅

### 0.4 — Geometry calibration (complete)

**Goal:** Calibrate speaker geometry and levels for accurate spatial reproduction.

**What was built:**
- **Delay alignment** — geometric time-of-flight compensation via `compute_delays()` and `FractionalDelay` ring buffer, applied per audio block in `render_block()`. Delays recompute dynamically when speakers are dragged.
- **Level matching** — `level_match()` method captures last output block and computes per-speaker RMS. "Measure Levels" button + per-speaker gain sliders (0.5x–2.0x) allow calibration.
- **Swept sine measurement** — `play_swept_sine()` command plays 20Hz–20kHz exponential sweep on a single channel for acoustic analysis.
- **Delay visualization** — `speaker_delays_ms` added to Telemetry, displayed in the audio controls.
- **Per-speaker cal gains** — `speaker_cal_gains` field applied in the audio callback before headroom/limiter.
- **Tests** — Added `delay_alignment_applied_correctly` and `update_speaker_positions_recomputes_delays` tests verifying delay computation and dynamic updates.

---

## 5. Repository Structure

```
beluga/
  research/python/
    beluga/               # Core Python package
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
    tests/                # pytest unit + integration tests (90 tests)
  crates/                 # Rust crates (0.3+)
    Cargo.toml            # Workspace manifest
    beluga-core/
      src/geometry.rs     # Vector3, Orientation, Spherical, to_listener_relative
      src/speaker.rs      # Speaker, Listener, Room, BelugaProject (serde)
    beluga-dsp/
      src/gain_smoothing.rs   # Interp, SmoothingConfig, smooth_gains
      src/delay_alignment.rs  # compute_delays, FractionalDelay
      src/gain_management.rs  # apply_headroom, soft_limit, process_output
    beluga-spatial/
      src/vbap.rs         # select_pair, solve_gains, render_vbap_2d
      src/render.rs       # RealTimeRenderer
      src/scene.rs        # AudioBuffer, SpatialObject, SpatialScene
    beluga-room/
      src/room.rs         # BoundingBox3, RoomGeometry
    beluga-audio-io/
      src/device.rs       # AudioDevice, DeviceEnumerator
      src/mapping.rs      # ChannelMapping
      src/engine.rs       # AudioEngine (CPAL real-time callback)
      tests/integration.rs
  apps/desktop/           # Tauri desktop app (0.2+)
    src-tauri/src/main.rs # Tauri backend with audio commands
    src/
      App.tsx             # React frontend
      audio.ts            # Tauri bridge for audio engine
      components/AudioControls.tsx
      three/BelugaScene.ts
      vbap.ts
      types/project.ts
  test-assets/audio/      # Sample WAV fixtures
  docs/research/          # VBAP math notes and conventions
  ARCHITECTURE.md         # This living document
  README.md               # Project overview and quick start
  pyproject.toml          # Python package config (version 0.3.0)
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

### Rust crates (0.3+)

The 0.3 real-time audio engine is implemented in Rust, structured as a Cargo workspace at `crates/`. Each crate mirrors its Python counterpart while adding real-time capabilities.

#### beluga-core (`crates/beluga-core`)

**Responsibility:** fundamental types shared across all crates.

**Key modules:**
- `geometry.rs` — `Vector3`, `Orientation`, `Spherical`, `to_listener_relative()`, `azimuth_to_unit_vector()`. Ported from `geometry.py` with identical math and test coverage.
- `speaker.rs` — `Speaker`, `Listener`, `Room`, `BelugaProject` data models with serde `Serialize`/`Deserialize`. JSON round-trip tested.

#### beluga-dsp (`crates/beluga-dsp`)

**Responsibility:** digital signal processing primitives (spec §34, §35, §67).

**Key modules:**
- `gain_smoothing.rs` — `Interp` enum (Linear/Exp), `SmoothingConfig`, `smooth_gains()`, `apply_smoothed_gain_per_sample()`. Per-sample gain ramping with hold-at-final behavior mirroring the Python implementation.
- `delay_alignment.rs` — `compute_delays()` (geometric distance delay), `FractionalDelay` (ring-buffer with linear interpolation, read-then-write ordering for continuity across blocks). `const SPEED_OF_SOUND = 343.0`.
- `gain_management.rs` — `apply_headroom()` (global scalar), `soft_limit()` (tanh-based soft clipper), `process_output()` (headroom + limiter pipeline).

#### beluga-spatial (`crates/beluga-spatial`)

**Responsibility:** spatial scene representation and real-time VBAP rendering (spec §29–§33).

**Key modules:**
- `scene.rs` — `AudioBuffer`, `SpatialObject` (with `Arc<dyn Fn(f64) -> (f64,f64,f64) + Send + Sync>` trajectory), `SpatialScene`.
- `vbap.rs` — `select_pair()`, `solve_gains()`, `normalize_gains()`, `render_vbap_2d_dirs()`, `render_vbap_2d()`. Azimuth computed via `atan2(x, y)`, matches Python.
- `render.rs` — `RealTimeRenderer` pre-computes speaker azimuths from the project, then per-block computes VBAP gains via `compute_gains()` and applies smoothed gains + fractional delay via `render_block()`. Writes directly into pre-allocated output buffers (no per-callback allocation).

#### beluga-room (`crates/beluga-room`)

**Responsibility:** room geometry model (spec §8).

**Key modules:**
- `room.rs` — `BoundingBox3`, `RoomGeometry` (length/width/height + model bounds), `Vector3Like`. Supports floor/ceiling/acoustic material tracking.

#### beluga-audio-io (`crates/beluga-audio-io`)

**Responsibility:** real-time audio I/O via CPAL abstraction (spec §42–§47).

**Key modules:**
- `device.rs` — `AudioDevice` struct, `DeviceEnumerator` with `enumerate_outputs()`, `default_output()`, `find()`. Uses `cpal::traits::{HostTrait, DeviceTrait}`.
- `mapping.rs` — `ChannelMapping` (speaker→channel / channel→speaker bidirectional map), `auto()` generation, `interleave()` for converting speaker-major to channel-interleaved PCM.
- `engine.rs` — `AudioEngine` with `SharedState` (Arc/Mutex/Atomic shared between main thread and audio callback), `SourcePosition` channel (mpsc), `Telemetry`, `start()`/`stop()` stream lifecycle, non-blocking audio callback. Supports F32/I16/U16 sample formats. The renderer is NOT coupled to CoreAudio — CPAL provides the abstraction layer.

#### Tauri backend (`apps/desktop/src-tauri/src/main.rs`)

Exposes the following Tauri commands (stateful, using `Mutex<Option<AudioEngine>>`):
- `enumerate_audio_devices()` — returns `Vec<AudioDevice>` via CPAL
- `start_playback(project_json, device_id, channel_mapping)` — opens device, creates engine, starts stream
- `stop_playback()` — stops stream and releases engine
- `set_source_position(azimuth, elevation, distance)` — sends position via mpsc channel (non-blocking)
- `get_telemetry()` — returns current gain/playhead/playing state
- `set_playing(bool)` — pause/resume without releasing the stream

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
12. No DSP on the UI thread — audio callback uses pre-allocated buffers, Arc/Mutex/Atomic synchronization only. ✅ (enforced at 0.3).
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
| 2026-08-05 | Docs updated to reflect 0.1 completion (past tense, checkmarks). |
| 2026-08-05 | Started Beluga 0.2: scaffolded Tauri + React + TypeScript + Vite + Three.js desktop app. Implemented 3D room viewer, speaker placement (surface click + numeric), speaker orientation, listener placement/orientation, virtual source, VBAP gain visualization, camera views (orbit/top/front/listener), GLB import, project save/load. TypeScript compiles clean, frontend builds, Rust backend compiles. |
| 2026-08-05 | Started Beluga 0.3: scaffolding Rust workspace at `crates/` with 5 crates. Implemented beluga-core (geometry.rs, speaker.rs), beluga-dsp (gain_smoothing, delay_alignment, gain_management), beluga-spatial (scene.rs, vbap.rs, render.rs), beluga-room (room model). All crates compile. |
| 2026-08-05 | Completed Beluga 0.3: implemented beluga-audio-io with CPAL device enumeration, channel mapping, and real-time AudioEngine with non-blocking callback. Fixed CPAL 0.16 API issues (default_output_config, BufferSize, StreamConfig). Integrated engine into Tauri backend with 6 new commands. Added AudioControls UI component and audio.ts Tauri bridge. Fixed test expectations for fractional delay and gain smoothing. 73 Rust tests pass, 90 Python tests pass, clippy clean, fmt clean. Versions bumped to 0.3.0. |