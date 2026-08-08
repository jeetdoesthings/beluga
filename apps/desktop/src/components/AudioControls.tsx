import { AudioDevice, DeviceCapabilities, Telemetry } from "../audio";
import { BelugaProject, createStereoPreset, Speaker } from "../types/project";
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
  Speaker: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 1 3 3v8a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="18" x2="12" y2="23" />
    </svg>
  ),
  Assign: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.72 19.72 0 0 1-8.63-3.07 19.42 19.42 0 0 1-5.66-5.66 19.72 19.72 0 0 1-2.97-8.68 2 2 0 0 1 1.64-2.08h2.1a2 2 0 0 1 2 1.66l-1 .22a2 2 0 0 1-1.33-1.66l0-.19a2 2 0 0 1 1.99-1.99 16.76 16.76 0 0 1 5.07 2.92 16.76 16.76 0 0 1 2.92 5.07 16.6 16.6 0 0 1 0 3.67 2 2 0 0 1-1.66 1.33l-.19-.01z" />
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
  deviceCapabilities: DeviceCapabilities | null;
  isPlaying: boolean;
  telemetry: Telemetry | null;
  onPlayPause: () => void;
  onStart: () => void;
  onStop: () => void;
  onSourcePosChange: (field: "azimuth" | "elevation" | "distance", value: number) => void;
  onApplyPreset: (fn: (p: BelugaProject) => BelugaProject, name: string) => void;
  onPlayChannelTestTone: (channel: number) => Promise<void>;
  onAssignSpeakerChannel: (speakerId: string | null, channel: number | null) => void;
  onSelectSpeaker: (id: string | null) => void;
  selectedSpeakerId: string | null;
  project: BelugaProject;
  onClose: () => void;
}

export function AudioControls({
  audioDevices,
  selectedDevice,
  onSelectDevice,
  deviceCapabilities,
  isPlaying,
  telemetry,
  onPlayPause,
  onStart,
  onStop,
  onSourcePosChange,
  onApplyPreset,
  onPlayChannelTestTone,
  onAssignSpeakerChannel,
  onSelectSpeaker,
  selectedSpeakerId,
  project,
  onClose,
}: AudioControlsProps) {
  const selectedDev = audioDevices.find((d) => d.id === selectedDevice);
  const nDeviceChannels = selectedDev?.n_channels ?? 0;

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
      width={320}
      onClose={onClose}
    >
      {/* ─── Device Selection ─── */}
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

      {/* ─── Device Capabilities ─── */}
      {deviceCapabilities && nDeviceChannels > 0 && (
        <div className="field-section">
          <div className="slider-header" style={{ marginBottom: 4 }}>
            <span className="section-label">Device Channels</span>
            <span className="slider-readout">{nDeviceChannels} ch</span>
          </div>
          <div className="capability-grid">
            <span className={`cap-item ${deviceCapabilities.can_stereo ? "cap-yes" : "cap-no"}`}>
              {deviceCapabilities.can_stereo ? "✓" : "✗"} Stereo
            </span>
            <span className={`cap-item ${deviceCapabilities.can_surround ? "cap-yes" : "cap-no"}`}>
              {deviceCapabilities.can_surround ? "✓" : "✗"} Surround
            </span>
            <span className={`cap-item ${deviceCapabilities.can_spatial ? "cap-yes" : "cap-no"}`}>
              {deviceCapabilities.can_spatial ? "✓" : "✗"} Spatial
            </span>
          </div>
          <div className="capability-recommended" style={{ fontSize: 11, marginTop: 4 }}>
            Recommended: {deviceCapabilities.recommended_layout}
          </div>
        </div>
      )}

      {/* ─── Speaker Warning ─── */}
      {project.speakers.length < 2 && (
        <div className="warning-bar">
          <span className="warning-icon">⚠</span>
          <span className="warning-text">
            {project.speakers.length === 0
              ? "No endpoints in scene."
              : "Only 1 endpoint — VBAP needs ≥2 for panning. Audio will play only in the left channel."}
          </span>
          <button
            className="preset-quick-btn"
            onClick={() => onApplyPreset(createStereoPreset, "Stereo 2.0")}
            title="Load Stereo 2.0 preset (2 endpoints at ±30°)"
          >
            Stereo Preset
          </button>
        </div>
      )}

      {/* ─── Channel Calibration ─── */}
      {nDeviceChannels > 0 && (
        <div className="field-section">
          <div className="slider-header">
            <span className="section-label">Channel Calibration</span>
            <span className="slider-readout">{nDeviceChannels} outputs</span>
          </div>
          <div className="channel-cal-list">
            {Array.from({ length: nDeviceChannels }).map((_, i) => {
              const assignedSpeaker = project.speakers.find((s) => s.channel === i);
              return (
                <div key={i} className="channel-cal-row">
                  <span className="channel-label">Output {i + 1}</span>
                  <button
                    className="action-btn small"
                    onClick={() => { void onPlayChannelTestTone(i); }}
                    title={`Play test tone on output ${i + 1}`}
                    style={{ padding: "2px 8px", fontSize: 11 }}
                  >
                    Play Test
                  </button>
                  <span className="channel-assigned">
                    {assignedSpeaker ? assignedSpeaker.name : <span style={{ opacity: 0.5 }}>Unassigned</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Endpoint-Channel Mapping ─── */}
      {project.speakers.length > 0 && nDeviceChannels > 0 && (
        <div className="field-section">
          <label className="field-label">Endpoint → Channel Mapping</label>
          <div className="mapping-list">
            {project.speakers.map((sp) => {
              const assignedChannel = sp.channel;
              const availableChannels = Array.from({ length: nDeviceChannels }).map((_, i) => i);
              return (
                <div key={sp.id} className="mapping-row">
                  <span
                    className="mapping-speaker-name"
                    onClick={() => onSelectSpeaker(sp.id)}
                    style={{
                      cursor: "pointer",
                      fontWeight: selectedSpeakerId === sp.id ? 600 : 400,
                      color: selectedSpeakerId === sp.id ? "var(--accent-blue)" : "inherit",
                    }}
                    title="Click to select in 3D view"
                  >
                    {sp.name}
                  </span>
                  <select
                    className="combo-box small"
                    value={assignedChannel ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value);
                      onAssignSpeakerChannel(sp.id, val);
                    }}
                    style={{ width: 100 }}
                  >
                    <option value="">Unassigned</option>
                    {availableChannels.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch + 1}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Playback Controls ─── */}
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

      {/* ─── Telemetry ─── */}
      {telemetry && (
        <div className="field-section">
          <div className="slider-header">
            <span className="section-label">Playhead</span>
            <span className="slider-readout">
              {formatTime(telemetry.playhead_samples, telemetry.sample_rate)}
            </span>
          </div>
          <div className="slider-header">
            <span className="section-label">Endpoints</span>
            <span className="slider-readout">{telemetry.speaker_gains.length} ch</span>
          </div>
          <div className="slider-header">
            <span className="section-label">Elapsed</span>
            <span className="slider-readout">{telemetry.elapsed_ms}ms</span>
          </div>
          <div className="slider-header">
            <span className="section-label">Gains</span>
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

      {/* ─── Source Position ─── */}
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
