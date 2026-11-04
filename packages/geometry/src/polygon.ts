/** 2D polygon maths in the local site frame (metres east/north of the site origin). */
export type Vec2 = readonly [number, number];
export type Ring = Vec2[];

export const EPS = 1e-9;

export function signedArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function area(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

/** Returns the ring in counter-clockwise order, without a closing duplicate vertex. */
export function normalizeRing(ring: Ring): Ring {
  let r = ring.slice();
  if (r.length > 1) {
    const f = r[0]!;
    const l = r[r.length - 1]!;
    if (Math.abs(f[0] - l[0]) < EPS && Math.abs(f[1] - l[1]) < EPS) r = r.slice(0, -1);
  }
  return signedArea(r) < 0 ? r.reverse() : r;
}

export function centroid(ring: Ring): Vec2 {
  const a = signedArea(ring);
  if (Math.abs(a) < EPS) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function perimeter(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) s += dist(ring[i]!, ring[(i + 1) % ring.length]!);
  return s;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function bbox(ring: Ring): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInRing(p: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < EPS) return dist(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Proper or touching intersection test between two segments. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2, strict = false): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const tol = 1e-9;
  if (strict) return o1 * o2 < -tol && o3 * o4 < -tol;
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  const on = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.min(p[0], q[0]) - tol <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) + tol &&
    Math.min(p[1], q[1]) - tol <= r[1] &&
    r[1] <= Math.max(p[1], q[1]) + tol;
  if (Math.abs(o1) < tol && on(a, b, c)) return true;
  if (Math.abs(o2) < tol && on(a, b, d)) return true;
  if (Math.abs(o3) < tol && on(c, d, a)) return true;
  if (Math.abs(o4) < tol && on(c, d, b)) return true;
  return false;
}

export function segmentSegmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/** Minimum distance between the boundary of a ring and a segment. */
export function ringSegmentDistance(ring: Ring, a: Vec2, b: Vec2): number {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) {
    m = Math.min(m, segmentSegmentDistance(ring[i]!, ring[(i + 1) % ring.length]!, a, b));
  }
  return m;
}

/** Minimum distance between two rings (0 when they overlap or touch). */
export function ringDistance(r1: Ring, r2: Ring): number {
  if (ringsOverlap(r1, r2)) return 0;
  let m = Infinity;
  for (let i = 0; i < r2.length; i++) {
    m = Math.min(m, ringSegmentDistance(r1, r2[i]!, r2[(i + 1) % r2.length]!));
  }
  return m;
}

/** True when two rings share interior area (touching edges do not count). */
export function ringsOverlap(r1: Ring, r2: Ring): boolean {
  for (let i = 0; i < r1.length; i++) {
    for (let j = 0; j < r2.length; j++) {
      if (
        segmentsIntersect(r1[i]!, r1[(i + 1) % r1.length]!, r2[j]!, r2[(j + 1) % r2.length]!, true)
      ) {
        return true;
      }
    }
  }
  return pointInRing(centroid(r1), r2) || pointInRing(centroid(r2), r1);
}

/** No two non-adjacent edges intersect. */
export function isSimple(ring: Ring): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return false;
    }
  }
  return area(ring) > EPS;
}

/** True when `inner` lies within `outer` (boundaries may touch, within tolerance). */
export function ringInside(inner: Ring, outer: Ring, tol = 1e-6): boolean {
  for (const p of inner) {
    if (!pointInRing(p, outer)) {
      let onEdge = false;
      for (let i = 0; i < outer.length; i++) {
        if (pointSegmentDistance(p, outer[i]!, outer[(i + 1) % outer.length]!) <= tol) {
          onEdge = true;
          break;
        }
      }
      if (!onEdge) return false;
    }
  }
  for (let i = 0; i < inner.length; i++) {
    for (let j = 0; j < outer.length; j++) {
      if (
        segmentsIntersect(
          inner[i]!,
          inner[(i + 1) % inner.length]!,
          outer[j]!,
          outer[(j + 1) % outer.length]!,
          true,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

export function rotate(p: Vec2, angleRad: number, about: Vec2 = [0, 0]): Vec2 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const x = p[0] - about[0];
  const y = p[1] - about[1];
  return [about[0] + x * c - y * s, about[1] + x * s + y * c];
}

/** Rounds coordinates to a millimetre to make outputs stable across engines. */
export function roundRing(ring: Ring, step = 1e-3): Ring {
  return ring.map(([x, y]) => [roundTo(x, step), roundTo(y, step)] as Vec2);
}

export function roundTo(v: number, step = 1e-3): number {
  const r = Math.round(v / step) * step;
  const out = Number(r.toFixed(6));
  return Object.is(out, -0) ? 0 : out;
}
