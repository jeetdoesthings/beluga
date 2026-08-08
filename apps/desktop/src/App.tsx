import { useEffect, useRef, useState } from "react";
import { BelugaScene, CameraView, SceneUpdate } from "./three/BelugaScene";
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

/* ═══════════════════════════════════════════════════════════════════════════
   PREMIUM SVG ICON LIBRARY (Pro Studio / Feather / Lucide Style)
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
  Stereo: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="6" height="16" rx="2" /><circle cx="6" cy="14" r="1.5" /><circle cx="6" cy="8" r="0.8" />
      <rect x="15" y="4" width="6" height="16" rx="2" /><circle cx="18" cy="14" r="1.5" /><circle cx="18" cy="8" r="0.8" />
    </svg>
  ),
  Surround51: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="6" cy="7" r="1.5" /><circle cx="18" cy="7" r="1.5" /><circle cx="12" cy="4" r="1.5" />
      <circle cx="5" cy="17" r="1.5" /><circle cx="19" cy="17" r="1.5" />
    </svg>
  ),
  Spatial714: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="4" strokeDasharray="2 2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
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
  ScaleGizmo: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
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
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
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
  const [bottomTab, setBottomTab] = useState<"speakers" | "room" | "listener" | "source">("speakers");
  const [isDeckCollapsed, setIsDeckCollapsed] = useState(false);
  const speakerCounter = useRef(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
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
      if (id === "listener") setBottomTab("listener");
      else if (id === "source") setBottomTab("source");
      else if (id) setBottomTab("speakers");
    };

    scene.onTransformModeChange = (mode) => setTransformMode(mode);

    scene.onSpeakerMove = (id, pos, orient) => {
      setProject((prev) => {
        const updated = {
          ...prev,
          speakers: prev.speakers.map((s) => (s.id === id ? { ...s, position: pos, orientation: orient } : s)),
        };
        if (sceneRef.current) sceneRef.current.project = updated;
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

  const handleRoomChange = (field: keyof typeof project.room, value: number) => {
    setProject((prev) => {
      const updated = { ...prev, room: { ...prev.room, [field]: value } };
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
    setProject((prev) => {
      const updatedSpeakers = prev.speakers.map((s) =>
        s.id === id ? { ...s, position: { ...s.position, [field]: value } } : s
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
    setProject((prev) => {
      const updatedSpeakers = prev.speakers.map((s) =>
        s.id === id ? { ...s, orientation: { ...s.orientation, [field]: value } } : s
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
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) => {
        if (i !== 0) return l;
        const newPos = { ...l.position, [field]: value };
        const newEarHeight = field === "z" ? value : l.earHeight;
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
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) =>
        i === 0 ? { ...l, earHeight: value, position: { ...l.position, z: value } } : l
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
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) =>
        i === 0 ? { ...l, orientation: { ...l.orientation, yaw } } : l
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
    setProject((prev) => {
      const updatedSource = { ...prev.virtualSource, [field]: value };
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

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(project, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, "_")}.beluga.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported project JSON");
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

  // Selection references
  const selectedSpeaker = project.speakers.find((s) => s.id === selectedId);
  const listener = project.listeners[0] || {
    position: { x: 0, y: 0, z: 1.2 },
    earHeight: 1.2,
    orientation: { yaw: 0, pitch: 0, roll: 0 },
  };
  const isListenerSelected = selectedId === "listener";
  const isSourceSelected = selectedId === "source";

  // Selected speaker calculated acoustic metrics
  const selectedSpeakerIdx = selectedSpeaker ? project.speakers.findIndex((s) => s.id === selectedSpeaker.id) : -1;
  const selectedSpeakerGain = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerGains[selectedSpeakerIdx] ?? 0 : 0;
  const selectedSpeakerAzimuth = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerAzimuths[selectedSpeakerIdx] ?? 0 : 0;
  const selectedSpeakerDist = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerDistances[selectedSpeakerIdx] ?? 0 : 0;
  const selectedSpeakerElev = selectedSpeakerIdx >= 0 ? sceneUpdate.speakerElevations[selectedSpeakerIdx] ?? 0 : 0;

  return (
    <div className="app-shell">
      {/* ─── Left DAW Tool Rail ─── */}
      <div className="tool-rail">
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

        <div className="rail-divider" />

        <button
          className="rail-btn"
          onClick={() => applyPreset(createStereoPreset, "Stereo 2.0")}
          data-tooltip="Stereo 2.0 Preset"
        >
          <Icons.Stereo />
        </button>

        <button
          className="rail-btn"
          onClick={() => applyPreset(create51Preset, "Surround 5.1")}
          data-tooltip="Surround 5.1 Preset"
        >
          <Icons.Surround51 />
        </button>

        <button
          className="rail-btn"
          onClick={() => applyPreset(create714Preset, "Atmos 7.1.4")}
          data-tooltip="Spatial 7.1.4 Preset"
        >
          <Icons.Spatial714 />
        </button>

        <button
          className="rail-btn danger"
          onClick={handleClearSpeakers}
          data-tooltip="Clear All Speakers"
        >
          <Icons.Trash />
        </button>

        <div className="rail-spacer" />

        <button className="rail-btn" onClick={handleExportJSON} data-tooltip="Save / Export Project">
          <Icons.Save />
        </button>

        <label className="rail-btn" data-tooltip="Import Project JSON">
          <Icons.Import />
          <input type="file" accept=".json,.beluga.json" onChange={handleImportJSON} style={{ display: "none" }} />
        </label>
      </div>

      {/* ─── Main Content (3D Viewport + Bottom Deck) ─── */}
      <div className="main-content">
        {/* 3D Viewport Container */}
        <div className="viewport-container" ref={containerRef}>
          {/* Top Center Floating Navigation Bar */}
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

            {/* Live Audio Engine Status */}
            <div className="status-pill">
              <span className="live-dot" />
              <span>VBAP 3D</span>
            </div>
          </div>

          {/* Top-Left Floating VBAP Acoustic Meter Panel */}
          <div className="gain-meter-panel glass-overlay">
            <div className="panel-header">
              <div className="panel-title">
                <Icons.Acoustics /> Live Gains ({project.speakers.length})
              </div>
            </div>

            <div className="gain-list">
              {project.speakers.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "8px 4px" }}>
                  No speakers in room. Click '+' or a preset to add.
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
                            background:
                              gain > 0.7
                                ? "linear-gradient(90deg, #06b6d4, #2563eb)"
                                : gain > 0.05
                                ? "linear-gradient(90deg, #38bdf8, #06b6d4)"
                                : "#cbd5e1",
                          }}
                        />
                      </div>

                      <div className="gain-item-coords">
                        Az: {az.toFixed(0)}° · Dist: {dist.toFixed(2)}m
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Top-Right Floating Contextual Inspector (For ANY selected object or room) */}
          <div className="inspector-panel glass-overlay">
            {/* 1. SPEAKER SELECTED */}
            {selectedSpeaker ? (
              <>
                <div className="inspector-top-row">
                  <div className="inspector-title-group">
                    <div className="inspector-icon-badge badge-speaker">
                      <Icons.Speaker />
                    </div>
                    <div>
                      <h3>{selectedSpeaker.name}</h3>
                      <span className="inspector-subtitle">Loudspeaker Properties</span>
                    </div>
                  </div>
                  <button className="inspector-close-btn" onClick={() => handleSelectObject(null)}>
                    <Icons.Close />
                  </button>
                </div>

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
                    <label className="form-label">Type / Mount</label>
                    <div className="category-pills">
                      {SPEAKER_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          className={`cat-pill ${selectedSpeaker.category === cat ? "active" : ""}`}
                          onClick={() => handleSpeakerCategoryChange(selectedSpeaker.id, cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="field-section">
                  <span className="section-label">Position Matrix (Meters)</span>
                  <div className="coord-grid-3">
                    <div className="coord-cell">
                      <span className="coord-cell-label">X (Left/Right)</span>
                      <input
                        type="number"
                        step="0.1"
                        className="coord-cell-input"
                        value={selectedSpeaker.position.x}
                        onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "x", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Y (Front/Back)</span>
                      <input
                        type="number"
                        step="0.1"
                        className="coord-cell-input"
                        value={selectedSpeaker.position.y}
                        onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "y", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Z (Height)</span>
                      <input
                        type="number"
                        step="0.1"
                        className="coord-cell-input"
                        value={selectedSpeaker.position.z}
                        onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "z", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                <div className="field-section">
                  <div className="slider-group">
                    <div className="slider-header">
                      <span className="section-label">Facing Yaw Orientation</span>
                      <span className="slider-readout">{selectedSpeaker.orientation.yaw.toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      className="studio-slider"
                      value={selectedSpeaker.orientation.yaw}
                      onChange={(e) => handleSpeakerOrientChange(selectedSpeaker.id, "yaw", parseFloat(e.target.value))}
                    />
                  </div>
                </div>

                <div className="field-section" style={{ background: "rgba(248,250,252,0.8)", padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                  <span className="section-label">Listener-Relative Acoustic Stats</span>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11 }}>
                    <span>Gain: <strong>{(selectedSpeakerGain * 100).toFixed(1)}%</strong></span>
                    <span>Az: <strong>{selectedSpeakerAzimuth.toFixed(0)}°</strong></span>
                    <span>Dist: <strong>{selectedSpeakerDist.toFixed(2)}m</strong></span>
                  </div>
                </div>

                <div className="btn-grid-2" style={{ marginTop: 10 }}>
                  <button className="action-btn" onClick={handleFocus}>
                    <Icons.Focus /> Focus (F)
                  </button>
                  <button className="action-btn danger" onClick={() => handleRemoveSpeaker(selectedSpeaker.id)}>
                    <Icons.Trash /> Delete
                  </button>
                </div>
              </>
            ) : isListenerSelected ? (
              /* 2. LISTENER SELECTED */
              <>
                <div className="inspector-top-row">
                  <div className="inspector-title-group">
                    <div className="inspector-icon-badge badge-listener">
                      <Icons.Listener />
                    </div>
                    <div>
                      <h3>Listener Sweet Spot</h3>
                      <span className="inspector-subtitle">Reference Listening Position</span>
                    </div>
                  </div>
                  <button className="inspector-close-btn" onClick={() => handleSelectObject(null)}>
                    <Icons.Close />
                  </button>
                </div>

                <div className="field-section">
                  <span className="section-label">Floor Position (Meters)</span>
                  <div className="coord-grid-3">
                    <div className="coord-cell">
                      <span className="coord-cell-label">X (Left/Right)</span>
                      <input
                        type="number"
                        step="0.1"
                        className="coord-cell-input"
                        value={listener.position.x}
                        onChange={(e) => handleListenerPosChange("x", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Y (Front/Back)</span>
                      <input
                        type="number"
                        step="0.1"
                        className="coord-cell-input"
                        value={listener.position.y}
                        onChange={(e) => handleListenerPosChange("y", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Ear Height (Z)</span>
                      <input
                        type="number"
                        step="0.05"
                        className="coord-cell-input"
                        value={listener.earHeight}
                        onChange={(e) => handleListenerEarHeightChange(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                <div className="field-section">
                  <div className="slider-group">
                    <div className="slider-header">
                      <span className="section-label">Head Facing Direction</span>
                      <span className="slider-readout">{listener.orientation.yaw.toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      className="studio-slider"
                      value={listener.orientation.yaw}
                      onChange={(e) => handleListenerOrientChange(parseFloat(e.target.value))}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <button className="cat-pill" onClick={() => handleListenerOrientChange(0)}>Face Front (0°)</button>
                    <button className="cat-pill" onClick={() => handleListenerOrientChange(90)}>Right (90°)</button>
                    <button className="cat-pill" onClick={() => handleListenerOrientChange(180)}>Back (180°)</button>
                    <button className="cat-pill" onClick={() => handleListenerOrientChange(-90)}>Left (-90°)</button>
                  </div>
                </div>

                <div className="btn-grid-2" style={{ marginTop: 10 }}>
                  <button className="action-btn" onClick={() => handleSetView("listener")}>
                    <Icons.ListenerView /> POV Camera
                  </button>
                  <button className="action-btn" onClick={handleFocus}>
                    <Icons.Focus /> Focus (F)
                  </button>
                </div>
              </>
            ) : isSourceSelected ? (
              /* 3. VIRTUAL SOURCE SELECTED */
              <>
                <div className="inspector-top-row">
                  <div className="inspector-title-group">
                    <div className="inspector-icon-badge badge-source">
                      <Icons.Source />
                    </div>
                    <div>
                      <h3>Virtual Sound Source</h3>
                      <span className="inspector-subtitle">Spatial Audio Object (VBAP)</span>
                    </div>
                  </div>
                  <button className="inspector-close-btn" onClick={() => handleSelectObject(null)}>
                    <Icons.Close />
                  </button>
                </div>

                <div className="field-section">
                  <div className="slider-group">
                    <div className="slider-header">
                      <span className="section-label">Azimuth Angle</span>
                      <span className="slider-readout">{project.virtualSource.azimuth.toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      className="studio-slider"
                      value={project.virtualSource.azimuth}
                      onChange={(e) => handleSourceChange("azimuth", parseFloat(e.target.value))}
                    />
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <button className="cat-pill" onClick={() => handleSourceChange("azimuth", -30)}>L (-30°)</button>
                      <button className="cat-pill" onClick={() => handleSourceChange("azimuth", 0)}>Center (0°)</button>
                      <button className="cat-pill" onClick={() => handleSourceChange("azimuth", 30)}>R (+30°)</button>
                      <button className="cat-pill" onClick={() => handleSourceChange("azimuth", -110)}>Ls (-110°)</button>
                      <button className="cat-pill" onClick={() => handleSourceChange("azimuth", 110)}>Rs (+110°)</button>
                    </div>
                  </div>

                  <div className="slider-group" style={{ marginTop: 8 }}>
                    <div className="slider-header">
                      <span className="section-label">Elevation Angle</span>
                      <span className="slider-readout">{(project.virtualSource.elevation || 0).toFixed(0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      className="studio-slider"
                      value={project.virtualSource.elevation || 0}
                      onChange={(e) => handleSourceChange("elevation", parseFloat(e.target.value))}
                    />
                  </div>

                  <div className="slider-group" style={{ marginTop: 8 }}>
                    <div className="slider-header">
                      <span className="section-label">Distance from Listener</span>
                      <span className="slider-readout">{project.virtualSource.distance.toFixed(2)}m</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="8"
                      step="0.1"
                      className="studio-slider"
                      value={project.virtualSource.distance}
                      onChange={(e) => handleSourceChange("distance", parseFloat(e.target.value))}
                    />
                  </div>
                </div>

                <div className="btn-grid-2" style={{ marginTop: 10 }}>
                  <button className="action-btn" onClick={() => { handleSourceChange("azimuth", 0); handleSourceChange("elevation", 0); }}>
                    Reset Center
                  </button>
                  <button className="action-btn" onClick={handleFocus}>
                    <Icons.Focus /> Focus (F)
                  </button>
                </div>
              </>
            ) : (
              /* 4. ROOM / SCENE OVERVIEW (When nothing is selected) */
              <>
                <div className="inspector-top-row">
                  <div className="inspector-title-group">
                    <div className="inspector-icon-badge badge-room">
                      <Icons.Room />
                    </div>
                    <div>
                      <h3>{project.name}</h3>
                      <span className="inspector-subtitle">Studio Room Geometry</span>
                    </div>
                  </div>
                </div>

                <div className="field-section">
                  <span className="section-label">Room Dimensions (Meters)</span>
                  <div className="coord-grid-3">
                    <div className="coord-cell">
                      <span className="coord-cell-label">Length (Y)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        className="coord-cell-input"
                        value={project.room.length}
                        onChange={(e) => handleRoomChange("length", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Width (X)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        className="coord-cell-input"
                        value={project.room.width}
                        onChange={(e) => handleRoomChange("width", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Height (Z)</span>
                      <input
                        type="number"
                        step="0.2"
                        min="1"
                        className="coord-cell-input"
                        value={project.room.height}
                        onChange={(e) => handleRoomChange("height", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </div>

                <div className="field-section" style={{ background: "rgba(248,250,252,0.8)", padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                  <span className="section-label">Calculated Room Acoustics</span>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11 }}>
                    <span>Floor Area: <strong>{(project.room.length * project.room.width).toFixed(1)} m²</strong></span>
                    <span>Volume: <strong>{(project.room.length * project.room.width * project.room.height).toFixed(1)} m³</strong></span>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <span className="section-label" style={{ display: "block", marginBottom: 6 }}>Direct Layout Presets</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="action-btn" style={{ flex: 1 }} onClick={() => applyPreset(createStereoPreset, "Stereo 2.0")}>
                      Stereo
                    </button>
                    <button className="action-btn" style={{ flex: 1 }} onClick={() => applyPreset(create51Preset, "5.1 Surround")}>
                      5.1
                    </button>
                    <button className="action-btn" style={{ flex: 1 }} onClick={() => applyPreset(create714Preset, "7.1.4 Atmos")}>
                      7.1.4
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Bottom Studio Deck (Tabbed Console) ─── */}
        <div className={`studio-deck ${isDeckCollapsed ? "collapsed" : ""}`}>
          {/* Deck Navigation Bar */}
          <div className="deck-nav-bar">
            <div className="deck-tabs">
              <button
                className={`deck-tab ${bottomTab === "speakers" ? "active" : ""}`}
                onClick={() => { setBottomTab("speakers"); setIsDeckCollapsed(false); }}
              >
                <Icons.Speaker />
                Speakers
                <span className="tab-counter">{project.speakers.length}</span>
              </button>

              <button
                className={`deck-tab ${bottomTab === "room" ? "active" : ""}`}
                onClick={() => { setBottomTab("room"); setIsDeckCollapsed(false); }}
              >
                <Icons.Room />
                Room Acoustics
              </button>

              <button
                className={`deck-tab ${bottomTab === "listener" ? "active" : ""}`}
                onClick={() => { setBottomTab("listener"); setIsDeckCollapsed(false); handleSelectObject("listener"); }}
              >
                <Icons.Listener />
                Listener
              </button>

              <button
                className={`deck-tab ${bottomTab === "source" ? "active" : ""}`}
                onClick={() => { setBottomTab("source"); setIsDeckCollapsed(false); handleSelectObject("source"); }}
              >
                <Icons.Source />
                Audio Source
              </button>
            </div>

            <div className="deck-nav-spacer" />

            <button
              className="deck-toggle-btn"
              onClick={() => setIsDeckCollapsed(!isDeckCollapsed)}
              title={isDeckCollapsed ? "Expand Deck" : "Collapse Deck"}
            >
              {isDeckCollapsed ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
            </button>
          </div>

          {/* Deck Body Content */}
          {!isDeckCollapsed && (
            <div className="deck-body">
              {/* Tab 1: SPEAKERS CARD SHELF */}
              {bottomTab === "speakers" && (
                <div className="speaker-shelf">
                  <div
                    className={`add-speaker-card ${placingSpeaker ? "placing" : ""}`}
                    onClick={handleAddSpeaker}
                  >
                    <Icons.Plus />
                    <span>{placingSpeaker ? "Click Floor..." : "Add Speaker"}</span>
                  </div>

                  {project.speakers.map((s, idx) => {
                    const gain = sceneUpdate.speakerGains[idx] ?? 0;
                    const isSel = s.id === selectedId;
                    const activeGain = gain > 0.01;

                    return (
                      <div
                        key={s.id}
                        className={`speaker-card ${isSel ? "selected" : ""}`}
                        onClick={() => handleSelectObject(s.id)}
                      >
                        <div className="speaker-card-top">
                          <div className="speaker-card-header">
                            <span
                              className="speaker-status-dot"
                              style={{
                                background: activeGain ? "var(--accent-blue)" : "#cbd5e1",
                                boxShadow: activeGain ? "0 0 6px var(--accent-blue)" : "none",
                              }}
                            />
                            <span className="speaker-card-name">{s.name}</span>
                          </div>
                          <button
                            className="speaker-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSpeaker(s.id);
                            }}
                            title="Remove Speaker"
                          >
                            <Icons.Close />
                          </button>
                        </div>

                        <div className="speaker-card-mid">
                          <span className="gain-badge">{s.category}</span>
                          <span>{(gain * 100).toFixed(0)}% Gain</span>
                        </div>

                        <div className="gain-meter-track">
                          <div
                            className="gain-meter-bar"
                            style={{
                              width: `${Math.min(100, Math.max(0, gain * 100))}%`,
                              background: "linear-gradient(90deg, #06b6d4, #2563eb)",
                            }}
                          />
                        </div>

                        <div className="speaker-card-bottom">
                          <span style={{ color: "var(--text-muted)" }}>
                            [{s.position.x.toFixed(1)}, {s.position.y.toFixed(1)}, {s.position.z.toFixed(1)}]
                          </span>
                          <span style={{ color: "var(--text-secondary)" }}>{s.orientation.yaw.toFixed(0)}°</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 2: ROOM GEOMETRY */}
              {bottomTab === "room" && (
                <div className="deck-row-content">
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Length (Y-Axis)</span>
                    <span className="deck-stat-value">{project.room.length.toFixed(1)} m</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Width (X-Axis)</span>
                    <span className="deck-stat-value">{project.room.width.toFixed(1)} m</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Height (Z-Axis)</span>
                    <span className="deck-stat-value">{project.room.height.toFixed(1)} m</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Floor Area</span>
                    <span className="deck-stat-value">{(project.room.length * project.room.width).toFixed(1)} m²</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Room Volume</span>
                    <span className="deck-stat-value">
                      {(project.room.length * project.room.width * project.room.height).toFixed(1)} m³
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 3: LISTENER */}
              {bottomTab === "listener" && (
                <div className="deck-row-content">
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Position X, Y</span>
                    <span className="deck-stat-value">
                      {listener.position.x.toFixed(2)}m, {listener.position.y.toFixed(2)}m
                    </span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Ear Height</span>
                    <span className="deck-stat-value">{listener.earHeight.toFixed(2)} m</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Facing Yaw</span>
                    <span className="deck-stat-value">{listener.orientation.yaw.toFixed(0)}°</span>
                  </div>
                  <button className="action-btn" onClick={() => handleSetView("listener")}>
                    <Icons.ListenerView /> Switch to POV Camera
                  </button>
                  <button className="action-btn" onClick={() => handleSelectObject("listener")}>
                    Open Listener Inspector
                  </button>
                </div>
              )}

              {/* Tab 4: VIRTUAL SOURCE */}
              {bottomTab === "source" && (
                <div className="deck-row-content">
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Azimuth Angle</span>
                    <span className="deck-stat-value">{project.virtualSource.azimuth.toFixed(0)}°</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Elevation Angle</span>
                    <span className="deck-stat-value">{(project.virtualSource.elevation || 0).toFixed(0)}°</span>
                  </div>
                  <div className="deck-stat-box">
                    <span className="deck-stat-label">Distance to Listener</span>
                    <span className="deck-stat-value">{project.virtualSource.distance.toFixed(2)} m</span>
                  </div>
                  <button className="action-btn" onClick={() => handleSelectObject("source")}>
                    Open Source Inspector
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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