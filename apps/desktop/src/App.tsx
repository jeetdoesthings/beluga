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
} from "./types/project";

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
  const speakerCounter = useRef(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // Initialize BelugaScene 3D Viewport
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new BelugaScene(containerRef.current, project);
    sceneRef.current = scene;

    scene.onSelectionChange = (id) => setSelectedId(id);
    scene.onTransformModeChange = (mode) => setTransformMode(mode);

    scene.onSpeakerMove = (id, pos, orient) => {
      setProject((prev) => {
        const updated = {
          ...prev,
          speakers: prev.speakers.map((s) => (s.id === id ? { ...s, position: pos, orientation: orient } : s)),
        };
        // Keep scene's internal project in sync so it doesn't hold stale speaker objects
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
    showToast("Click floor to place speaker (Esc to cancel)");
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

  const handleSelectSpeaker = (id: string | null) => {
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
        // When Z (height) changes via this input, propagate to earHeight too
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

  const handleListenerOrientChange = (field: keyof Orientation, value: number) => {
    setProject((prev) => {
      const updatedListeners = prev.listeners.map((l, i) =>
        i === 0 ? { ...l, orientation: { ...l.orientation, [field]: value } } : l
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

  const handleSourceAzimuth = (value: number) => {
    setProject((prev) => {
      const updatedSource = { ...prev.virtualSource, azimuth: value };
      const updated = { ...prev, virtualSource: updatedSource };
      if (sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateSource(value, updatedSource.elevation || 0, updatedSource.distance);
      }
      return updated;
    });
  };

  const handleSourceElevation = (value: number) => {
    setProject((prev) => {
      const updatedSource = { ...prev.virtualSource, elevation: value };
      const updated = { ...prev, virtualSource: updatedSource };
      if (sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateSource(updatedSource.azimuth, value, updatedSource.distance);
      }
      return updated;
    });
  };

  const handleSourceDistance = (value: number) => {
    setProject((prev) => {
      const updatedSource = { ...prev.virtualSource, distance: value };
      const updated = { ...prev, virtualSource: updatedSource };
      if (sceneRef.current) {
        sceneRef.current.project = updated;
        sceneRef.current.updateSource(updatedSource.azimuth, updatedSource.elevation || 0, value);
      }
      return updated;
    });
  };

  const requestPreset = (name: string, presetFn: (p: BelugaProject) => BelugaProject) => {
    if (project.speakers.length > 0) {
      setConfirmPreset({ name, fn: presetFn });
    } else {
      executePreset(presetFn, name);
    }
  };

  const executePreset = (presetFn: (p: BelugaProject) => BelugaProject, name: string) => {
    const updated = presetFn(project);
    setProject(updated);
    if (sceneRef.current) {
      sceneRef.current.updateProject(updated);
    }
    setConfirmPreset(null);
    showToast(`Applied ${name} layout`);
  };

  const handleClearSpeakers = () => {
    const updated = { ...project, speakers: [] };
    setProject(updated);
    if (sceneRef.current) {
      sceneRef.current.updateProject(updated);
      sceneRef.current.selectObject("listener");
    }
    setSelectedId("listener");
    showToast("Cleared all speakers");
  };

  const handleSaveProject = () => {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name || "beluga"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Saved project JSON");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.glb";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.name.endsWith(".json")) {
        const text = await file.text();
        const loaded = JSON.parse(text) as BelugaProject;
        setProject(loaded);
        sceneRef.current?.updateProject(loaded);
        showToast("Loaded project file");
      } else if (file.name.endsWith(".glb")) {
        const buf = await file.arrayBuffer();
        sceneRef.current?.loadGLB(buf);
        showToast("Imported 3D GLB room mesh");
      }
    };
    input.click();
  };

  const selectedSpeaker = project.speakers.find((s) => s.id === selectedId);
  const listener = project.listeners[0];

  // Out of bounds check for selected speaker
  const isSpeakerOutOfBounds = selectedSpeaker
    ? Math.abs(selectedSpeaker.position.x) > project.room.width / 2 ||
      Math.abs(selectedSpeaker.position.y) > project.room.length / 2 ||
      selectedSpeaker.position.z > project.room.height ||
      selectedSpeaker.position.z < 0
    : false;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>🐋 Beluga</h1>
          <p className="sidebar-subtitle">Spatial Audio Calibration & Room Visualizer</p>
        </div>

        <div className="sidebar-content">
          {/* Quick Presets */}
          <div className="section">
            <div className="section-title">Layout Presets</div>
            <div className="btn-row">
              <button className="btn btn-preset" onClick={() => requestPreset("2.0 Stereo", createStereoPreset)}>
                2.0 Stereo
              </button>
              <button className="btn btn-preset" onClick={() => requestPreset("5.1 Surround", create51Preset)}>
                5.1 Surround
              </button>
              <button className="btn btn-preset" onClick={() => requestPreset("7.1.4 Atmos", create714Preset)}>
                7.1.4 Atmos
              </button>
              <button className="btn btn-danger" onClick={handleClearSpeakers}>
                Clear All
              </button>
            </div>
          </div>

          {/* Room Dimensions */}
          <div className="section">
            <div className="section-title">Room Dimensions</div>
            <div className="input-group">
              <label>Length (Y)</label>
              <input
                type="number"
                step="0.1"
                value={project.room.length}
                onChange={(e) => handleRoomChange("length", parseFloat(e.target.value) || 0)}
              />
              <span className="unit">m</span>
            </div>
            <div className="input-group">
              <label>Width (X)</label>
              <input
                type="number"
                step="0.1"
                value={project.room.width}
                onChange={(e) => handleRoomChange("width", parseFloat(e.target.value) || 0)}
              />
              <span className="unit">m</span>
            </div>
            <div className="input-group">
              <label>Height (Z)</label>
              <input
                type="number"
                step="0.1"
                value={project.room.height}
                onChange={(e) => handleRoomChange("height", parseFloat(e.target.value) || 0)}
              />
              <span className="unit">m</span>
            </div>
          </div>

          {/* Speakers */}
          <div className="section">
            <div className="section-title">Loudspeakers ({project.speakers.length})</div>
            <button
              className={`btn btn-primary ${placingSpeaker ? "placing" : ""}`}
              style={{ width: "100%", marginBottom: 10 }}
              onClick={handleAddSpeaker}
            >
              {placingSpeaker ? "Click floor to place speaker →" : "+ Add Speaker"}
            </button>
            {project.speakers.length === 0 && (
              <div className="tip">Click "+ Add Speaker" or select a Preset layout above.</div>
            )}
            {project.speakers.map((sp, i) => {
              const gain = sceneUpdate.speakerGains[i] || 0;
              return (
                <div
                  key={sp.id}
                  className={`spk-card ${selectedId === sp.id ? "selected" : ""}`}
                  onClick={() => handleSelectSpeaker(sp.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      className="spk-dot"
                      style={{
                        background: gain > 0.001 ? "#00e5ff" : "#007aff",
                        boxShadow: gain > 0.001 ? `0 0 ${12 * gain}px #00e5ff` : "none",
                      }}
                    />
                    <div>
                      <div className="spk-name-text">{sp.name}</div>
                      <div className="spk-meta">
                        <span className="badge">{sp.category}</span>
                        {(sceneUpdate.speakerAzimuths[i] || 0).toFixed(0)}° · {(sceneUpdate.speakerElevations[i] || 0).toFixed(0)}°el · {(sceneUpdate.speakerDistances[i] || 0).toFixed(1)}m
                      </div>
                    </div>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSpeaker(sp.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Listener Setup */}
          {listener && (
            <div className="section">
              <div className="section-title">Listener Setup</div>
              <div className="input-row-3">
                <div className="input-compact">
                  <label>X (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={listener.position.x}
                    onChange={(e) => handleListenerPosChange("x", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="input-compact">
                  <label>Y (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={listener.position.y}
                    onChange={(e) => handleListenerPosChange("y", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="input-compact">
                  <label>Ear Height (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={listener.earHeight || listener.position.z}
                    onChange={(e) => handleListenerEarHeightChange(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="slider-row">
                <label>Facing Yaw</label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step="1"
                  value={listener.orientation.yaw}
                  onChange={(e) => handleListenerOrientChange("yaw", parseFloat(e.target.value))}
                />
                <span className="value">{listener.orientation.yaw.toFixed(0)}°</span>
              </div>
            </div>
          )}

          {/* Virtual Sound Source */}
          <div className="section">
            <div className="section-title">Virtual Audio Source</div>
            <div className="slider-row">
              <label>Azimuth</label>
              <input
                type="range"
                min={-180}
                max={180}
                step="1"
                value={project.virtualSource.azimuth}
                onChange={(e) => handleSourceAzimuth(parseFloat(e.target.value))}
              />
              <span className="value">{project.virtualSource.azimuth.toFixed(0)}°</span>
            </div>

            <div className="slider-row">
              <label>Elevation</label>
              <input
                type="range"
                min={-90}
                max={90}
                step="1"
                value={project.virtualSource.elevation || 0}
                onChange={(e) => handleSourceElevation(parseFloat(e.target.value))}
              />
              <span className="value">{(project.virtualSource.elevation || 0).toFixed(0)}°</span>
            </div>

            <div className="slider-row">
              <label>Distance</label>
              <input
                type="range"
                min={0.5}
                max={10}
                step="0.1"
                value={project.virtualSource.distance}
                onChange={(e) => handleSourceDistance(parseFloat(e.target.value))}
              />
              <span className="value">{project.virtualSource.distance.toFixed(1)}m</span>
            </div>
          </div>

          {/* Project Storage */}
          <div className="section">
            <div className="section-title">Project Storage</div>
            <div className="btn-row">
              <button className="btn" onClick={handleImport}>
                Import JSON / GLB
              </button>
              <button className="btn btn-primary" onClick={handleSaveProject}>
                Save Project
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Viewport Area */}
      <div className="viewport" ref={containerRef}>
        {/* Toast Message Notification */}
        {toastMessage && <div className="glass-overlay toast-notification">{toastMessage}</div>}

        {/* Preset Confirmation Modal */}
        {confirmPreset && (
          <div className="modal-backdrop">
            <div className="glass-overlay modal-card">
              <h3>Replace Existing Layout?</h3>
              <p>Applying the {confirmPreset.name} preset will clear your current speakers.</p>
              <div className="btn-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setConfirmPreset(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => executePreset(confirmPreset.fn, confirmPreset.name)}
                >
                  Replace Layout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Gain Bars Panel */}
        <div className="glass-overlay gain-panel">
          <h3>Calculated VBAP Gains</h3>
          {project.speakers.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Add speakers to observe VBAP gains</div>
          ) : (
            project.speakers.map((sp, i) => {
              const gain = sceneUpdate.speakerGains[i] || 0;
              const az = sceneUpdate.speakerAzimuths[i] || 0;
              const elev = sceneUpdate.speakerElevations[i] || 0;
              const dist = sceneUpdate.speakerDistances[i] || 0;
              const isActive = gain > 0.001;
              return (
                <div key={sp.id} className={`gain-row ${isActive ? "active-gain" : ""}`}>
                  <span className="spk-name">{sp.name}</span>
                  <div className="gain-bar-bg">
                    <div
                      className="gain-bar-fill"
                      style={{
                        width: `${gain * 100}%`,
                        background: isActive ? "linear-gradient(90deg, #007aff, #00e5ff)" : "var(--text-tertiary)",
                      }}
                    />
                  </div>
                  <span className="gain-val">{gain.toFixed(2)}</span>
                  <span className="spk-info">
                    {az.toFixed(0)}° · {elev.toFixed(0)}° · {dist.toFixed(1)}m
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Right Speaker Inspector Panel */}
        {selectedSpeaker && (
          <div className="glass-overlay right-inspector-panel">
            <div className="inspector-header">
              <h3>{selectedSpeaker.name}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isSpeakerOutOfBounds && <span className="warn-badge">Outside Room</span>}
                <button className="remove-btn" onClick={() => setSelectedId(null)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="input-group" style={{ marginTop: 8 }}>
              <label>Name</label>
              <input
                type="text"
                value={selectedSpeaker.name}
                onChange={(e) => handleSpeakerNameChange(selectedSpeaker.id, e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>Category</label>
              <select
                value={selectedSpeaker.category}
                onChange={(e) => handleSpeakerCategoryChange(selectedSpeaker.id, e.target.value)}
                className="select-input"
              >
                {SPEAKER_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="sub-title">Position (meters)</div>
            <div className="input-row-3">
              <div className="input-compact">
                <label>X</label>
                <input
                  type="number"
                  step="0.05"
                  value={selectedSpeaker.position.x}
                  onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "x", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="input-compact">
                <label>Y</label>
                <input
                  type="number"
                  step="0.05"
                  value={selectedSpeaker.position.y}
                  onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "y", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="input-compact">
                <label>Height (Z)</label>
                <input
                  type="number"
                  step="0.05"
                  value={selectedSpeaker.position.z}
                  onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "z", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="sub-title">Orientation (degrees)</div>
            <div className="slider-row">
              <label>Facing Yaw</label>
              <input
                type="range"
                min={-180}
                max={180}
                step="1"
                value={selectedSpeaker.orientation.yaw}
                onChange={(e) => handleSpeakerOrientChange(selectedSpeaker.id, "yaw", parseFloat(e.target.value))}
              />
              <span className="value">{selectedSpeaker.orientation.yaw.toFixed(0)}°</span>
            </div>
          </div>
        )}

        {/* Floating Camera Toolbar */}
        <div className="glass-overlay cam-toolbar">
          {(["orbit", "top", "front", "listener"] as CameraView[]).map((v) => (
            <button
              key={v}
              className={`cam-btn ${currentView === v ? "active" : ""}`}
              onClick={() => handleSetView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Viewport Shortcuts & Controls HUD Bar */}
        <div className="glass-overlay hud-bar">
          <div className="gizmo-modes">
            <button
              className={`hud-mode-btn ${transformMode === "translate" ? "active" : ""}`}
              onClick={() => handleTransformMode("translate")}
              disabled={!selectedId}
            >
              Move [W]
            </button>
            <button
              className={`hud-mode-btn ${transformMode === "rotate" ? "active" : ""}`}
              onClick={() => handleTransformMode("rotate")}
              disabled={!selectedId}
            >
              Rotate [E]
            </button>
            <button
              className={`hud-mode-btn ${transformMode === "scale" ? "active" : ""}`}
              onClick={() => handleTransformMode("scale")}
              disabled={!selectedId}
            >
              Scale [R]
            </button>
            <button
              className="hud-mode-btn active"
              onClick={() => sceneRef.current?.focusSelectedObject()}
              disabled={!selectedId}
            >
              Focus [F]
            </button>
          </div>
          <div className="hud-hint">Drag 3D Gizmo Arrows or Speaker Mesh | Esc: Deselect | Del: Remove</div>
        </div>
      </div>
    </div>
  );
}