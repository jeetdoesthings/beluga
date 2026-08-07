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
  "Ceiling", "Subwoofer", "Laptop", "Monitor", "Custom",
] as const;

export function createDefaultProject(): BelugaProject {
  const listenerId = crypto.randomUUID();
  return {
    name: "Untitled Room Project",
    room: { name: "Room", length: 6.0, width: 5.0, height: 2.8 },
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

export function createSpeaker(name: string, position: Vector3, category: string = "Generic"): Speaker {
  return {
    id: crypto.randomUUID(),
    name,
    category,
    position,
    orientation: { yaw: 0, pitch: 0, roll: 0 },
    enabled: true,
  };
}

/** Calculate world position from listener-relative azimuth, distance, height offset, taking listener yaw into account */
function relativeToWorldPos(
  listenerPos: Vector3,
  listenerYawDeg: number,
  azimuthDeg: number,
  distance: number,
  heightZ: number
): Vector3 {
  const worldAzRad = ((listenerYawDeg + azimuthDeg) * Math.PI) / 180;
  return {
    x: listenerPos.x + distance * Math.sin(worldAzRad),
    y: listenerPos.y + distance * Math.cos(worldAzRad),
    z: heightZ,
  };
}

export function createStereoPreset(project: BelugaProject): BelugaProject {
  const listener = project.listeners[0] || { position: { x: 0, y: 0, z: 1.1 }, orientation: { yaw: 0, pitch: 0, roll: 0 } };
  const lp = listener.position;
  const yaw = listener.orientation.yaw;
  const dist = 2.0;

  const leftPos = relativeToWorldPos(lp, yaw, -30, dist, lp.z);
  const rightPos = relativeToWorldPos(lp, yaw, 30, dist, lp.z);

  return {
    ...project,
    speakers: [
      createSpeaker("Left (L)", leftPos, "Bookshelf"),
      createSpeaker("Right (R)", rightPos, "Bookshelf"),
    ],
  };
}

export function create51Preset(project: BelugaProject): BelugaProject {
  const listener = project.listeners[0] || { position: { x: 0, y: 0, z: 1.1 }, orientation: { yaw: 0, pitch: 0, roll: 0 } };
  const lp = listener.position;
  const yaw = listener.orientation.yaw;
  const dist = 2.2;

  const spks: { name: string; az: number; cat: string }[] = [
    { name: "Center (C)", az: 0, cat: "Bookshelf" },
    { name: "Front Left (FL)", az: -30, cat: "Floorstanding" },
    { name: "Front Right (FR)", az: 30, cat: "Floorstanding" },
    { name: "Surround Left (SL)", az: -110, cat: "Bookshelf" },
    { name: "Surround Right (SR)", az: 110, cat: "Bookshelf" },
    { name: "Subwoofer (LFE)", az: 45, cat: "Subwoofer" },
  ];

  return {
    ...project,
    speakers: spks.map((s) => {
      const d = s.cat === "Subwoofer" ? 1.5 : dist;
      const h = s.cat === "Subwoofer" ? 0.2 : lp.z;
      const pos = relativeToWorldPos(lp, yaw, s.az, d, h);
      return createSpeaker(s.name, pos, s.cat);
    }),
  };
}

export function create714Preset(project: BelugaProject): BelugaProject {
  const listener = project.listeners[0] || { position: { x: 0, y: 0, z: 1.1 }, orientation: { yaw: 0, pitch: 0, roll: 0 } };
  const lp = listener.position;
  const yaw = listener.orientation.yaw;
  const dist = 2.5;

  const earSpks: { name: string; az: number; cat: string }[] = [
    { name: "Center (C)", az: 0, cat: "Bookshelf" },
    { name: "Front Left (FL)", az: -30, cat: "Floorstanding" },
    { name: "Front Right (FR)", az: 30, cat: "Floorstanding" },
    { name: "Side Left (SL)", az: -90, cat: "Bookshelf" },
    { name: "Side Right (SR)", az: 90, cat: "Bookshelf" },
    { name: "Rear Left (RL)", az: -135, cat: "Bookshelf" },
    { name: "Rear Right (RR)", az: 135, cat: "Bookshelf" },
    { name: "Subwoofer (LFE)", az: 30, cat: "Subwoofer" },
  ];

  const heightSpks: { name: string; az: number }[] = [
    { name: "Top Front Left (TFL)", az: -45 },
    { name: "Top Front Right (TFR)", az: 45 },
    { name: "Top Rear Left (TRL)", az: -135 },
    { name: "Top Rear Right (TRR)", az: 135 },
  ];

  const speakers: Speaker[] = [
    ...earSpks.map((s) => {
      const d = s.cat === "Subwoofer" ? 1.5 : dist;
      const h = s.cat === "Subwoofer" ? 0.2 : lp.z;
      const pos = relativeToWorldPos(lp, yaw, s.az, d, h);
      return createSpeaker(s.name, pos, s.cat);
    }),
    ...heightSpks.map((s) => {
      const pos = relativeToWorldPos(lp, yaw, s.az, 1.8, lp.z + 1.2);
      return createSpeaker(s.name, pos, "Ceiling");
    }),
  ];

  return {
    ...project,
    speakers,
  };
}