import earcut from 'earcut';
import { normalizeRing, type Ring } from './polygon.js';

export interface Mesh {
  /** xyz triplets, z up, metres in the local frame. */
  positions: Float32Array;
  indices: Uint32Array;
}

/** Extrudes a simple polygon between two elevations into a closed prism mesh. */
export function extrudeRing(ring: Ring, baseZ: number, topZ: number): Mesh {
  const r = normalizeRing(ring);
  const n = r.length;
  const flat = r.flatMap((p) => [p[0], p[1]]);
  const cap = earcut(flat);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const p of r) positions.push(p[0], p[1], baseZ);
  for (const p of r) positions.push(p[0], p[1], topZ);
  for (let i = 0; i < cap.length; i += 3) {
    // bottom faces down (reverse), top faces up
    indices.push(cap[i]!, cap[i + 2]!, cap[i + 1]!);
    indices.push(cap[i]! + n, cap[i + 1]! + n, cap[i + 2]! + n);
  }
  // Side walls with their own vertices so normals stay flat.
  for (let i = 0; i < n; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % n]!;
    const s = positions.length / 3;
    positions.push(a[0], a[1], baseZ, b[0], b[1], baseZ, b[0], b[1], topZ, a[0], a[1], topZ);
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function triangulate(ring: Ring): number[] {
  return earcut(ring.flatMap((p) => [p[0], p[1]]));
}
