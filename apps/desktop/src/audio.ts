/* beluga/audio — Tauri bridge for real-time audio engine (spec §42–§47). */

import { invoke } from "@tauri-apps/api/core";
import { BelugaProject } from "./types/project";

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
  max_channels: number;
  default_sample_rate: number;
  n_channels: number;
}

export interface DeviceCapabilities {
  n_channels: number;
  can_stereo: boolean;
  can_surround: boolean;
  can_spatial: boolean;
  recommended_layout: string;
}

export interface Telemetry {
  speaker_gains: number[];
  playhead_samples: number;
  playing: boolean;
  source_len: number;
  sample_rate: number;
  n_channels: number;
  elapsed_ms: number;
}

export interface SourcePosition {
  azimuth: number;
  elevation: number;
  distance: number;
}

/** Enumerate available audio output devices via CPAL. */
export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  return (await invoke("enumerate_audio_devices")) as AudioDevice[];
}

/** Query what Beluga can do with a device that has n output channels. */
export async function getDeviceCapabilities(
  nChannels: number,
): Promise<DeviceCapabilities> {
  return (await invoke("get_device_capabilities", {
    n_channels: nChannels,
  })) as DeviceCapabilities;
}

/** Play a 440 Hz test tone on a single output channel (blocking ~1.5s). */
export async function playChannelTestTone(
  deviceId: string,
  channel: number,
): Promise<void> {
  await invoke("play_channel_test_tone", {
    device_id: deviceId,
    channel: channel,
  });
}

/** Start playback with the given project, device, and channel mapping. */
export async function startPlayback(
  project: BelugaProject,
  deviceId: string,
  channelMapping: number[] = [],
): Promise<string> {
  const projectJson = JSON.stringify(project);
  if (!projectJson || projectJson === "undefined") {
    throw new Error("Project is empty or undefined — cannot serialize");
  }
  console.log("[beluga/audio] invoke start_playback with:", {
    device_id: deviceId,
    project_json_len: projectJson.length,
    channel_mapping: channelMapping,
  });
  return (await invoke("start_playback", {
    project_json: projectJson,
    device_id: deviceId,
    channel_mapping: channelMapping,
  })) as string;
}

/** Stop the current playback and release the audio engine. */
export async function stopPlayback(): Promise<void> {
  await invoke("stop_playback");
}

/** Update the virtual source position (azimuth/elevation/distance). */
export async function setSourcePosition(pos: SourcePosition): Promise<void> {
  await invoke("set_source_position", {
    azimuth: pos.azimuth,
    elevation: pos.elevation,
    distance: pos.distance,
  });
}

/** Update speaker positions in the renderer (real-time drag updates). */
export async function setSpeakerPositions(
  azimuths: number[],
  distances: number[],
): Promise<void> {
  await invoke("set_speaker_positions", {
    azimuths: azimuths,
    distances: distances,
  });
}

/** Toggle playing state without releasing the stream. */
export async function setPlaying(playing: boolean): Promise<void> {
  await invoke("set_playing", { playing });
}

/** Poll telemetry from the audio engine. */
export async function getTelemetry(): Promise<Telemetry> {
  return (await invoke("get_telemetry")) as Telemetry;
}

/** Get per-speaker RMS levels for level matching. */
export async function getLevelMatch(): Promise<number[] | null> {
  return (await invoke("get_level_match")) as number[] | null;
}
