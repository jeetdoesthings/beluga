# Beluga 🐋

**A room-aware, hardware-agnostic spatial audio platform and 3D visualizer.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 90 passing](https://img.shields.io/badge/tests-90%20passing-brightgreen.svg)](#running-tests)

---

## Overview

Beluga transforms arbitrary speaker arrangements into the best coherent spatial audio playback system that your physical room and hardware can produce. Instead of forcing you to place speakers according to rigid, predefined layout standards (such as traditional 5.1 or 7.1.4), Beluga adapts to your room's unique geometry.

> **Do not build the room around the audio system. Build the audio system around the room.**

---

## Key Features

- **3D Interactive Room Visualizer**: Real-time 3D room simulation built with Three.js, featuring smooth orbit navigation, custom transform gizmos, listener orientation rays, and sound source trajectory arcs.
- **Real-Time VBAP Calculation**: Vector Base Amplitude Panning (VBAP) computes speaker gains and visualizes active energy distribution live as you move virtual sound sources.
- **Flexible Layout Management**: Instant standard presets (2.0 Stereo, 5.1 Surround, 7.1.4 Atmos) or custom speaker creation with full 3D Cartesian positioning ($X, Y, Z$) and yaw orientation controls.
- **Clean DAW-Style UI**: Modern, light-mode interface with a slim left icon toolbar, tabbed bottom controls (Room, Listener, Source, Speakers), and contextual floating inspectors.
- **Project Import/Export**: Save and load complete room configurations as JSON, or import 3D GLB room models.
- **Math Research Core**: Pure Python spatial audio research suite covering delay alignment, gain smoothing, coordinate transformations, and offline per-speaker WAV rendering.

---

## Quick Start

### Prerequisites

- **Node.js**: v18.0.0 or later
- **npm** (or yarn / pnpm)
- **Python**: 3.10 or later (for running research math & test suite)
- *(Optional)* **Rust**: If compiling native desktop binaries via Tauri

---

### Running the Visualizer App

1. Navigate to the desktop application directory:
   ```bash
   cd apps/desktop
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:1420` (or the port shown in your terminal).

To build a production web bundle:
```bash
npm run build
```

*(Optional)* To launch the native Tauri desktop window:
```bash
npm run tauri dev
```

---

### Running the Python Core & Tests

1. From the project root, create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install the package in editable mode with development dependencies:
   ```bash
   pip install -e ".[dev]"
   ```

3. Run the automated test suite (90 passing tests):
   ```bash
   pytest
   ```

4. Run the demo CLI (offline render of a mono WAV across configured speaker layout):
   ```bash
   python -m beluga.cli --demo
   ```

---

## Project Structure

```
beluga/
├── apps/
│   └── desktop/            # React + TypeScript + Three.js + Tauri App
│       ├── src/
│       │   ├── three/      # Three.js 3D Scene, gizmos, and render loops
│       │   ├── types/      # Project data structures & schemas
│       │   ├── App.tsx     # UI controller and DAW layout
│       │   ├── styles.css  # Design system tokens and styles
│       │   └── vbap.ts     # Client-side real-time VBAP math engine
│       ├── src-tauri/      # Tauri desktop configuration & Rust backend
│       └── package.json
├── research/
│   └── python/             # Python spatial audio research package
│       ├── beluga/         # Geometry, VBAP, gain smoothing, delay alignment
│       └── tests/          # 90 pytest unit & integration tests
├── pyproject.toml          # Python project configuration
├── requirements.txt        # Python requirements
└── README.md
```

---

## License

This project is licensed under the [MIT License](LICENSE).