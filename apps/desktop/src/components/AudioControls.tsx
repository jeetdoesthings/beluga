import { AudioDevice, Telemetry } from "../audio";
import { BelugaProject, createStereoPreset } from "../types/project";
import { DraggableWindow } from "./DraggableWindow";
import { SnapSlider } from "./SnapSlider";

const Icons = {
  Play: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6 4 22 12 6 20V4z" />
    </svg>
  ),
  Stop: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  ),
  Volume: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5V2m0 20v-3M8 8a4 4 0 0 1 8 0M5 10a8 8 0 0 1 14 0" />
    </svg>
  ),
};

const angleSnaps = [
  { value: -180, label: "-180°" },
  { value: -90, label: "-90°" },
  { value: 0, label: "0°" },
  { value: 90, label: "90°" },
  { value: 180, label: "180°" },
];

interface AudioControlsProps {
  audioDevices: AudioDevice[];
  selectedDevice: string;
  onSelectDevice: (id: string) => void;
  isPlaying: boolean;
  telemetry: Telemetry | null;
  onPlayPause: () => void;
  onStart: () => void;
  onStop: () => void;
  onSourcePosChange: (field: "azimuth" | "elevation" | "distance", value: number) => void;
  onApplyPreset: (fn: (p: BelugaProject) => BelugaProject, name: string) => void;
  project: BelugaProject;
  onClose: () => void;
}

export function AudioControls({
  audioDevices,
  selectedDevice,
  onSelectDevice,
  isPlaying,
  telemetry,
  onPlayPause,
  onStart,
  onStop,
  onSourcePosChange,
  onApplyPreset,
  project,
  onClose,
}: AudioControlsProps) {
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1920;

  const handleSourceChange = (field: "azimuth" | "elevation" | "distance", value: number) => {
    onSourcePosChange(field, value);
  };

  const formatTime = (samples: number, sampleRate: number) => {
    if (sampleRate === 0) return "0:00";
    const secs = samples / sampleRate;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <DraggableWindow
      id="audio-window"
      title="Audio Engine"
      icon={
        <div className="window-icon badge-source">
          <Icons.Volume />
        </div>
      }
      defaultPosition={{ x: 40, y: 280 }}
      width={290}
      onClose={onClose}
    >
      <div className="field-section">
        <label className="field-label">Output Device</label>
        <select
          value={selectedDevice}
          onChange={(e) => onSelectDevice(e.target.value)}
          className="combo-box"
        >
          {audioDevices.map((dev) => (
            <option key={dev.id} value={dev.id}>
              {dev.is_default ? `${dev.name} (default)` : dev.name}
            </option>
          ))}
        </select>
      </div>

      {/* Warning: VBAP requires ≥2 speakers for panning */}
      {project.speakers.length < 2 && (
        <div className="warning-bar">
          <span className="warning-icon">⚠</span>
          <span className="warning-text">
            {project.speakers.length === 0
              ? "No speakers in scene."
              : "Only 1 speaker — VBAP needs ≥2 for panning. Audio will play only in the left channel."}
          </span>
          <button
            className="preset-quick-btn"
            onClick={() => onApplyPreset(createStereoPreset, "Stereo 2.0")}
            title="Load Stereo 2.0 preset (2 speakers at ±30°)"
          >
            Stereo Preset
          </button>
        </div>
      )}

      <div className="btn-grid-2" style={{ marginTop: 8 }}>
        {!isPlaying ? (
          <button className="action-btn primary" onClick={onStart}>
            <Icons.Play /> Start Playback
          </button>
        ) : (
          <button className="action-btn" onClick={onStop}>
            <Icons.Stop /> Stop
          </button>
        )}
        <button className="action-btn" onClick={onPlayPause}>
          {isPlaying ? <Icons.Stop /> : <Icons.Play />}
          {isPlaying ? " Pause" : " Play"}
        </button>
      </div>

      {telemetry && (
        <div className="field-section">
          <div className="slider-header">
            <span className="section-label">Playhead</span>
            <span className="slider-readout">
              {formatTime(telemetry.playhead_samples, telemetry.sample_rate)}
            </span>
          </div>
          <div className="slider-header">
            <span className="section-label">Speakers</span>
            <span className="slider-readout">{telemetry.n_channels} ch</span>
          </div>
          <div className="slider-header">
            <span className="section-label">Elapsed</span>
            <span className="slider-readout">{telemetry.elapsed_ms}ms</span>
          </div>
          <div className="slider-header">
            <span className="section-label">Gain</span>
            <span className="slider-readout">
              {telemetry.speaker_gains.length > 0
                ? `[${telemetry.speaker_gains
                    .map((g) => g.toFixed(2))
                    .join(", ")}]`
                : "—"}
            </span>
          </div>
        </div>
      )}

      <div className="field-section">
        <div className="slider-header">
          <span className="section-label">Azimuth</span>
          <span className="slider-readout">
            {project.virtualSource.azimuth.toFixed(1)}°
          </span>
        </div>
        <SnapSlider
          value={project.virtualSource.azimuth}
          min={-180}
          max={180}
          step={1}
          snapPoints={angleSnaps}
          onChange={(val) => handleSourceChange("azimuth", val)}
        />
      </div>

      <div className="field-section">
        <div className="slider-header">
          <span className="section-label">Elevation</span>
          <span className="slider-readout">
            {project.virtualSource.elevation.toFixed(1)}°
          </span>
        </div>
        <SnapSlider
          value={project.virtualSource.elevation}
          min={-90}
          max={90}
          step={1}
          snapPoints={[{ value: -90, label: "-90°" }, { value: -45, label: "-45°" }, { value: 0, label: "0°" }, { value: 45, label: "45°" }, { value: 90, label: "90°" }]}
          onChange={(val) => handleSourceChange("elevation", val)}
        />
      </div>

      <div className="field-section">
        <div className="slider-header">
          <span className="section-label">Distance</span>
          <span className="slider-readout">
            {project.virtualSource.distance.toFixed(2)}m
          </span>
        </div>
        <SnapSlider
          value={project.virtualSource.distance}
          min={0.5}
          max={10}
          step={0.1}
          snapThreshold={0.3}
          snapPoints={[{ value: 1, label: "1m" }, { value: 2, label: "2m" }, { value: 3, label: "3m" }, { value: 5, label: "5m" }, { value: 10, label: "10m" }]}
          onChange={(val) => handleSourceChange("distance", val)}
        />
      </div>
    </DraggableWindow>
  );
}
