import { useEffect, useRef, useState, useCallback } from "react";
import { BelugaScene, CameraView, SceneUpdate } from "./three/BelugaScene";
import {
  BelugaProject,
  Speaker,
  createDefaultProject,
  createSpeaker,
  SPEAKER_CATEGORIES,
  Vector3,
} from "./types/project";

type TransformMode = "translate" | "rotate";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BelugaScene | null>(null);
  const [project, setProject] = useState<BelugaProject>(createDefaultProject());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [sceneUpdate, setSceneUpdate] = useState<SceneUpdate>({
    speakerGains: [],
    speakerAzimuths: [],
    speakerDistances: [],
  });
  const [placementMode, setPlacementMode] = useState(false);
  const [editingRoom, setEditingRoom] = useState({ ...project.room });
  const speakerCounter = useRef(0);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new BelugaScene(containerRef.current, project);
    sceneRef.current = scene;

    scene.onSelectionChange = (id) => setSelectedId(id);
    scene.onObjectMove = (id, pos) => {
      if (id === "__new_speaker__") {
        // Place new speaker
        speakerCounter.current += 1;
        const newSpeaker = createSpeaker(
          `Speaker ${speakerCounter.current}`,
          pos
        );
        scene.addSpeaker(newSpeaker);
        setProject((prev) => ({
          ...prev,
          speakers: [...prev.speakers, newSpeaker],
        }));
        scene.selectObject(newSpeaker.id);
      } else {
        // Update existing speaker position
        setProject((prev) => ({
          ...prev,
          speakers: prev.speakers.map((s) =>
            s.id === id ? { ...s, position: pos } : s
          ),
        }));
      }
    };
    scene.onSourceMove = (azimuth, distance) => {
      setProject((prev) => ({
        ...prev,
        virtualSource: { ...prev.virtualSource, azimuth, distance },
      }));
    };
    scene.onSceneUpdate = (update) => setSceneUpdate(update);

    // Build initial scene update
    scene.updateSceneUpdate();

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync project changes to scene
  const syncScene = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.project = project;
      sceneRef.current.rebuildSpeakers();
      sceneRef.current.buildListener();
      sceneRef.current.buildSource();
      sceneRef.current.updateSceneUpdate();
    }
  }, [project]);

  // Actions
  const handleAddSpeaker = () => {
    setPlacementMode(true);
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
    setSelectedId(id);
  };

  const handleSetTransformMode = (mode: TransformMode) => {
    setTransformMode(mode);
    sceneRef.current?.setTransformMode(mode);
  };

  const handleSetView = (view: CameraView) => {
    sceneRef.current?.setView(view);
  };

  const handleRoomChange = (field: keyof typeof editingRoom, value: number) => {
    const newRoom = { ...editingRoom, [field]: value };
    setEditingRoom(newRoom);
    setProject((prev) => {
      const updated = { ...prev, room: newRoom };
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
      speakers: prev.speakers.map((s) =>
        s.id === id ? { ...s, name } : s
      ),
    }));
  };

  const handleSpeakerPosChange = (id: string, field: keyof Vector3, value: number) => {
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.map((s) =>
        s.id === id
          ? { ...s, position: { ...s.position, [field]: value } }
          : s
      ),
    }));
    const speaker = project.speakers.find((s) => s.id === id);
    if (speaker) {
      sceneRef.current?.updateSpeakerPosition(id, {
        ...speaker.position,
        [field]: value,
      });
    }
  };

  const handleSpeakerOrientChange = (
    id: string,
    field: "yaw" | "pitch" | "roll",
    value: number
  ) => {
    setProject((prev) => ({
      ...prev,
      speakers: prev.speakers.map((s) =>
        s.id === id
          ? { ...s, orientation: { ...s.orientation, [field]: value } }
          : s
      ),
    }));
    const speaker = project.speakers.find((s) => s.id === id);
    if (speaker) {
      sceneRef.current?.updateSpeakerOrientation(id, {
        ...speaker.orientation,
        [field]: value,
      });
    }
  };

  const handleListenerChange = (
    field: "x" | "y" | "z",
    value: number
  ) => {
    setProject((prev) => ({
      ...prev,
      listeners: prev.listeners.map((l, i) =>
        i === 0 ? { ...l, position: { ...l.position, [field]: value } } : l
      ),
    }));
    const listener = project.listeners[0];
    if (listener) {
      sceneRef.current?.updateListenerPosition({
        ...listener.position,
        [field]: value,
      });
    }
  };

  const handleListenerOrientChange = (field: "yaw" | "pitch" | "roll", value: number) => {
    setProject((prev) => ({
      ...prev,
      listeners: prev.listeners.map((l, i) =>
        i === 0 ? { ...l, orientation: { ...l.orientation, [field]: value } } : l
      ),
    }));
    const listener = project.listeners[0];
    if (listener) {
      sceneRef.current?.updateListenerOrientation({
        ...listener.orientation,
        [field]: value,
      });
    }
  };

  const handleSourceChange = (field: "azimuth" | "distance", value: number) => {
    const updated = { ...project.virtualSource, [field]: value };
    setProject((prev) => ({
      ...prev,
      virtualSource: updated,
    }));
    sceneRef.current?.updateSource(updated.azimuth, updated.distance);
  };

  const handleSaveProject = async () => {
    const json = JSON.stringify(project, null, 2);
    // Use Tauri dialog + fs or fallback to download
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name || "beluga"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = async () => {
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

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <h1 style={{ fontSize: 18, color: "#88bbff" }}>🐋 Beluga</h1>

        {/* Room */}
        <div className="sidebar-section">
          <h2>Room</h2>
          <div className="input-row">
            <label>Length (Y)</label>
            <input
              type="number"
              step="0.1"
              value={editingRoom.length}
              onChange={(e) => handleRoomChange("length", parseFloat(e.target.value) || 0)}
            />
            <span style={{ fontSize: 11, color: "#666" }}>m</span>
          </div>
          <div className="input-row">
            <label>Width (X)</label>
            <input
              type="number"
              step="0.1"
              value={editingRoom.width}
              onChange={(e) => handleRoomChange("width", parseFloat(e.target.value) || 0)}
            />
            <span style={{ fontSize: 11, color: "#666" }}>m</span>
          </div>
          <div className="input-row">
            <label>Height (Z)</label>
            <input
              type="number"
              step="0.1"
              value={editingRoom.height}
              onChange={(e) => handleRoomChange("height", parseFloat(e.target.value) || 0)}
            />
            <span style={{ fontSize: 11, color: "#666" }}>m</span>
          </div>
        </div>

        {/* Speakers */}
        <div className="sidebar-section">
          <h2>Speakers ({project.speakers.length})</h2>
          <button
            className={`btn btn-primary ${placementMode ? "btn-active" : ""}`}
            onClick={handleAddSpeaker}
          >
            {placementMode ? "Click room to place..." : "+ Add Speaker"}
          </button>
          <div style={{ marginTop: 8 }}>
            {project.speakers.map((sp, i) => (
              <div
                key={sp.id}
                className={`speaker-list-item ${selectedId === sp.id ? "selected" : ""}`}
                onClick={() => handleSelectSpeaker(sp.id)}
              >
                <div>
                  <div style={{ fontSize: 13 }}>{sp.name}</div>
                  <div className="speaker-info">
                    ({sp.position.x.toFixed(1)}, {sp.position.y.toFixed(1)}, {sp.position.z.toFixed(1)})
                  </div>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveSpeaker(sp.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Selected speaker editor */}
        {selectedSpeaker && (
          <div className="sidebar-section">
            <h2>Edit: {selectedSpeaker.name}</h2>
            <div className="input-row">
              <label>Name</label>
              <input
                type="text"
                value={selectedSpeaker.name}
                onChange={(e) => handleSpeakerNameChange(selectedSpeaker.id, e.target.value)}
                style={{ width: 120 }}
              />
            </div>
            <div className="input-row">
              <label>X (m)</label>
              <input
                type="number"
                step="0.01"
                value={selectedSpeaker.position.x}
                onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "x", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Y (m)</label>
              <input
                type="number"
                step="0.01"
                value={selectedSpeaker.position.y}
                onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "y", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Z (m)</label>
              <input
                type="number"
                step="0.01"
                value={selectedSpeaker.position.z}
                onChange={(e) => handleSpeakerPosChange(selectedSpeaker.id, "z", parseFloat(e.target.value) || 0)}
              />
            </div>
            <h2 style={{ marginTop: 8 }}>Orientation</h2>
            <div className="input-row">
              <label>Yaw°</label>
              <input
                type="number"
                step="1"
                value={selectedSpeaker.orientation.yaw}
                onChange={(e) => handleSpeakerOrientChange(selectedSpeaker.id, "yaw", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Pitch°</label>
              <input
                type="number"
                step="1"
                value={selectedSpeaker.orientation.pitch}
                onChange={(e) => handleSpeakerOrientChange(selectedSpeaker.id, "pitch", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Roll°</label>
              <input
                type="number"
                step="1"
                value={selectedSpeaker.orientation.roll}
                onChange={(e) => handleSpeakerOrientChange(selectedSpeaker.id, "roll", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="transform-mode-btns">
              <button
                className={`btn ${transformMode === "translate" ? "btn-active" : ""}`}
                onClick={() => handleSetTransformMode("translate")}
              >
                Move
              </button>
              <button
                className={`btn ${transformMode === "rotate" ? "btn-active" : ""}`}
                onClick={() => handleSetTransformMode("rotate")}
              >
                Rotate
              </button>
            </div>
          </div>
        )}

        {/* Listener */}
        {listener && (
          <div className="sidebar-section">
            <h2>Listener</h2>
            <div className="input-row">
              <label>X (m)</label>
              <input
                type="number"
                step="0.01"
                value={listener.position.x}
                onChange={(e) => handleListenerChange("x", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Y (m)</label>
              <input
                type="number"
                step="0.01"
                value={listener.position.y}
                onChange={(e) => handleListenerChange("y", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Z (m)</label>
              <input
                type="number"
                step="0.01"
                value={listener.position.z}
                onChange={(e) => handleListenerChange("z", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Yaw°</label>
              <input
                type="number"
                step="1"
                value={listener.orientation.yaw}
                onChange={(e) => handleListenerOrientChange("yaw", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="input-row">
              <label>Ear Ht</label>
              <input
                type="number"
                step="0.01"
                value={listener.earHeight}
                onChange={(e) => {
                  setProject((prev) => ({
                    ...prev,
                    listeners: prev.listeners.map((l, i) =>
                      i === 0 ? { ...l, earHeight: parseFloat(e.target.value) || 0 } : l
                    ),
                  }));
                }}
              />
              <span style={{ fontSize: 11, color: "#666" }}>m</span>
            </div>
          </div>
        )}

        {/* Virtual source */}
        <div className="sidebar-section">
          <h2>Virtual Source</h2>
          <div className="input-row">
            <label>Azimuth°</label>
            <input
              type="number"
              step="1"
              value={project.virtualSource.azimuth}
              onChange={(e) => handleSourceChange("azimuth", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="input-row">
            <label>Dist (m)</label>
            <input
              type="number"
              step="0.1"
              value={project.virtualSource.distance}
              onChange={(e) => handleSourceChange("distance", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Project actions */}
        <div className="sidebar-section">
          <h2>Project</h2>
          <div className="btn-group">
            <button className="btn" onClick={handleSaveProject}>
              Save
            </button>
            <button className="btn" onClick={handleLoadProject}>
              Load / Import
            </button>
          </div>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="viewport-container" ref={containerRef}>
        {/* Gain overlay */}
        <div className="gain-overlay">
          <h3>Speaker Gains</h3>
          {project.speakers.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666" }}>Add speakers to see gains</div>
          ) : (
            project.speakers.map((sp, i) => {
              const gain = sceneUpdate.speakerGains[i] || 0;
              const az = sceneUpdate.speakerAzimuths[i] || 0;
              const dist = sceneUpdate.speakerDistances[i] || 0;
              return (
                <div key={sp.id} className="gain-bar-row">
                  <span className="name">{sp.name}</span>
                  <div className="gain-bar-container">
                    <div
                      className="gain-bar"
                      style={{ width: `${gain * 100}%` }}
                    />
                  </div>
                  <span className="value">{gain.toFixed(3)}</span>
                  <span style={{ fontSize: 10, color: "#666", minWidth: 60 }}>
                    {az.toFixed(0)}° {dist.toFixed(1)}m
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Camera controls */}
        <div className="camera-controls">
          <button className="btn" onClick={() => handleSetView("orbit")}>Orbit</button>
          <button className="btn" onClick={() => handleSetView("top")}>Top</button>
          <button className="btn" onClick={() => handleSetView("front")}>Front</button>
          <button className="btn" onClick={() => handleSetView("listener")}>Listener</button>
        </div>
      </div>
    </div>
  );
}