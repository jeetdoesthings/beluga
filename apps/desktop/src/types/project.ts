// Shared types between UI and renderer (matches spec §60 data model)

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Orientation {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface Room {
  name: string;
  length: number; // meters, along Y
  width: number;  // meters, along X
  height: number; // meters, along Z
  modelPath?: string;      // for GLB import
  modelTransform?: { scale: number; rotation: number; offsetX: number; offsetY: number; offsetZ: number };
}

export interface Speaker {
  id: string;
  name: string;
  category: string;
  position: Vector3;
  orientation: Orientation;
  enabled: boolean;
}

export interface Listener {
  id: string;
  name: string;
  position: Vector3;
  orientation: Orientation;
  earHeight: number;
}

export interface VirtualSource {
  id: string;
  azimuth: number;   // degrees, listener-relative
  elevation: number;
  distance: number;
}

export interface BelugaProject {
  name: string;
  room: Room;
  speakers: Speaker[];
  listeners: Listener[];
  activeListenerId: string | null;
  virtualSource: VirtualSource;
}

export const SPEAKER_CATEGORIES = [
  "Generic", "Active", "Passive", "Bookshelf", "Floorstanding",
  "Ceiling", "Subwoofer", "Laptop", "Custom",
] as const;

export function createDefaultProject(): BelugaProject {
  const listenerId = crypto.randomUUID();
  return {
    name: "Untitled",
    room: { name: "Room", length: 5.0, width: 4.0, height: 2.8 },
    speakers: [],
    listeners: [
      {
        id: listenerId,
        name: "Listener",
        position: { x: 0, y: 0, z: 1.1 },
        orientation: { yaw: 0, pitch: 0, roll: 0 },
        earHeight: 1.1,
      },
    ],
    activeListenerId: listenerId,
    virtualSource: { id: "src-1", azimuth: 0, elevation: 0, distance: 2.0 },
  };
}

export function createSpeaker(name: string, position: Vector3): Speaker {
  return {
    id: crypto.randomUUID(),
    name,
    category: "Generic",
    position,
    orientation: { yaw: 0, pitch: 0, roll: 0 },
    enabled: true,
  };
}