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

  /** Keep auto-naming counter aligned with existing speakers (imports, presets, removals) */
  const syncSpeakerCounter = (speakers: Speaker[]) => {
    let max = speakers.length;
    for (const s of speakers) {
      const m = /^Speaker (\d+)$/.exec(s.name);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    speakerCounter.current = max;
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
    syncSpeakerCounter(updated.speakers);
    if (sceneRef.current) {
      sceneRef.current.updateProject(updated);
    }
    setConfirmPreset(null);
    showToast(`Applied ${name} layout`);
  };

  const handleClearSpeakers = () => {
    const updated = { ...project, speakers: [] };
    setProject(updated);
    syncSpeakerCounter([]);
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
      try {
        if (file.name.endsWith(".json")) {
          const text = await file.text();
          const loaded = JSON.parse(text) as BelugaProject;
          // Validate the essential structure to avoid crashing the scene
          if (!loaded || typeof loaded !== "object" || !Array.isArray(loaded.speakers) || !Array.isArray(loaded.listeners) || !loaded.room || !loaded.virtualSource) {
            throw new Error("Invalid project file: missing room, speakers, listeners, or virtualSource");
          }
          setProject(loaded);
          sceneRef.current?.updateProject(loaded);
          // Keep the speaker counter aligned so new placements don't collide with imported names
          syncSpeakerCounter(loaded.speakers);
          showToast("Loaded project file");
        } else if (file.name.endsWith(".glb")) {
          const buf = await file.arrayBuffer();
          sceneRef.current?.loadGLB(buf);
          showToast("Imported 3D GLB room mesh");
        } else {
          showToast("Unsupported file type (use .json or .glb)");
        }
      } catch (err) {
        showToast(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    };
    input.click();
  };

  const [bottomTab, setBottomTab] = useState<"room" | "listener" | "source" | "speakers">("speakers");
  const [bottomCollapsed, setBottomCollapsed] = useState(false);

  const selectedSpeaker = project.speakers.find((s) => s.id === selectedId);
  const listener = project.listeners[0];

  const isSpeakerOutOfBounds = selectedSpeaker
    ? Math.abs(selectedSpeaker.position.x) > project.room.width / 2 ||
      Math.abs(selectedSpeaker.position.y) > project.room.length / 2 ||
      selectedSpeaker.position.z > project.room.height ||
      selectedSpeaker.position.z < 0
    : false;

  return (
    <div className="app-layout">
      {/* ═══ Left Icon Toolbar ═══ */}
      <div className="toolbar">
        <div className="toolbar-logo">B</div>

        <button className={`tool-btn ${placingSpeaker ? "placing" : ""}`} title="Add Speaker" onClick={handleAddSpeaker}>
          +
        </button>

        <div className="toolbar-separator" />

        <button className="tool-btn" title="2.0 Stereo" onClick={() => requestPreset("2.0 Stereo", createStereoPreset)}>
          2.0
        </button>
        <button className="tool-btn" title="5.1 Surround" onClick={() => requestPreset("5.1 Surround", create51Preset)}>
          5.1
        </button>
        <button className="tool-btn" title="7.1.4 Atmos" onClick={() => requestPreset("7.1.4 Atmos", create714Preset)}>
          7.1
        </button>

        <div className="toolbar-separator" />

        <button className="tool-btn danger" title="Clear All Speakers" onClick={handleClearSpeakers}>
          ⌫
        </button>

        <div className="toolbar-spacer" />

        <button className="tool-btn" title="Import JSON / GLB" onClick={handleImport}>
          ↓
        </button>
        <button className="tool-btn" title="Save Project" onClick={handleSaveProject}>
          ↑
        </button>
      </div>

      {/* ═══ Main Area ═══ */}
      <div className="main-area">
        {/* ─── 3D Viewport ─── */}
        <div className="viewport" ref={containerRef}>
          {/* Toast */}
          {toastMessage && <div className="float-panel toast-notification">{toastMessage}</div>}

          {/* Preset Confirm Modal */}
          {confirmPreset && (
            <div className="modal-backdrop">
              <div className="modal-card">
                <h3>Replace Existing Layout?</h3>
                <p>Applying the {confirmPreset.name} preset will clear your current speakers.</p>
                <div className="btn-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setConfirmPreset(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={() => executePreset(confirmPreset.fn, confirmPreset.name)}>
                    Replace
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating Gain Panel */}
          <div className="float-panel gain-panel">
            <h3>VBAP Gains</h3>
            {project.speakers.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Add speakers to view gains</div>
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
                          background: isActive ? "linear-gradient(90deg, #2563eb, #06b6d4)" : "var(--border)",
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

          {/* Floating Right Inspector — only when speaker selected */}
          {selectedSpeaker && (
            <div className="float-panel right-inspector">
              <div className="inspector-header">
                <h3>{selectedSpeaker.name}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isSpeakerOutOfBounds && <span className="warn-badge">Out of bounds</span>}
                  <button className="inspector-close" onClick={() => setSelectedId(null)}>✕</button>
                </div>
              </div>

              <div className="insp-field">
                <label>Name</label>
                <input
                  type="text"
                  value={selectedSpeaker.name}
                  onChange={(e) => handleSpeakerNameChange(selectedSpeaker.id, e.target.value)}
                />
              </div>

              <div className="insp-field">
                <label>Category</label>
                <select
                  value={selectedSpeaker.category}
                  onChange={(e) => handleSpeakerCategoryChange(selectedSpeaker.id, e.target.value)}
                >
                  {SPEAKER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="insp-label">Position (m)</div>
              <div className="insp-row-3">
                <div className="insp-compact">
                  <label>X</label>
                  <input type="number" step="0.05" value={selectedSpeaker.position.x}
                    onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "x", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="insp-compact">
                  <label>Y</label>
                  <input type="number" step="0.05" value={selectedSpeaker.position.y}
                    onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "y", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="insp-compact">
                  <label>Z</label>
                  <input type="number" step="0.05" value={selectedSpeaker.position.z}
                    onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "z", parseFloat(e.target.value) || 0)} />
                </div>
              </div>

              <div className="insp-slider">
                <label>Yaw</label>
                <input type="range" min={-180} max={180} step="1"
                  value={selectedSpeaker.orientation.yaw}
                  onChange={(e) => handleSpeakerOrientChange(selectedSpeaker.id, "yaw", parseFloat(e.target.value))} />
                <span className="value">{selectedSpeaker.orientation.yaw.toFixed(0)}°</span>
              </div>
            </div>
          )}

          {/* Camera Toolbar */}
          <div className="float-panel cam-toolbar">
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

          {/* HUD Bar */}
          <div className="float-panel hud-bar">
            <div className="gizmo-modes">
              <button className={`hud-mode-btn ${transformMode === "translate" ? "active" : ""}`}
                onClick={() => handleTransformMode("translate")} disabled={!selectedId}>Move</button>
              <button className={`hud-mode-btn ${transformMode === "rotate" ? "active" : ""}`}
                onClick={() => handleTransformMode("rotate")} disabled={!selectedId}>Rotate</button>
              <button className="hud-mode-btn active"
                onClick={() => sceneRef.current?.focusSelectedObject()} disabled={!selectedId}>Focus</button>
            </div>
            <div className="hud-hint">Drag arrows to move · Click empty to deselect · Del to remove</div>
          </div>
        </div>

        {/* ═══ Bottom Panel ═══ */}
        <div className={`bottom-panel ${bottomCollapsed ? "collapsed" : ""}`}>
          <div className="bottom-tabs">
            <button className={`bottom-tab ${bottomTab === "room" ? "active" : ""}`} onClick={() => { setBottomTab("room"); setBottomCollapsed(false); }}>
              Room
            </button>
            <button className={`bottom-tab ${bottomTab === "listener" ? "active" : ""}`} onClick={() => { setBottomTab("listener"); setBottomCollapsed(false); }}>
              Listener
            </button>
            <button className={`bottom-tab ${bottomTab === "source" ? "active" : ""}`} onClick={() => { setBottomTab("source"); setBottomCollapsed(false); }}>
              Source
            </button>
            <button className={`bottom-tab ${bottomTab === "speakers" ? "active" : ""}`} onClick={() => { setBottomTab("speakers"); setBottomCollapsed(false); }}>
              Speakers
              <span className="bottom-tab-count">{project.speakers.length}</span>
            </button>
            <div className="tab-spacer" />
            <button className="collapse-btn" onClick={() => setBottomCollapsed(!bottomCollapsed)} title={bottomCollapsed ? "Expand" : "Collapse"}>
              {bottomCollapsed ? "▲" : "▼"}
            </button>
          </div>

          {!bottomCollapsed && (
            <div className="bottom-content">
              {/* Room Tab */}
              {bottomTab === "room" && (
                <div className="props-row">
                  <div className="prop-field">
                    <label>Length</label>
                    <input type="number" step="0.1" value={project.room.length}
                      onChange={(e) => handleRoomChange("length", parseFloat(e.target.value) || 0)} />
                    <span className="unit">m</span>
                  </div>
                  <div className="prop-field">
                    <label>Width</label>
                    <input type="number" step="0.1" value={project.room.width}
                      onChange={(e) => handleRoomChange("width", parseFloat(e.target.value) || 0)} />
                    <span className="unit">m</span>
                  </div>
                  <div className="prop-field">
                    <label>Height</label>
                    <input type="number" step="0.1" value={project.room.height}
                      onChange={(e) => handleRoomChange("height", parseFloat(e.target.value) || 0)} />
                    <span className="unit">m</span>
                  </div>
                </div>
              )}

              {/* Listener Tab */}
              {bottomTab === "listener" && listener && (
                <div className="props-row">
                  <div className="prop-field">
                    <label>X</label>
                    <input type="number" step="0.05" value={listener.position.x}
                      onChange={(e) => handleListenerPosChange("x", parseFloat(e.target.value) || 0)} />
                    <span className="unit">m</span>
                  </div>
                  <div className="prop-field">
                    <label>Y</label>
                    <input type="number" step="0.05" value={listener.position.y}
                      onChange={(e) => handleListenerPosChange("y", parseFloat(e.target.value) || 0)} />
                    <span className="unit">m</span>
                  </div>
                  <div className="prop-field">
                    <label>Ear Height</label>
                    <input type="number" step="0.05" value={listener.earHeight || listener.position.z}
                      onChange={(e) => handleListenerEarHeightChange(parseFloat(e.target.value) || 0)} />
                    <span className="unit">m</span>
                  </div>
                  <div className="prop-slider">
                    <label>Yaw</label>
                    <input type="range" min={-180} max={180} step="1" value={listener.orientation.yaw}
                      onChange={(e) => handleListenerOrientChange("yaw", parseFloat(e.target.value))} />
                    <span className="value">{listener.orientation.yaw.toFixed(0)}°</span>
                  </div>
                </div>
              )}

              {/* Source Tab */}
              {bottomTab === "source" && (
                <div className="props-row">
                  <div className="prop-slider">
                    <label>Azimuth</label>
                    <input type="range" min={-180} max={180} step="1" value={project.virtualSource.azimuth}
                      onChange={(e) => handleSourceAzimuth(parseFloat(e.target.value))} />
                    <span className="value">{project.virtualSource.azimuth.toFixed(0)}°</span>
                  </div>
                  <div className="prop-slider">
                    <label>Elevation</label>
                    <input type="range" min={-90} max={90} step="1" value={project.virtualSource.elevation || 0}
                      onChange={(e) => handleSourceElevation(parseFloat(e.target.value))} />
                    <span className="value">{(project.virtualSource.elevation || 0).toFixed(0)}°</span>
                  </div>
                  <div className="prop-slider">
                    <label>Distance</label>
                    <input type="range" min={0.5} max={10} step="0.1" value={project.virtualSource.distance}
                      onChange={(e) => handleSourceDistance(parseFloat(e.target.value))} />
                    <span className="value">{project.virtualSource.distance.toFixed(1)}m</span>
                  </div>
                </div>
              )}

              {/* Speakers Tab */}
              {bottomTab === "speakers" && (
                <div className="speakers-grid">
                  <button
                    className={`add-speaker-inline ${placingSpeaker ? "placing" : ""}`}
                    onClick={handleAddSpeaker}
                  >
                    {placingSpeaker ? "Click floor to place →" : "+ Add"}
                  </button>
                  {project.speakers.length === 0 && (
                    <div className="empty-state">No speakers yet. Click + Add or use a preset from the toolbar.</div>
                  )}
                  {project.speakers.map((sp, i) => {
                    const gain = sceneUpdate.speakerGains[i] || 0;
                    return (
                      <div
                        key={sp.id}
                        className={`spk-chip ${selectedId === sp.id ? "selected" : ""}`}
                        onClick={() => handleSelectSpeaker(sp.id)}
                      >
                        <div
                          className="spk-dot"
                          style={{
                            background: gain > 0.001 ? "#06b6d4" : "#2563eb",
                            boxShadow: gain > 0.001 ? `0 0 ${8 * gain}px #06b6d4` : "none",
                          }}
                        />
                        <div className="spk-chip-info">
                          <div className="spk-chip-name">{sp.name}</div>
                          <div className="spk-chip-meta">
                            <span className="spk-chip-badge">{sp.category}</span>
                            {(sceneUpdate.speakerAzimuths[i] || 0).toFixed(0)}° · {(sceneUpdate.speakerDistances[i] || 0).toFixed(1)}m
                          </div>
                        </div>
                        <button
                          className="remove-btn"
                          onClick={(e) => { e.stopPropagation(); handleRemoveSpeaker(sp.id); }}
                        >✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}