// VBAP math ported from Python beluga/geometry.py + vbap.py for browser-side gain calculation.
// Spec §18, §31-§33.

import type { Vector3, Orientation } from "./types/project";

export function toListenerRelative(
  position: Vector3,
  listenerPos: Vector3,
  listenerOrient: Orientation
): { distance: number; azimuth: number; elevation: number } {
  // 1. rel = position - listenerPos
  const rel = { x: position.x - listenerPos.x, y: position.y - listenerPos.y, z: position.z - listenerPos.z };

  // 2. Apply inverse listener orientation (roll, pitch, yaw reverse order, negated)
  let v = rotY(rel, -listenerOrient.roll);
  v = rotX(v, -listenerOrient.pitch);
  v = rotZ(v, -listenerOrient.yaw);

  // 3. distance
  const distance = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  // 4. azimuth (clockwise from +Y forward)
  const xy = Math.sqrt(v.x * v.x + v.y * v.y);
  let azimuth = (Math.atan2(v.x, v.y) * 180) / Math.PI;

  // Normalize to (-180, 180]
  while (azimuth > 180) azimuth -= 360;
  while (azimuth <= -180) azimuth += 360;

  // 5. elevation
  let elevation = 0;
  if (xy > 1e-12) {
    elevation = (Math.atan2(v.z, xy) * 180) / Math.PI;
  } else {
    elevation = v.z > 0 ? 90 : -90;
  }

  return { distance, azimuth, elevation };
}

function rotZ(v: Vector3, deg: number): Vector3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

function rotX(v: Vector3, deg: number): Vector3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function rotY(v: Vector3, deg: number): Vector3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

export function azimuthToUnitVector(azimuthDeg: number): Vector3 {
  const a = (azimuthDeg * Math.PI) / 180;
  return { x: Math.sin(a), y: Math.cos(a), z: 0 };
}

// 2D VBAP

export function selectPair(speakerAzimuths: number[], targetAzimuth: number): [number, number] {
  const n = speakerAzimuths.length;
  if (n < 2) throw new Error("VBAP 2D requires at least 2 speakers");

  const azs = speakerAzimuths
    .map((a, idx) => ({ rad: (a * Math.PI) / 180 % (2 * Math.PI), idx }))
    .sort((a, b) => a.rad - b.rad);

  const t = (targetAzimuth * Math.PI) / 180 % (2 * Math.PI);

  for (let k = 0; k < n; k++) {
    const a0 = azs[k];
    const a1 = azs[(k + 1) % n];
    if (a0.rad <= a1.rad) {
      if (a0.rad <= t && t <= a1.rad) return [a0.idx, a1.idx];
    } else {
      if (t >= a0.rad || t <= a1.rad) return [a0.idx, a1.idx];
    }
  }

  // Fallback
  const best = azs.reduce((min, x) => Math.abs(x.rad - t) < Math.abs(min.rad - t) ? x : min);
  const nextIdx = azs[(azs.indexOf(best) + 1) % n].idx;
  return [best.idx, nextIdx];
}

export function solveGains(
  L1: Vector3, L2: Vector3, target: Vector3
): [number, number] {
  const base = cross(L1, L2);
  const baseNormSq = dot(base, base);
  if (baseNormSq < 1e-14) return [0, 0];

  const g1 = dot(cross(target, L2), base) / baseNormSq;
  const g2 = dot(cross(L1, target), base) / baseNormSq;
  return [g1, g2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function renderVBAP2D(speakerAzimuths: number[], targetAzimuth: number): number[] {
  const n = speakerAzimuths.length;
  if (n === 0) return [];
  if (n === 1) return [targetAzimuth === speakerAzimuths[0] ? 1 : 0];

  const gains = new Array(n).fill(0);
  const speakerDirs = speakerAzimuths.map((a) => azimuthToUnitVector(a));
  const targetDir = azimuthToUnitVector(targetAzimuth);

  const [i, j] = selectPair(speakerAzimuths, targetAzimuth);
  const [g1, g2] = solveGains(speakerDirs[i], speakerDirs[j], targetDir);

  gains[i] = Math.max(0, g1);
  gains[j] = Math.max(0, g2);

  // Energy normalize
  const norm = Math.sqrt(gains.reduce((s, g) => s + g * g, 0));
  if (norm > 1e-12) {
    for (let k = 0; k < n; k++) gains[k] /= norm;
  }

  return gains;
}

export function computeSpeakerGains(
  speakerPositions: Vector3[],
  listenerPos: Vector3,
  listenerOrient: Orientation,
  sourceAzimuth: number
): { gains: number[]; azimuths: number[]; distances: number[] } {
  const azimuths: number[] = [];
  const distances: number[] = [];

  for (const pos of speakerPositions) {
    const sph = toListenerRelative(pos, listenerPos, listenerOrient);
    azimuths.push(sph.azimuth);
    distances.push(sph.distance);
  }

  const gains = renderVBAP2D(azimuths, sourceAzimuth);
  return { gains, azimuths, distances };
}