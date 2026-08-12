# Beluga 🐋

**A room-aware, hardware-agnostic spatial audio platform that adapts audio playback to your actual speaker setup.**

---

## Overview

Beluga transforms your room into a personalized spatial listening environment.

Instead of requiring predefined speaker layouts, Beluga analyzes your room, your listening position, and your available speakers to create the best possible spatial sound field for your unique setup.

Whether you're using two bookshelf speakers, studio monitors, or a custom multi-speaker system, Beluga adapts the rendering to your hardware instead of forcing your hardware to match a standard.

> **Don't build your room around your speakers. Let your speakers adapt to your room.**

---

## Features

### Room-Aware Audio

Import a 3D scan of your room and build an accurate virtual representation of your listening space.

- Interactive 3D room visualization
- GLB room model support
- Smooth real-time navigation
- Accurate room geometry

---

### Interactive Speaker Placement

Place your speakers exactly where they exist in your room.

- Drag-and-drop positioning
- 3D movement and rotation
- Unlimited custom speaker layouts
- Live room visualization

---

### Listener Positioning

Place the listening position anywhere inside the room.

Beluga continuously renders audio from the listener's perspective, allowing you to optimize playback for desks, home theaters, studios, gaming setups, or living spaces.

---

### Audio Device Detection

Beluga automatically detects every playback device connected to your computer.

View:

- Connected audio devices
- Available output channels
- Sample rates
- Device capabilities

---

### Output Channel Mapping

Assign each available output channel to its corresponding speaker.

Compatible with:

- USB audio interfaces
- Studio monitors
- Active speakers
- AV receivers
- Multi-channel audio devices

---

### Geometry-Aware Spatial Rendering

Beluga renders audio based on your actual speaker geometry rather than assuming fixed layouts.

Features include:

- Smooth virtual source movement
- Delay alignment
- Gain optimization
- Phantom source generation
- Real-time spatial rendering

---

### Flexible Speaker Layouts

Beluga works with virtually any speaker arrangement.

Supported configurations include:

- Stereo systems
- Quadraphonic setups
- 5.1 surround systems
- 7.1 surround systems
- Custom multi-channel layouts
- Irregular speaker arrangements

Beluga adapts to your setup instead of forcing predefined standards.

---

### Save & Load Projects

Save complete listening environments and continue exactly where you left off.

Projects include:

- Room geometry
- Speaker positions
- Listener position
- Audio routing
- Project settings

---

### Real-Time Visualization

Visualize your entire listening environment while audio is playing.

Display:

- Room geometry
- Speaker locations
- Listener position
- Active sound sources
- Live output activity

---

## Getting Started

### Requirements

- macOS or Windows
- Node.js 18 or later
- npm, pnpm, or yarn

### Development

```bash
cd apps/desktop
npm install
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

---

## Privacy

Beluga performs all room processing, spatial rendering, and audio computation locally on your device.

Your room scans, speaker layouts, and project data never leave your computer.

---

## License

This project is licensed under the MIT License.
