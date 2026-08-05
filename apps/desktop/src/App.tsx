import { useEffect, useRef, useState, useCallback } from "react";
import { BelugaScene, CameraView, SceneUpdate } from "./three/BelugaScene";
import {
  BelugaProject,
  createDefaultProject,
  createSpeaker,
  Vector3,
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
  });
  const [placingSpeaker, setPlacingSpeaker] = useState(false);
  const [currentView, setCurrentView] = useState<CameraView>("orbit");
  const speakerCounter = useRef(0);

  // Init scene
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new BelugaScene(containerRef.current, project);
    sceneRef.current = scene;

    scene.onSelectionChange = (id) => setSelectedId(id);
    scene.onSpeakerMove = (id, pos) => {
      setProject((prev) => ({
        ...prev,
        speakers: prev.speakers.map((s) => (s.id === id ? { ...s, position: pos } : s)),
      }));
    };
    scene.onListenerMove = (pos) => {
      setProject((prev) => ({
        ...prev,
        listeners: prev.listeners.map((l, i) => (i === 0 ? { ...l, position: pos } : l)),
      }));
    };
    scene.onSourceMove = (azimuth, distance) => {
      setProject((prev) => ({
        ...prev,
        virtualSource: { ...prev.virtualSource, azimuth, distance },
      }));
    };
    scene.onPlacementRequest = (pos) => {
      speakerCounter.current += 1;
      const speaker = createSpeaker(`Speaker ${speakerCounter.current}`, pos);
      scene.addSpeaker(speaker);
      setProject((prev) => ({
        ...prev,
        speakers: [...prev.speakers, speaker],
      }));
      scene.selectObject(speaker.id);
      setPlacingSpeaker(false);
    };
    scene.onSceneUpdate = (update) => setSceneUpdate(update);

    scene.updateGainVisualization();

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const handleAddSpeaker = () => {
    setPlacingSpeaker(true);
    sceneRef.current?.setPlacementMode("speaker");
  };

  const handleRemoveSpeaker = (id: string) => {
    sceneRef.current?.removeSpeaker(id);
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.filter((s) => s.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSelectSpeaker = (id: string) => {
    sceneRef.current?.selectObject(id);
  };

  const handleSetView = (view: CameraView) => {
    setCurrentView(view);
    sceneRef.current?.setView(view);
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
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  };

  const handleSpeakerPosChange = (id: string, field: keyof Vector3, value: number) => {
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.map((s) =>
        s.id === id ? { ...s, position: { ...s.position, [field]: value } } : s
      ),
    }));
    const speaker = project.speakers.find((s) => s.id === id);
    if (speaker) {
      sceneRef.current?.updateSpeakerPosition(id, { ...speaker.position, [field]: value });
    }
  };

  const handleListenerChange = (field: keyof Vector3, value: number) => {
    setProject((prev) => ({
      ...prev,
      listeners: prev.listeners.map((l, i) =>
        i === 0 ? { ...l, position: { ...l.position, [field]: value } } : l
      ),
    }));
    const listener = project.listeners[0];
    if (listener) {
      sceneRef.current?.updateListenerPosition?.({ ...listener.position, [field]: value });
    }
  };

  const handleListenerYaw = (value: number) => {
    setProject((prev) => ({
      ...prev,
      listeners: prev.listeners.map((l, i) =>
        i === 0 ? { ...l, orientation: { ...l.orientation, yaw: value } } : l
      ),
    }));
    const listener = project.listeners[0];
    if (listener) {
      sceneRef.current?.updateListenerOrientation?.({ ...listener.orientation, yaw: value });
    }
  };

  const handleSourceAzimuth = (value: number) => {
    const dist = project.virtualSource.distance;
    setProject((prev) => ({
      ...prev,
      virtualSource: { ...prev.virtualSource, azimuth: value },
    }));
    sceneRef.current?.updateSource(value, dist);
  };

  const handleSourceDistance = (value: number) => {
    const az = project.virtualSource.azimuth;
    setProject((prev) => ({
      ...prev,
      virtualSource: { ...prev.virtualSource, distance: value },
    }));
    sceneRef.current?.updateSource(az, value);
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
      } else if (file.name.endsWith(".glb")) {
        const buf = await file.arrayBuffer();
        sceneRef.current?.loadGLB(buf);
      }
    };
    input.click();
  };

  const selectedSpeaker = project.speakers.find((s) => s.id === selectedId);
  const listener = project.listeners[0];
  const maxAz = 180;
  const minDist = 0.5;
  const maxDist = 8;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>🐋 Beluga</h1>
        </div>
        <div className="sidebar-content">
          {/* Room */}
          <div className="section">
            <div className="section-title">Room</div>
            <div className="input-group">
              <label>Length</label>
              <input type="number" step="0.1" value={project.room.length}
                onChange={(e) => handleRoomChange("length", parseFloat(e.target.value) || 0)} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>m</span>
            </div>
            <div className="input-group">
              <label>Width</label>
              <input type="number" step="0.1" value={project.room.width}
                onChange={(e) => handleRoomChange("width", parseFloat(e.target.value) || 0)} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>m</span>
            </div>
            <div className="input-group">
              <label>Height</label>
              <input type="number" step="0.1" value={project.room.height}
                onChange={(e) => handleRoomChange("height", parseFloat(e.target.value) || 0)} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>m</span>
            </div>
          </div>

          {/* Speakers */}
          <div className="section">
            <div className="section-title">Speakers ({project.speakers.length})</div>
            <button
              className={`btn btn-primary ${placingSpeaker ? "placing" : ""}`}
              style={{ width: "100%", marginBottom: 10 }}
              onClick={handleAddSpeaker}
            >
              {placingSpeaker ? "Click in the 3D view to place →" : "+ Add Speaker"}
            </button>
            {project.speakers.length === 0 && (
              <div className="tip">Click "Add Speaker" then click on the floor to place</div>
            )}
            {project.speakers.map((sp, i) => (
              <div
                key={sp.id}
                className={`spk-card ${selectedId === sp.id ? "selected" : ""}`}
                onClick={() => handleSelectSpeaker(sp.id)}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div className="spk-dot" style={{
                    background: `rgb(${0 + (50 - 0) * (sceneUpdate.speakerGains[i] || 0)}, ${122 + (200 - 122) * (sceneUpdate.speakerGains[i] || 0)}, 255)`,
                  }} />
                  <div>
                    <div className="spk-name-text">{sp.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {(sceneUpdate.speakerAzimuths[i] || 0).toFixed(0)}° · {(sceneUpdate.speakerDistances[i] || 0).toFixed(1)}m
                    </div>
                  </div>
                </div>
                <button className="remove-btn" onClick={(e) => { e.stopPropagation(); handleRemoveSpeaker(sp.id); }}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Selected speaker editor */}
          {selectedSpeaker && (
            <div className="section">
              <div className="section-title">{selectedSpeaker.name}</div>
              <div className="input-group">
                <label>Name</label>
                <input type="text" value={selectedSpeaker.name}
                  onChange={(e) => handleSpeakerNameChange(selectedSpeaker.id, e.target.value)} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                Drag the speaker in the 3D view to reposition
              </div>
              <div className="input-group">
                <label>X</label>
                <input type="number" step="0.01" value={selectedSpeaker.position.x.toFixed(2)}
                  onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "x", parseFloat(e.target.value) || 0)} />
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>m</span>
              </div>
              <div className="input-group">
                <label>Y</label>
                <input type="number" step="0.01" value={selectedSpeaker.position.y.toFixed(2)}
                  onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "y", parseFloat(e.target.value) || 0)} />
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>m</span>
              </div>
              <div className="input-group">
                <label>Height</label>
                <input type="number" step="0.01" value={selectedSpeaker.position.z.toFixed(2)}
                  onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "z", parseFloat(e.target.value) || 0)} />
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>m</span>
              </div>
            </div>
          )}

          {/* Listener */}
          {listener && (
            <div className="section">
              <div className="section-title">Listener</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                Drag the listener in the 3D view to reposition
              </div>
              <div className="slider-row">
                <label>Facing</label>
                <input type="range" min={-180} max={180} step="1" value={listener.orientation.yaw}
                  onChange={(e) => handleListenerYaw(parseFloat(e.target.value))} />
                <span className="value">{listener.orientation.yaw.toFixed(0)}°</span>
              </div>
            </div>
          )}

          {/* Virtual source */}
          <div className="section">
            <div className="section-title">Virtual Source</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
              Drag the purple sphere in the 3D view to move
            </div>
            <div className="slider-row">
              <label>Azimuth</label>
              <input type="range" min={-180} max={180} step="1" value={project.virtualSource.azimuth}
                onChange={(e) => handleSourceAzimuth(parseFloat(e.target.value))} />
              <span className="value">{project.virtualSource.azimuth.toFixed(0)}°</span>
            </div>
            <div className="slider-row">
              <label>Distance</label>
              <input type="range" min={minDist} max={maxDist} step="0.1" value={project.virtualSource.distance}
                onChange={(e) => handleSourceDistance(parseFloat(e.target.value))} />
              <span className="value">{project.virtualSource.distance.toFixed(1)}m</span>
            </div>
          </div>

          {/* Project */}
          <div className="section">
            <div className="section-title">Project</div>
            <div className="btn-row">
              <button className="btn" onClick={handleImport}>Import Room / Load</button>
              <button className="btn" onClick={handleSaveProject}>Save</button>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="viewport" ref={containerRef}>
        {/* Gain overlay */}
        <div className="glass-overlay gain-panel">
          <h3>Speaker Gains</h3>
          {project.speakers.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Add speakers to see gains</div>
          ) : (
            project.speakers.map((sp, i) => {
              const gain = sceneUpdate.speakerGains[i] || 0;
              const az = sceneUpdate.speakerAzimuths[i] || 0;
              const dist = sceneUpdate.speakerDistances[i] || 0;
              return (
                <div key={sp.id} className="gain-row">
                  <span className="spk-name">{sp.name}</span>
                  <div className="gain-bar-bg">
                    <div className="gain-bar-fill" style={{ width: `${gain * 100}%` }} />
                  </div>
                  <span className="gain-val">{gain.toFixed(2)}</span>
                  <span className="spk-info">{az.toFixed(0)}° {dist.toFixed(1)}m</span>
                </div>
              );
            })
          )}
        </div>

        {/* Camera toolbar */}
        <div className="glass-overlay cam-toolbar">
          {(["orbit", "top", "front", "listener"] as CameraView[]).map((v) => (
            <button key={v}
              className={`cam-btn ${currentView === v ? "active" : ""}`}
              onClick={() => handleSetView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}