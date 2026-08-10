import { useEffect, useRef, useState } from "react";
import { BelugaScene, CameraView, SceneUpdate } from "./three/BelugaScene";
import { toListenerRelative } from "./vbap";
import {
  BelugaProject,
  createDefaultProject,
  createSpeaker,
  createStereoPreset,
  create51Preset,
  create714Preset,
  SPEAKER_CATEGORIES,
  Vector3,
  Orientation,
  Speaker,
} from "./types/project";
import { ScrubInput } from "./components/ScrubInput";
import { SnapSlider } from "./components/SnapSlider";
import { DraggableWindow } from "./components/DraggableWindow";
import { AudioControls } from "./components/AudioControls";
import {
  enumerateAudioDevices,
  startPlayback,
  stopPlayback,
  setSourcePosition,
  setSpeakerPositions,
  getTelemetry,
  getDeviceCapabilities,
  playChannelTestTone,
  playSweptSine,
  loadAudioBytes,
  saveProjectDialog,
  getLevelMatch,
  setSpeakerCalGain,
  type AudioDevice,
  type DeviceCapabilities,
  type Telemetry,
} from "./audio";

/* ═══════════════════════════════════════════════════════════════════════════
   CLEAN INLINE SVG ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

const Icons = {
  BelugaLogo: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13c0-3.5 2.5-6 6-6 4 0 7 2.5 9 6-1 2.5-3.5 5-7 5-4.5 0-8-2-8-5z" />
      <path d="M18 13c1.5-1 3-1 4-2-.5 2.5-1.5 4-4 4.5" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Import: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Save: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  Orbit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)" />
    </svg>
  ),
  TopView: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  ),
  FrontView: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  ListenerView: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h3l3-9 4 18 3-9h7" />
    </svg>
  ),
  MoveGizmo: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  ),
  RotateGizmo: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  ),
  Focus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  Speaker: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="3" /><circle cx="12" cy="15" r="4" /><circle cx="12" cy="6" r="1.5" />
    </svg>
  ),
  Listener: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Source: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M7 7a7 7 0 0 1 10 0" /><path d="M4 4a11 11 0 0 1 16 0" />
    </svg>
  ),
  Room: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  Acoustics: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5v14M7 5v14M22 9v6M2 9v6" />
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BelugaScene | null>(null);
  const [project, setProject] = useState<BelugaProject>(createDefaultProject());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRoomWindow, setShowRoomWindow] = useState(true);
  const [showGainsWindow, setShowGainsWindow] = useState(true);
  const [sceneUpdate, setSceneUpdate] = useState<SceneUpdate>({
    speakerGains: [],
    speakerAzimuths: [],
    speakerDistances: [],
    speakerElevations: [],
  });
  const [placingSpeaker, setPlacingSpeaker] = useState(false);
  const [currentView, setCurrentView] = useState<CameraView>("orbit");
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmPreset, setConfirmPreset] = useState<{ name: string; fn: (p: BelugaProject) => BelugaProject } | null>(null);
  const speakerCounter = useRef(0);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities | null>(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const [telemetry, setTelemetry] = useState<import("./audio").Telemetry | null>(null);
  const [showAudioWindow, setShowAudioWindow] = useState(true);
  const [levelMatchLevels, setLevelMatchLevels] = useState<number[] | null>(null);
  const [speakerCalGains, setSpeakerCalGains] = useState<number[] | null>(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState<string | null>(null);
  const [pendingAudioBytes, setPendingAudioBytes] = useState<{ name: string; bytes: number[] } | null>(null);
  const [faithfulMode, setFaithfulMode] = useState(false);
  const [stereoWidth, setStereoWidth] = useState(60); // degrees
  const telemetryInterval = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // ─── Device capability detection ──────────────────────────────────────
  const handleSelectDevice = (id: string) => {
    setSelectedDevice(id);
    const dev = audioDevices.find((d) => d.id === id);
    if (dev && dev.n_channels > 0) {
      getDeviceCapabilities(dev.n_channels).then(setDeviceCapabilities).catch(() => setDeviceCapabilities(null));
    } else {
      setDeviceCapabilities(null);
    }
  };

  const handlePlayChannelTestTone = async (channel: number) => {
    try {
      const dev = audioDevices.find((d) => d.id === selectedDevice);
      if (!dev) {
        showToast("Select a device first");
        return;
      }
      await playChannelTestTone(dev.id, channel);
    } catch (e) {
      showToast(`Test tone error: ${e}`);
    }
  };

  const handleAssignSpeakerChannel = (speakerId: string | null, channel: number | null) => {
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.map((s) =>
        s.id === speakerId
          ? { ...s, channel: channel }
          : speakerId === null
            ? { ...s, channel: null }
            : s
      ),
    }));
  };

  const handleGetLevelMatch = async (): Promise<number[] | null> => {
    try {
      const levels = await getLevelMatch();
      setLevelMatchLevels(levels);
      return levels;
    } catch (e) {
      showToast(`Level match error: ${e}`);
      return null;
    }
  };

  const handlePlaySweptSine = async (channel: number) => {
    try {
      const dev = audioDevices.find((d) => d.id === selectedDevice);
      if (!dev) {
        showToast("Select a device first");
        return;
      }
      await playSweptSine(dev.id, channel);
    } catch (e) {
      showToast(`Swept sine error: ${e}`);
    }
  };

  const handleSetSpeakerCalGain = async (index: number, gain: number) => {
    try {
      await setSpeakerCalGain(index, gain);
      setSpeakerCalGains((prev) => {
        const gains = prev?.slice() ?? Array(project.speakers.length).fill(1.0);
        gains[index] = gain;
        return gains;
      });
    } catch (e) {
      showToast(`Cal gain error: ${e}`);
    }
  };

  const handleLoadAudioFile = async () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      // Set accept attribute as a browser hint AND enforce in code below
      input.accept = ".wav, audio/wav, audio/x-wav";
      input.style.display = "none";

      // Must add to DOM for click() to work reliably in the Tauri webview
      document.body.appendChild(input);

      input.onchange = async (e) => {
        const target = e.target as HTMLInputElement;
        // Clean up the input element from the DOM
        document.body.removeChild(input);

        if (target.files && target.files.length > 0) {
          const file = target.files[0];
          // Enforce WAV-only: check file extension
          const fileName = file.name.toLowerCase();
          if (!fileName.endsWith(".wav") && !fileName.endsWith(".wave")) {
            showToast(`Only WAV files are supported. Selected: ${file.name}`);
            return;
          }
          // Additional validation: check WAV magic bytes (RIFF....WAVE)
          const arrayBuffer = await file.arrayBuffer();
          const header = new Uint8Array(arrayBuffer.slice(0, 12));
          // WAV header: "RIFF" at offset 0, "WAVE" at offset 8
          const riff = new TextDecoder().decode(header.slice(0, 4));
          const wave = new TextDecoder().decode(header.slice(8, 12));
          if (riff !== "RIFF" || wave !== "WAVE") {
            showToast(`"${file.name}" is not a valid WAV file.`);
            return;
          }
          const bytes = Array.from(new Uint8Array(arrayBuffer));
          setSelectedAudioFile(file.name);
          setPendingAudioBytes({ name: file.name, bytes });
          showToast(`Selected: ${file.name} (${(file.size / 1024).toFixed(0)} KB) — click Start Playback to play`);
        }
      };

      input.click();
    } catch (e) {
      showToast(`File selection failed: ${e}`);
    }
  };

  const handleToggleFaithfulMode = () => {
    setFaithfulMode((prev) => !prev);
    showToast(`Faithful Mode: ${!faithfulMode ? "enabled" : "disabled"}`);
  };

  const syncSpeakerCounter = (speakers: Speaker[]) => {
    let max = speakers.length;
    for (const s of speakers) {
      const m = /^Speaker (\d+)$/.exec(s.name);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    speakerCounter.current = max;
  };

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new BelugaScene(containerRef.current, project);
    sceneRef.current = scene;

    scene.onSelectionChange = (id) => {
      setSelectedId(id);
    };

    scene.onTransformModeChange = (mode) => setTransformMode(mode);

    scene.onSpeakerMove = (id, pos, orient) => {
      setProject((prev) => {
        const updated = {
          ...prev,
          speakers: prev.speakers.map((s) => (s.id === id ? { ...s, position: pos, orientation: orient } : s)),
        };
        if (sceneRef.current) sceneRef.current.project = updated;

        // Send updated speaker positions to the audio engine in real-time
        // (only when playing, to avoid unnecessary IPC during setup).
        if (isPlayingRef.current) {
          const listener = updated.listeners[0];
          if (listener) {
            const azimuths: number[] = [];
            const distances: number[] = [];
            for (const sp of updated.speakers) {
              if (!sp.enabled) continue;
              const sph = toListenerRelative(
                sp.position,
                listener.position,
                listener.orientation,
              );
              azimuths.push(sph.azimuth);
              distances.push(sph.distance);
            }
            void setSpeakerPositions(azimuths, distances);
          }
        }

        return updated;
      });
    };

    scene.onListenerMove = (pos, orient) => {
      setProject((prev) => {
        const updated = {
          ...prev,
          listeners: prev.listeners.map((l, i) =>
            i === 0 ? { ...l, position: pos, orientation: orient, earHeight: pos.z } : l
          ),
        };
        if (sceneRef.current) sceneRef.current.project = updated;
        return updated;
      });
    };

    scene.onSourceMove = (azimuth, elevation, distance) => {
      setProject((prev) => {
        const updated = {
          ...prev,
          virtualSource: { ...prev.virtualSource, azimuth, elevation, distance },
        };
        if (sceneRef.current) sceneRef.current.project = updated;
        return updated;
      });
    };

    scene.onRoomBoundsChange = (room) => {
      setProject((prev) => {
        const updated = { ...prev, room };
        if (sceneRef.current) sceneRef.current.project = updated;
        return updated;
      });
    };

    scene.onPlacementRequest = (pos) => {
      speakerCounter.current += 1;
      const speaker = createSpeaker(`Speaker ${speakerCounter.current}`, pos, "Bookshelf");
      scene.addSpeaker(speaker);
      setProject((prev) => {
        const updated = { ...prev, speakers: [...prev.speakers, speaker] };
        sceneRef.current!.project = updated;
        return updated;
      });
      scene.selectObject(speaker.id);
      setPlacingSpeaker(false);
      showToast(`Added ${speaker.name}`);
    };

    scene.onSceneUpdate = (update) => setSceneUpdate(update);
    scene.updateGainVisualization();

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ─── Audio engine: enumerate devices on mount ─────────────────────────────
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await enumerateAudioDevices();
        setAudioDevices(devices);
        const defaultDev = devices.find((d) => d.id === "default" || d.is_default);
        if (defaultDev) {
          setSelectedDevice(defaultDev.id);
          if (defaultDev.n_channels > 0) {
            getDeviceCapabilities(defaultDev.n_channels)
              .then(setDeviceCapabilities)
              .catch(() => setDeviceCapabilities(null));
          }
        } else if (devices.length > 0) {
          setSelectedDevice(devices[0].id);
          const dev = devices[0];
          if (dev.n_channels > 0) {
            getDeviceCapabilities(dev.n_channels)
              .then(setDeviceCapabilities)
              .catch(() => setDeviceCapabilities(null));
          }
        }
      } catch (e) {
        console.error("Failed to enumerate audio devices:", e);
      }
    };
    loadDevices();

    return () => {
      if (telemetryInterval.current) {
        clearInterval(telemetryInterval.current);
      }
    };
  }, []);

  // ─── Audio control handlers ───────────────────────────────────────────────
  const handleStartPlayback = async () => {
    if (project.speakers.length === 0) {
      showToast("Add speakers before playing");
      return;
    }
    try {
      // Pass pending audio bytes (if any) so the backend loads the WAV before starting
      const audioBytes = pendingAudioBytes?.bytes;
      await startPlayback(project, selectedDevice, [], audioBytes);
      setIsPlaying(true);
      setPendingAudioBytes(null);

      if (selectedAudioFile) {
        showToast(`Playback started: ${selectedAudioFile}`);
      } else {
        showToast("Playback started (test tone)");
      }
      telemetryInterval.current = window.setInterval(async () => {
        try {
          const tel = await getTelemetry();
          setTelemetry(tel);
        } catch (e) {
          console.error("Telemetry error:", e);
        }
      }, 100);
    } catch (e) {
      showToast(`Playback failed: ${e}`);
    }
  };

  const handleStopPlayback = async () => {
    try {
      await stopPlayback();
      if (telemetryInterval.current) {
        clearInterval(telemetryInterval.current);
        telemetryInterval.current = null;
      }
      setIsPlaying(false);
      setTelemetry(null);
      showToast("Playback stopped");
    } catch (e) {
      showToast(`Stop failed: ${e}`);
    }
  };

  const handleSourcePositionChange = async (
    field: "azimuth" | "elevation" | "distance",
    value: number,
  ) => {
    try {
      // Update local state + 3D scene (same logic as handleSourceChange)
      handleSourceChange(field, value);
      // Send to audio engine backend
      const rounded =
        field === "distance" ? parseFloat(value.toFixed(2)) : parseFloat(value.toFixed(1));
      await setSourcePosition({ ...project.virtualSource, [field]: rounded });
    } catch (e) {
      console.error("Failed to set source position:", e);
    }
  };

  // --- Handlers ---
  const handleAddSpeaker = () => {
    setPlacingSpeaker(true);
    sceneRef.current?.setPlacementMode("speaker");
    showToast("Click on room floor to place speaker (Esc to cancel)");
  };

  const handleRemoveSpeaker = (id: string) => {
    sceneRef.current?.removeSpeaker(id);
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.filter((s) => s.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
    showToast("Speaker removed");
  };

  const handleSelectObject = (id: string | null) => {
    sceneRef.current?.selectObject(id);
  };

  const handleSetView = (view: CameraView) => {
    setCurrentView(view);
    sceneRef.current?.setView(view);
  };

  const handleTransformMode = (mode: "translate" | "rotate" | "scale") => {
    setTransformMode(mode);
    sceneRef.current?.setTransformMode(mode);
  };

  const handleFocus = () => {
    sceneRef.current?.focusSelectedObject();
  };

  const handleProjectNameChange = (name: string) => {
    setProject((prev) => {
      const updated = { ...prev, name };
      if (sceneRef.current) sceneRef.current.project = updated;
      return updated;
    });
  };

  const handleRoomChange = (field: keyof typeof project.room, value: number) => {
    const rounded = parseFloat(value.toFixed(2));
    setProject((prev) => {
      const updated = { ...prev, room: { ...prev.room, [field]: rounded } };
      if (sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.buildRoom();
      }
      return updated;
    });
  };

  const handleSpeakerNameChange = (id: string, name: string) => {
    setProject((prev) => {
      const updated = {
        ...prev,
        speakers: prev.speakers.map((s) => (s.id === id ? { ...s, name } : s)),
      };
      if (sceneRef.current) sceneRef.current.project = updated;
      return updated;
    });
  };

  const handleSpeakerCategoryChange = (id: string, category: string) => {
    setProject((prev) => {
      const updated = {
        ...prev,
        speakers: prev.speakers.map((s) => (s.id === id ? { ...s, category } : s)),
      };
      if (sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.rebuildSpeakers();
        sceneRef.current.rebuildSelectionVisuals();
        sceneRef.current.updateGainVisualization();
      }
      return updated;
    });
  };

  const handleSpeakerPosChange = (id: string, field: keyof Vector3, value: number) => {
    const rounded = parseFloat(value.toFixed(2));
    setProject((prev) => {
      const updatedSpeakers = prev.speakers.map((s) =>
        s.id === id ? { ...s, position: { ...s.position, [field]: rounded } } : s
      );
      const updated = { ...prev, speakers: updatedSpeakers };
      const spk = updatedSpeakers.find((s) => s.id === id);
      if (spk && sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateSpeakerPosition(id, spk.position);
      }
      return updated;
    });
  };

  const handleSpeakerOrientChange = (id: string, field: keyof Orientation, value: number) => {
    const rounded = parseFloat(value.toFixed(1));
    setProject((prev) => {
      const updatedSpeakers = prev.speakers.map((s) =>
        s.id === id ? { ...s, orientation: { ...s.orientation, [field]: rounded } } : s
      );
      const updated = { ...prev, speakers: updatedSpeakers };
      const spk = updatedSpeakers.find((s) => s.id === id);
      if (spk && sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateSpeakerOrientation(id, spk.orientation);
      }
      return updated;
    });
  };

  const handleListenerPosChange = (field: keyof Vector3, value: number) => {
    const rounded = parseFloat(value.toFixed(2));
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) => {
        if (i !== 0) return l;
        const newPos = { ...l.position, [field]: rounded };
        const newEarHeight = field === "z" ? rounded : l.earHeight;
        return { ...l, position: newPos, earHeight: newEarHeight };
      });
      const updated = { ...prev, listeners: updatedListeners };
      const listener = updatedListeners[0];
      if (listener && sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateListenerPosition(listener.position);
      }
      return updated;
    });
  };

  const handleListenerEarHeightChange = (value: number) => {
    const rounded = parseFloat(value.toFixed(2));
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) =>
        i === 0 ? { ...l, earHeight: rounded, position: { ...l.position, z: rounded } } : l
      );
      const updated = { ...prev, listeners: updatedListeners };
      const listener = updatedListeners[0];
      if (listener && sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateListenerPosition(listener.position);
      }
      return updated;
    });
  };

  const handleListenerOrientChange = (yaw: number) => {
    const rounded = parseFloat(yaw.toFixed(1));
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) =>
        i === 0 ? { ...l, orientation: { ...l.orientation, yaw: rounded } } : l
      );
      const updated = { ...prev, listeners: updatedListeners };
      const listener = updatedListeners[0];
      if (listener && sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateListenerOrientation(listener.orientation);
      }
      return updated;
    });
  };

  const handleSourceChange = (field: "azimuth" | "elevation" | "distance", value: number) => {
    const rounded = field === "distance" ? parseFloat(value.toFixed(2)) : parseFloat(value.toFixed(1));
    setProject((prev) => {
      const updatedSource = { ...prev.virtualSource, [field]: rounded };
      const updated = { ...prev, virtualSource: updatedSource };
      if (sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateSource(updatedSource.azimuth, updatedSource.elevation, updatedSource.distance);
      }
      return updated;
    });
  };

  const applyPreset = (presetFn: (p: BelugaProject) => BelugaProject, name: string) => {
    if (project.speakers.length > 0) {
      setConfirmPreset({ name, fn: presetFn });
    } else {
      executePreset(presetFn, name);
    }
  };

  const handlePresetSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "headphones" || val === "stereo") applyPreset(createStereoPreset, val === "headphones" ? "Headphones" : "Stereo 2.0");
    else if (val === "5.1") applyPreset(create51Preset, "Surround 5.1");
    else if (val === "7.1.4") applyPreset(create714Preset, "Spatial Atmos 7.1.4");
    e.target.value = "";
  };

  const executePreset = (presetFn: (p: BelugaProject) => BelugaProject, name: string) => {
    const updated = presetFn(project);
    syncSpeakerCounter(updated.speakers);
    setProject(updated);
    if (sceneRef.current) {
      sceneRef.current.project = updated;
      sceneRef.current.rebuildSpeakers();
      sceneRef.current.buildListener();
      sceneRef.current.buildSource();
      sceneRef.current.buildRoom();
      sceneRef.current.updateGainVisualization();
    }
    setSelectedId(null);
    setConfirmPreset(null);
    showToast(`Loaded ${name} preset`);
  };

  const handleClearSpeakers = () => {
    const updated = { ...project, speakers: [] };
    speakerCounter.current = 0;
    setProject(updated);
    if (sceneRef.current) {
      sceneRef.current.project = updated;
      sceneRef.current.rebuildSpeakers();
      sceneRef.current.updateGainVisualization();
    }
    setSelectedId(null);
    showToast("Cleared all speakers");
  };

  const handleExportJSON = async () => {
    const dataStr = JSON.stringify(project, null, 2);
    const defaultName = `${project.name.toLowerCase().replace(/\s+/g, "_")}.beluga.json`;
    try {
      const path = await saveProjectDialog(defaultName, dataStr);
      showToast(`Saved to ${path}`);
    } catch (e) {
      showToast(`Save failed: ${e}`);
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.speakers && data.room) {
          syncSpeakerCounter(data.speakers);
          setProject(data);
          if (sceneRef.current) {
            sceneRef.current.project = data;
            sceneRef.current.rebuildSpeakers();
            sceneRef.current.buildListener();
            sceneRef.current.buildSource();
            sceneRef.current.buildRoom();
            sceneRef.current.updateGainVisualization();
          }
          setSelectedId(null);
          showToast(`Imported ${data.name || "project"}`);
        } else {
          showToast("Invalid Beluga project file");
        }
      } catch (_) {
        showToast("Error parsing project file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportGLB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;
        if (sceneRef.current && buffer) {
          sceneRef.current.loadGLB(buffer);
          showToast(`Imported 3D Room: ${file.name}`);
        }
      } catch (_) {
        showToast("Error loading GLB 3D model");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Selection references
  const selectedSpeaker = project.speakers.find((s) => s.id === selectedId);
  const listener = project.listeners[0] || {
    position: { x: 0, y: 0, z: 1.1 },
    earHeight: 1.1,
    orientation: { yaw: 0, pitch: 0, roll: 0 },
  };
  const isListenerSelected = selectedId === "listener";
  const isSourceSelected = selectedId === "source";

  // Selected speaker calculated acoustic metrics
  const selectedSpeakerIdx = selectedSpeaker ? project.speakers.findIndex((s) => s.id === selectedSpeaker.id) : -1;
  const selectedSpeakerGain = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerGains[selectedSpeakerIdx] ?? 0 : 0;
  const selectedSpeakerAzimuth = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerAzimuths[selectedSpeakerIdx] ?? 0 : 0;
  const selectedSpeakerDist = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerDistances[selectedSpeakerIdx] ?? 0 : 0;

  // Snap points configuration matching user's ruler scale drawing
  const angleSnaps = [
    { value: -180, label: "-180°" },
    { value: -90, label: "-90°" },
    { value: 0, label: "0°" },
    { value: 90, label: "90°" },
    { value: 180, label: "180°" },
  ];

  const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;

  return (
    <div className="app-shell">
      {/* ─── Left Floating Tool Rail (PC Style Sidebar) ─── */}
      <div className="tool-rail glass-overlay">
        <div className="rail-brand" title="Beluga Spatial Audio Studio">
          <Icons.BelugaLogo />
        </div>

        <button
          className={`rail-btn ${placingSpeaker ? "placing" : ""}`}
          onClick={handleAddSpeaker}
          data-tooltip="Add Speaker (Click Floor)"
        >
          <Icons.Plus />
        </button>

        <button
          className={`rail-btn ${showRoomWindow ? "active" : ""}`}
          onClick={() => setShowRoomWindow(!showRoomWindow)}
          data-tooltip="Room Settings"
        >
          <Icons.Room />
        </button>

        <button
          className={`rail-btn ${showGainsWindow ? "active" : ""}`}
          onClick={() => setShowGainsWindow(!showGainsWindow)}
          data-tooltip="Live Gains"
        >
          <Icons.Acoustics />
        </button>

        <button
          className={`rail-btn ${showAudioWindow ? "active" : ""}`}
          onClick={() => setShowAudioWindow(!showAudioWindow)}
          data-tooltip="Audio Engine"
        >
          <Icons.Speaker />
        </button>

        <div className="rail-divider" />

        <button
          className="rail-btn danger"
          onClick={handleClearSpeakers}
          data-tooltip="Clear All Speakers"
        >
          <Icons.Trash />
        </button>

        <div className="rail-divider" />

        <button className="rail-btn" onClick={handleExportJSON} data-tooltip="Save / Export Project">
          <Icons.Save />
        </button>

        {/* Import Flyout Menu: JSON project or GLB 3D Room */}
        <div className="rail-flyout-wrap">
          <button className="rail-btn" data-tooltip="Import JSON / GLB">
            <Icons.Import />
          </button>
          <div className="rail-flyout-menu">
            <label className="flyout-item">
              <Icons.Import />
              <span>Import Project (.json)</span>
              <input type="file" accept=".json,.beluga.json" onChange={handleImportJSON} style={{ display: "none" }} />
            </label>
            <label className="flyout-item">
              <Icons.Room />
              <span>Import Room 3D (.glb)</span>
              <input type="file" accept=".glb,.gltf" onChange={handleImportGLB} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      </div>

      {/* ─── Main Content (3D Viewport + Floating Draggable Windows) ─── */}
      <div className="main-content">
        <div className="viewport-container" ref={containerRef}>
          {/* Top Center Floating Navigation Bar (Clean Minimal, VBAP Tag Removed) */}
          <div className="top-control-bar glass-overlay">
            {/* Camera Perspectives */}
            <div className="control-segment">
              <button
                className={`segment-btn ${currentView === "orbit" ? "active" : ""}`}
                onClick={() => handleSetView("orbit")}
              >
                <Icons.Orbit /> Orbit
              </button>
              <button
                className={`segment-btn ${currentView === "top" ? "active" : ""}`}
                onClick={() => handleSetView("top")}
              >
                <Icons.TopView /> Top
              </button>
              <button
                className={`segment-btn ${currentView === "front" ? "active" : ""}`}
                onClick={() => handleSetView("front")}
              >
                <Icons.FrontView /> Front
              </button>
              <button
                className={`segment-btn ${currentView === "listener" ? "active" : ""}`}
                onClick={() => handleSetView("listener")}
              >
                <Icons.ListenerView /> POV
              </button>
            </div>

            <div className="control-divider" />

            {/* Transform Gizmo Modes */}
            <div className="control-segment">
              <button
                className={`segment-btn ${transformMode === "translate" ? "active" : ""}`}
                onClick={() => handleTransformMode("translate")}
                title="Translate Object (W)"
              >
                <Icons.MoveGizmo /> Move
              </button>
              <button
                className={`segment-btn ${transformMode === "rotate" ? "active" : ""}`}
                onClick={() => handleTransformMode("rotate")}
                title="Rotate Facing (E)"
              >
                <Icons.RotateGizmo /> Rotate
              </button>
              <button
                className="segment-btn"
                onClick={handleFocus}
                title="Focus Camera (F)"
              >
                <Icons.Focus /> Focus
              </button>
            </div>

            <div className="control-divider" />

            {/* Single Unified Presets Dropdown */}
            <div className="preset-dropdown-wrap">
              <select
                className="preset-select"
                value=""
                onChange={handlePresetSelectChange}
                aria-label="Select Speaker Layout Preset"
              >
                <option value="" disabled>✨ Layout Presets</option>
                <option value="headphones">♪ Headphones (Stereo)</option>
                <option value="stereo">Stereo 2.0 (2 Channels)</option>
                <option value="5.1">Surround 5.1 (6 Channels)</option>
                <option value="7.1.4">Spatial Atmos 7.1.4 (12 Channels)</option>
              </select>
              <span className="preset-chevron">
                <Icons.ChevronDown />
              </span>
            </div>
          </div>

          {/* ─── Movable Window 1: Live Gains Meter Panel (Top Left) ─── */}
          {showGainsWindow && (
            <DraggableWindow
              id="live-gains-window"
              title={`Live Gains (${project.speakers.length})`}
              icon={
                <div className="window-icon badge-gain">
                  <Icons.Acoustics />
                </div>
              }
              defaultPosition={{ x: 74, y: 70 }}
              width={260}
              onClose={() => setShowGainsWindow(false)}
            >
              <div className="gain-list">
                {project.speakers.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "8px 4px" }}>
                    No speakers in room. Click '+' to add or select a layout preset.
                  </div>
                ) : (
                  project.speakers.map((s, idx) => {
                    const gain = sceneUpdate.speakerGains[idx] ?? 0;
                    const isSel = s.id === selectedId;
                    const az = sceneUpdate.speakerAzimuths[idx] ?? 0;
                    const dist = sceneUpdate.speakerDistances[idx] ?? 0;
                    const activeGain = gain > 0.01;

                    return (
                      <div
                        key={s.id}
                        className={`gain-item ${isSel ? "selected" : ""} ${activeGain ? "active-gain" : ""}`}
                        onClick={() => handleSelectObject(s.id)}
                        title="Click to select speaker in 3D"
                      >
                        <div className="gain-item-top">
                          <span className="gain-item-name">
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: activeGain ? "var(--accent-blue)" : "#cbd5e1",
                              }}
                            />
                            {s.name}
                          </span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <span className="gain-badge">{s.category}</span>
                            <span className="gain-item-val">{(gain * 100).toFixed(0)}%</span>
                          </div>
                        </div>

                        <div className="gain-meter-track">
                          <div
                            className="gain-meter-bar"
                            style={{
                              width: `${Math.min(100, Math.max(0, gain * 100))}%`,
                              background: "var(--accent-blue)",
                            }}
                          />
                        </div>

                        <div className="gain-item-coords">
                          [{s.position.x.toFixed(2)}, {s.position.y.toFixed(2)}, {s.position.z.toFixed(2)}] · Az: {az.toFixed(1)}° · {dist.toFixed(2)}m
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </DraggableWindow>
          )}

          {/* ─── Movable Window 2: Room Geometry & Acoustics (Top Right) ─── */}
          {showRoomWindow && (
            <DraggableWindow
              id="room-window"
              title={project.name || "Room"}
              icon={
                <div className="window-icon badge-room">
                  <Icons.Room />
                </div>
              }
              defaultPosition={{ x: Math.max(20, screenW - 320), y: 70 }}
              width={290}
              onClose={() => setShowRoomWindow(false)}
            >
              <div className="field-section">
                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={project.name}
                    onChange={(e) => handleProjectNameChange(e.target.value)}
                    placeholder="e.g. Studio Mix Room"
                  />
                </div>
              </div>

              <div className="field-section">
                <span className="section-label">Dimensions (Meters)</span>
                <div className="coord-grid-3">
                  <ScrubInput
                    label="L (Y)"
                    value={project.room.length}
                    min={1}
                    max={30}
                    step={0.05}
                    onChange={(val) => handleRoomChange("length", val)}
                  />
                  <ScrubInput
                    label="W (X)"
                    value={project.room.width}
                    min={1}
                    max={30}
                    step={0.05}
                    onChange={(val) => handleRoomChange("width", val)}
                  />
                  <ScrubInput
                    label="H (Z)"
                    value={project.room.height}
                    min={1}
                    max={15}
                    step={0.05}
                    onChange={(val) => handleRoomChange("height", val)}
                  />
                </div>
              </div>

              <div className="field-section" style={{ background: "rgba(248,250,252,0.8)", padding: 8, borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                <span className="section-label">Acoustic Calculations</span>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 11 }}>
                  <span>Floor: <strong>{(project.room.length * project.room.width).toFixed(2)} m²</strong></span>
                  <span>Volume: <strong>{(project.room.length * project.room.width * project.room.height).toFixed(2)} m³</strong></span>
                </div>
              </div>
            </DraggableWindow>
          )}

          {/* ─── Movable Window 3: Selected Object Inspector (Speaker, Listener, Audio Source) ─── */}
          {selectedSpeaker && (
            <DraggableWindow
              id={`speaker-${selectedSpeaker.id}`}
              title={selectedSpeaker.name}
              icon={
                <div className="window-icon badge-speaker">
                  <Icons.Speaker />
                </div>
              }
              defaultPosition={{ x: Math.max(20, screenW - 320), y: 280 }}
              width={290}
              onClose={() => handleSelectObject(null)}
            >
              <div className="field-section">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={selectedSpeaker.name}
                    onChange={(e) => handleSpeakerNameChange(selectedSpeaker.id, e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Speaker Type</label>
                  <select
                    className="form-select"
                    value={selectedSpeaker.category}
                    onChange={(e) => handleSpeakerCategoryChange(selectedSpeaker.id, e.target.value)}
                  >
                    {SPEAKER_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-section">
                <span className="section-label">Position Matrix (Meters)</span>
                <div className="coord-grid-3">
                  <ScrubInput
                    label="X"
                    value={selectedSpeaker.position.x}
                    step={0.01}
                    onChange={(val) => handleSpeakerPosChange(selectedSpeaker.id, "x", val)}
                  />
                  <ScrubInput
                    label="Y"
                    value={selectedSpeaker.position.y}
                    step={0.01}
                    onChange={(val) => handleSpeakerPosChange(selectedSpeaker.id, "y", val)}
                  />
                  <ScrubInput
                    label="Z"
                    value={selectedSpeaker.position.z}
                    step={0.01}
                    min={0}
                    onChange={(val) => handleSpeakerPosChange(selectedSpeaker.id, "z", val)}
                  />
                </div>
              </div>

              <div className="field-section">
                <div className="slider-header">
                  <span className="section-label">Facing Yaw Orientation</span>
                  <span className="slider-readout">{selectedSpeaker.orientation.yaw.toFixed(1)}°</span>
                </div>
                <SnapSlider
                  value={selectedSpeaker.orientation.yaw}
                  min={-180}
                  max={180}
                  step={1}
                  snapPoints={angleSnaps}
                  onChange={(val) => handleSpeakerOrientChange(selectedSpeaker.id, "yaw", val)}
                />
              </div>

              <div className="field-section" style={{ background: "rgba(248,250,252,0.8)", padding: 8, borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                <span className="section-label">Listener-Relative Acoustic Stats</span>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 11 }}>
                  <span>Gain: <strong>{(selectedSpeakerGain * 100).toFixed(1)}%</strong></span>
                  <span>Az: <strong>{selectedSpeakerAzimuth.toFixed(1)}°</strong></span>
                  <span>Dist: <strong>{selectedSpeakerDist.toFixed(2)}m</strong></span>
                </div>
              </div>

              <div className="btn-grid-2" style={{ marginTop: 4 }}>
                <button className="action-btn" onClick={handleFocus}>
                  <Icons.Focus /> Focus (F)
                </button>
                <button className="action-btn danger" onClick={() => handleRemoveSpeaker(selectedSpeaker.id)}>
                  <Icons.Trash /> Delete
                </button>
              </div>
            </DraggableWindow>
          )}

          {/* Listener Draggable Window */}
          {isListenerSelected && (
            <DraggableWindow
              id="listener-window"
              title="Listener"
              icon={
                <div className="window-icon badge-listener">
                  <Icons.Listener />
                </div>
              }
              defaultPosition={{ x: Math.max(20, screenW - 320), y: 280 }}
              width={290}
              onClose={() => handleSelectObject(null)}
            >
              <div className="field-section">
                <span className="section-label">Position & Height (Meters)</span>
                <div className="coord-grid-3">
                  <ScrubInput
                    label="X"
                    value={listener.position.x}
                    step={0.01}
                    onChange={(val) => handleListenerPosChange("x", val)}
                  />
                  <ScrubInput
                    label="Y"
                    value={listener.position.y}
                    step={0.01}
                    onChange={(val) => handleListenerPosChange("y", val)}
                  />
                  <ScrubInput
                    label="Ear Z"
                    value={listener.earHeight}
                    min={0.1}
                    step={0.01}
                    onChange={handleListenerEarHeightChange}
                  />
                </div>
              </div>

              <div className="field-section">
                <div className="slider-header">
                  <span className="section-label">Head Facing Direction</span>
                  <span className="slider-readout">{listener.orientation.yaw.toFixed(1)}°</span>
                </div>
                <SnapSlider
                  value={listener.orientation.yaw}
                  min={-180}
                  max={180}
                  step={1}
                  snapPoints={angleSnaps}
                  onChange={handleListenerOrientChange}
                />
              </div>

              <div className="btn-grid-2" style={{ marginTop: 4 }}>
                <button className="action-btn" onClick={() => handleSetView("listener")}>
                  <Icons.ListenerView /> POV Camera
                </button>
                <button className="action-btn" onClick={handleFocus}>
                  <Icons.Focus /> Focus (F)
                </button>
              </div>
            </DraggableWindow>
          )}

          {/* Audio Source Draggable Window */}
          {isSourceSelected && (
            <DraggableWindow
              id="source-window"
              title="Audio Source"
              icon={
                <div className="window-icon badge-source">
                  <Icons.Source />
                </div>
              }
              defaultPosition={{ x: Math.max(20, screenW - 320), y: 280 }}
              width={290}
              onClose={() => handleSelectObject(null)}
            >
              <div className="field-section">
                <div className="slider-header">
                  <span className="section-label">Azimuth Angle</span>
                  <span className="slider-readout">{project.virtualSource.azimuth.toFixed(1)}°</span>
                </div>
                <SnapSlider
                  value={project.virtualSource.azimuth}
                  min={-180}
                  max={180}
                  step={1}
                  snapPoints={angleSnaps}
                  onChange={(val) => handleSourceChange("azimuth", val)}
                />

                <div className="slider-group" style={{ marginTop: 6 }}>
                  <div className="slider-header">
                    <span className="section-label">Elevation Angle</span>
                    <span className="slider-readout">{(project.virtualSource.elevation || 0).toFixed(1)}°</span>
                  </div>
                  <SnapSlider
                    value={project.virtualSource.elevation || 0}
                    min={-90}
                    max={90}
                    step={1}
                    snapPoints={[
                      { value: -90, label: "-90°" },
                      { value: -45, label: "-45°" },
                      { value: 0, label: "0°" },
                      { value: 45, label: "45°" },
                      { value: 90, label: "90°" },
                    ]}
                    onChange={(val) => handleSourceChange("elevation", val)}
                  />
                </div>

                <div className="slider-group" style={{ marginTop: 6 }}>
                  <div className="slider-header">
                    <span className="section-label">Distance from Listener</span>
                    <span className="slider-readout">{project.virtualSource.distance.toFixed(2)}m</span>
                  </div>
                  <ScrubInput
                    label="Distance"
                    value={project.virtualSource.distance}
                    min={0.3}
                    max={12}
                    step={0.05}
                    onChange={(val) => handleSourceChange("distance", val)}
                  />
                </div>
              </div>

              <div className="btn-grid-2" style={{ marginTop: 4 }}>
                <button className="action-btn" onClick={() => { handleSourceChange("azimuth", 0); handleSourceChange("elevation", 0); }}>
                  Reset Center
                </button>
                <button className="action-btn" onClick={handleFocus}>
                  <Icons.Focus /> Focus (F)
                </button>
              </div>
            </DraggableWindow>
          )}
        </div>
      </div>

      {/* ─── Audio Controls Window ─── */}
      {showAudioWindow && (
        <AudioControls
          audioDevices={audioDevices}
          selectedDevice={selectedDevice}
          onSelectDevice={handleSelectDevice}
          deviceCapabilities={deviceCapabilities}
          isPlaying={isPlaying}
          telemetry={telemetry}
          onStart={handleStartPlayback}
          onStop={handleStopPlayback}
          onSourcePosChange={handleSourcePositionChange}
          onApplyPreset={applyPreset}
          onPlayChannelTestTone={handlePlayChannelTestTone}
          onPlaySweptSine={handlePlaySweptSine}
          onAssignSpeakerChannel={handleAssignSpeakerChannel}
          onSelectSpeaker={setSelectedSpeakerId}
          selectedSpeakerId={selectedSpeakerId}
          project={project}
          onClose={() => setShowAudioWindow(false)}
          onGetLevelMatch={handleGetLevelMatch}
          levelMatchLevels={levelMatchLevels}
          speakerCalGains={speakerCalGains}
          onSetSpeakerCalGain={handleSetSpeakerCalGain}
          onSelectAudioFile={handleLoadAudioFile}
          selectedAudioFile={selectedAudioFile}
          faithfulMode={faithfulMode}
          stereoWidth={stereoWidth}
          onToggleFaithfulMode={handleToggleFaithfulMode}
          onStereoWidthChange={setStereoWidth}
        />
      )}

      {/* ─── Notification Toast ─── */}
      {toastMessage && (
        <div className="toast-container">
          <Icons.BelugaLogo />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── Preset Confirmation Modal ─── */}
      {confirmPreset && (
        <div className="modal-scrim">
          <div className="modal-dialog">
            <h3>Replace Current Layout?</h3>
            <p>
              Loading the <strong>{confirmPreset.name}</strong> preset will replace your existing {project.speakers.length} speakers.
            </p>
            <div className="btn-grid-2">
              <button className="action-btn" onClick={() => setConfirmPreset(null)}>
                Cancel
              </button>
              <button
                className="action-btn primary"
                onClick={() => executePreset(confirmPreset.fn, confirmPreset.name)}
              >
                Apply Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}