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
  Presets: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
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
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevronUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
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
  const [bottomTab, setBottomTab] = useState<"room" | "listener" | "source">("room");
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
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
    if (val === "stereo") applyPreset(createStereoPreset, "Stereo 2.0");
    else if (val === "5.1") applyPreset(create51Preset, "Surround 5.1");
    else if (val === "7.1.4") applyPreset(create714Preset, "Spatial Atmos 7.1.4");
    e.target.value = ""; // Reset dropdown after selection
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

      {/* ─── Main Content (3D Viewport + Overlays) ─── */}
      <div className="main-content">
        {/* 3D Viewport Container */}
        <div className="viewport-container" ref={containerRef}>
          {/* Top Center Floating Navigation Bar with Single Presets Dropdown */}
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
                <option value="stereo">Stereo 2.0 (2 Channels)</option>
                <option value="5.1">Surround 5.1 (6 Channels)</option>
                <option value="7.1.4">Spatial Atmos 7.1.4 (12 Channels)</option>
              </select>
              <span className="preset-chevron">
                <Icons.ChevronDown />
              </span>
            </div>

            <div className="control-divider" />

            {/* Live Audio Engine Status */}
            <div className="status-pill">
              <span className="live-dot" />
              <span>VBAP 3D</span>
            </div>
          </div>

          {/* Top-Left Floating VBAP Acoustic Meter Panel (Selecting speaker selects in 3D) */}
          <div className="gain-meter-panel glass-overlay">
            <div className="panel-header">
              <div className="panel-title">
                <Icons.Acoustics /> Live Gains ({project.speakers.length})
              </div>
            </div>

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
                      title="Click to select and focus speaker in 3D"
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
                        [{s.position.x.toFixed(2)}, {s.position.y.toFixed(2)}, {s.position.z.toFixed(2)}] · Az: {az.toFixed(1)}° · {dist.toFixed(2)}m
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Top-Right Floating Contextual Inspector */}
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
                  <button className="inspector-close-btn" onClick={() => handleSelectObject(null)} title="Deselect">
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

                  {/* Speaker Type / Category in Dropdown */}
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
                    <div className="coord-cell">
                      <span className="coord-cell-label">X (Left/Right)</span>
                      <input
                        type="number"
                        step="0.01"
                        className="coord-cell-input"
                        value={selectedSpeaker.position.x.toFixed(2)}
                        onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "x", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Y (Front/Back)</span>
                      <input
                        type="number"
                        step="0.01"
                        className="coord-cell-input"
                        value={selectedSpeaker.position.y.toFixed(2)}
                        onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "y", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Z (Height)</span>
                      <input
                        type="number"
                        step="0.01"
                        className="coord-cell-input"
                        value={selectedSpeaker.position.z.toFixed(2)}
                        onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "z", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                <div className="field-section">
                  <div className="slider-group">
                    <div className="slider-header">
                      <span className="section-label">Facing Yaw Orientation</span>
                      <span className="slider-readout">{selectedSpeaker.orientation.yaw.toFixed(1)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
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
                    <span>Az: <strong>{selectedSpeakerAzimuth.toFixed(1)}°</strong></span>
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
                  <button className="inspector-close-btn" onClick={() => handleSelectObject(null)} title="Deselect">
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
                        step="0.01"
                        className="coord-cell-input"
                        value={listener.position.x.toFixed(2)}
                        onChange={(e) => handleListenerPosChange("x", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Y (Front/Back)</span>
                      <input
                        type="number"
                        step="0.01"
                        className="coord-cell-input"
                        value={listener.position.y.toFixed(2)}
                        onChange={(e) => handleListenerPosChange("y", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Ear Height (Z)</span>
                      <input
                        type="number"
                        step="0.01"
                        className="coord-cell-input"
                        value={listener.earHeight.toFixed(2)}
                        onChange={(e) => handleListenerEarHeightChange(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                <div className="field-section">
                  <div className="slider-group">
                    <div className="slider-header">
                      <span className="section-label">Head Facing Direction</span>
                      <span className="slider-readout">{listener.orientation.yaw.toFixed(1)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      className="studio-slider"
                      value={listener.orientation.yaw}
                      onChange={(e) => handleListenerOrientChange(parseFloat(e.target.value))}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <button className="cat-pill" onClick={() => handleListenerOrientChange(0)}>Front (0°)</button>
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
                  <button className="inspector-close-btn" onClick={() => handleSelectObject(null)} title="Deselect">
                    <Icons.Close />
                  </button>
                </div>

                <div className="field-section">
                  <div className="slider-group">
                    <div className="slider-header">
                      <span className="section-label">Azimuth Angle</span>
                      <span className="slider-readout">{project.virtualSource.azimuth.toFixed(1)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
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
                      <span className="slider-readout">{(project.virtualSource.elevation || 0).toFixed(1)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="1"
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
                      step="0.05"
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
                        step="0.01"
                        min="1"
                        className="coord-cell-input"
                        value={project.room.length.toFixed(2)}
                        onChange={(e) => handleRoomChange("length", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Width (X)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        className="coord-cell-input"
                        value={project.room.width.toFixed(2)}
                        onChange={(e) => handleRoomChange("width", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="coord-cell">
                      <span className="coord-cell-label">Height (Z)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        className="coord-cell-input"
                        value={project.room.height.toFixed(2)}
                        onChange={(e) => handleRoomChange("height", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </div>

                <div className="field-section" style={{ background: "rgba(248,250,252,0.8)", padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                  <span className="section-label">Calculated Room Acoustics</span>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11 }}>
                    <span>Floor Area: <strong>{(project.room.length * project.room.width).toFixed(2)} m²</strong></span>
                    <span>Volume: <strong>{(project.room.length * project.room.width * project.room.height).toFixed(2)} m³</strong></span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ─── Floating Transparent & Centered Bottom Window (Minimalistic) ─── */}
          <div className="floating-bottom-dock glass-overlay">
            {/* Dock Minimalist Navigation Bar */}
            <div className="dock-nav-bar">
              <div className="dock-tabs">
                <button
                  className={`dock-tab ${bottomTab === "room" ? "active" : ""}`}
                  onClick={() => { setBottomTab("room"); setIsDockCollapsed(false); }}
                >
                  <Icons.Room />
                  Room Geometry
                </button>

                <button
                  className={`dock-tab ${bottomTab === "listener" ? "active" : ""}`}
                  onClick={() => { setBottomTab("listener"); setIsDockCollapsed(false); handleSelectObject("listener"); }}
                >
                  <Icons.Listener />
                  Listener Sweet Spot
                </button>

                <button
                  className={`dock-tab ${bottomTab === "source" ? "active" : ""}`}
                  onClick={() => { setBottomTab("source"); setIsDockCollapsed(false); handleSelectObject("source"); }}
                >
                  <Icons.Source />
                  Audio Source
                </button>
              </div>

              <div className="dock-nav-spacer" />

              <button
                className="dock-toggle-btn"
                onClick={() => setIsDockCollapsed(!isDockCollapsed)}
                title={isDockCollapsed ? "Expand Window" : "Collapse Window"}
              >
                {isDockCollapsed ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
              </button>
            </div>

            {/* Minimalist Dock Body */}
            {!isDockCollapsed && (
              <div className="dock-body">
                {/* Tab 1: ROOM GEOMETRY */}
                {bottomTab === "room" && (
                  <>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Length (Y)</span>
                      <span className="dock-stat-value">{project.room.length.toFixed(2)} m</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Width (X)</span>
                      <span className="dock-stat-value">{project.room.width.toFixed(2)} m</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Height (Z)</span>
                      <span className="dock-stat-value">{project.room.height.toFixed(2)} m</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Floor Area</span>
                      <span className="dock-stat-value">{(project.room.length * project.room.width).toFixed(2)} m²</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Volume</span>
                      <span className="dock-stat-value">
                        {(project.room.length * project.room.width * project.room.height).toFixed(2)} m³
                      </span>
                    </div>
                  </>
                )}

                {/* Tab 2: LISTENER */}
                {bottomTab === "listener" && (
                  <>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Position [X, Y]</span>
                      <span className="dock-stat-value">
                        [{listener.position.x.toFixed(2)}, {listener.position.y.toFixed(2)}] m
                      </span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Ear Height</span>
                      <span className="dock-stat-value">{listener.earHeight.toFixed(2)} m</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Facing Yaw</span>
                      <span className="dock-stat-value">{listener.orientation.yaw.toFixed(1)}°</span>
                    </div>
                    <button className="action-btn" onClick={() => handleSetView("listener")}>
                      <Icons.ListenerView /> POV Camera
                    </button>
                  </>
                )}

                {/* Tab 3: VIRTUAL SOURCE */}
                {bottomTab === "source" && (
                  <>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Azimuth</span>
                      <span className="dock-stat-value">{project.virtualSource.azimuth.toFixed(1)}°</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Elevation</span>
                      <span className="dock-stat-value">{(project.virtualSource.elevation || 0).toFixed(1)}°</span>
                    </div>
                    <div className="dock-stat-box">
                      <span className="dock-stat-label">Distance</span>
                      <span className="dock-stat-value">{project.virtualSource.distance.toFixed(2)} m</span>
                    </div>
                    <button className="action-btn" onClick={() => { handleSourceChange("azimuth", 0); handleSourceChange("elevation", 0); }}>
                      Reset Center
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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