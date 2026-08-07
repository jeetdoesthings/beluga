// VBAP math ported from Python beluga/geometry.py + vbap.py for browser-side gain calculation.
// Spec §18, §31-§33, §35.

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

  const TWO_PI = 2 * Math.PI;
  const toRad0To2Pi = (deg: number) => {
    const r = ((deg * Math.PI) / 180) % TWO_PI;
    return r < 0 ? r + TWO_PI : r;
  };

  const azs = speakerAzimuths
    .map((a, idx) => ({ rad: toRad0To2Pi(a), idx }))
    .sort((a, b) => a.rad - b.rad);

  const t = toRad0To2Pi(targetAzimuth);

  for (let k = 0; k < n; k++) {
    const a0 = azs[k];
    const a1 = azs[(k + 1) % n];
    if (a0.rad <= a1.rad) {
      if (a0.rad <= t && t <= a1.rad) return [a0.idx, a1.idx];
    } else {
      if (t >= a0.rad || t <= a1.rad) return [a0.idx, a1.idx];
    }
  }

  // Fallback: return closest pair
  const best = azs.reduce((min, x) => (Math.abs(x.rad - t) < Math.abs(min.rad - t) ? x : min));
  const bestIdxInSorted = azs.indexOf(best);
  const nextIdx = azs[(bestIdxInSorted + 1) % n].idx;
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
  if (n === 1) return [1.0]; // Fix Bug #5: Single speaker always gets gain 1.0 (mono mode)

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
  sourceAzimuth: number,
  sourceElevation: number = 0
): { gains: number[]; azimuths: number[]; distances: number[]; elevations: number[] } {
  const azimuths: number[] = [];
  const distances: number[] = [];
  const elevations: number[] = [];

  for (const pos of speakerPositions) {
    const sph = toListenerRelative(pos, listenerPos, listenerOrient);
    azimuths.push(sph.azimuth);
    distances.push(sph.distance);
    elevations.push(sph.elevation);
  }

  const n = speakerPositions.length;
  if (n === 0) return { gains: [], azimuths, distances, elevations };
  if (n === 1) return { gains: [1.0], azimuths, distances, elevations };

  // Check if height speakers exist (elevation > 15 deg)
  const heightIndices = elevations.map((e, idx) => (e > 15 ? idx : -1)).filter((i) => i >= 0);
  const earIndices = elevations.map((e, idx) => (e <= 15 ? idx : -1)).filter((i) => i >= 0);

  let finalGains = new Array(n).fill(0);

  if (heightIndices.length > 0 && earIndices.length > 0) {
    // Height layer exists! Blend between ear-level layer and height layer based on sourceElevation
    const heightWeight = Math.min(1.0, Math.max(0.0, sourceElevation / 45.0));
    const earWeight = 1.0 - heightWeight;

    if (earWeight > 0.001) {
      const earAzs = earIndices.map((i) => azimuths[i]);
      const earGains = renderVBAP2D(earAzs, sourceAzimuth);
      earIndices.forEach((origIdx, localIdx) => {
        finalGains[origIdx] += earGains[localIdx] * earWeight;
      });
    }

    if (heightWeight > 0.001) {
      const heightAzs = heightIndices.map((i) => azimuths[i]);
      const heightGains = renderVBAP2D(heightAzs, sourceAzimuth);
      heightIndices.forEach((origIdx, localIdx) => {
        finalGains[origIdx] += heightGains[localIdx] * heightWeight;
      });
    }

    // Energy normalize final blended gains
    const norm = Math.sqrt(finalGains.reduce((s, g) => s + g * g, 0));
    if (norm > 1e-12) {
      for (let k = 0; k < n; k++) finalGains[k] /= norm;
    }
  } else {
    // 2D mode or single layer
    finalGains = renderVBAP2D(azimuths, sourceAzimuth);
  }

  return { gains: finalGains, azimuths, distances, elevations };
}