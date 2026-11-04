import { bbox, normalizeRing, type Vec2 } from '@fs/geometry';

/** Vertical extruded obstacle (massing block or context building). */
export interface Prism {
  id: string;
  ring: Vec2[];
  baseZ: number;
  topZ: number;
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

export function makePrism(id: string, ring: Vec2[], baseZ: number, topZ: number): Prism {
  const r = normalizeRing(ring);
  return { id, ring: r, baseZ, topZ, box: bbox(r) };
}

/** Slab test of a 2D ray against a box. Returns [tmin, tmax] or null. */
function rayBox(ox: number, oy: number, dx: number, dy: number, b: Prism['box']): [number, number] | null {
  let t0 = 0;
  let t1 = Infinity;
  if (Math.abs(dx) < 1e-12) {
    if (ox < b.minX || ox > b.maxX) return null;
  } else {
    let a = (b.minX - ox) / dx;
    let c = (b.maxX - ox) / dx;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < b.minY || oy > b.maxY) return null;
  } else {
    let a = (b.minY - oy) / dy;
    let c = (b.maxY - oy) / dy;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** True when the ray from (o) towards the sun (d, with d.z > 0) hits any prism. */
export function occluded(o: [number, number, number], d: [number, number, number], prisms: Prism[], skipId?: string): boolean {
  const [ox, oy, oz] = o;
  const [dx, dy, dz] = d;
  const h = Math.hypot(dx, dy);
  for (const p of prisms) {
    if (p.id === skipId) continue;
    if (oz >= p.topZ) continue;
    const span = rayBox(ox, oy, dx, dy, p.box);
    if (!span) continue;
    // Height of the ray when it enters the box; already above the roof → clear.
    if (oz + span[0] * dz >= p.topZ) continue;
    if (h < 1e-9) continue;
    const r = p.ring;
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % r.length]!;
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - ox) * ey - (a[1] - oy) * ex) / den;
      if (t <= 1e-6) continue;
      const s = ((a[0] - ox) * dy - (a[1] - oy) * dx) / den;
      if (s < 0 || s > 1) continue;
      const z = oz + t * dz;
      if (z >= p.baseZ && z <= p.topZ) return true;
    }
  }
  return false;
}
