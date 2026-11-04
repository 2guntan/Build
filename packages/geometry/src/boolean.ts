import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { area, normalizeRing, type Ring, type Vec2 } from './polygon.js';

const ARC_SEGMENTS = 8;

/** Snap to a micrometre grid: avoids sweep-line failures on near-degenerate input. */
const snap = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

function toPoly(ring: Ring): Polygon {
  const r = ring.map((p) => [snap(p[0]), snap(p[1])] as [number, number]);
  r.push([r[0]![0], r[0]![1]]);
  return [r];
}

function largestOuter(mp: MultiPolygon): Ring | null {
  let best: Ring | null = null;
  let bestArea = 0;
  for (const poly of mp) {
    const outer = poly[0];
    if (!outer) continue;
    const ring = normalizeRing(outer.map((p) => [p[0], p[1]] as Vec2));
    const a = area(ring);
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  return best;
}

/** Capsule polygon around a segment: every point within `d` of [a,b]. */
export function segmentBuffer(a: Vec2, b: Vec2, d: number): Ring {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pts: Vec2[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / ARC_SEGMENTS;
    pts.push([a[0] + d * Math.cos(t), a[1] + d * Math.sin(t)]);
  }
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / ARC_SEGMENTS;
    pts.push([b[0] + d * Math.cos(t), b[1] + d * Math.sin(t)]);
  }
  return pts;
}

/**
 * Shrinks a polygon by a distance per edge: removes every point closer than
 * `distances[i]` to edge i. Returns the largest remaining piece, or null.
 */
export function insetPerEdge(ring: Ring, distances: number[]): Ring | null {
  const r = normalizeRing(ring);
  const cutters: Polygon[] = [];
  for (let i = 0; i < r.length; i++) {
    const d = distances[i] ?? 0;
    if (d <= 0) continue;
    cutters.push(toPoly(segmentBuffer(r[i]!, r[(i + 1) % r.length]!, d)));
  }
  if (cutters.length === 0) return r;
  // Subtract one cutter at a time and re-snap, which is far more robust than one n-ary call.
  let current: MultiPolygon = [toPoly(r)];
  for (const c of cutters) {
    current = polygonClipping.difference(current, c);
    if (current.length === 0) return null;
    current = current.map((poly) => poly.map((ring) => ring.map((p) => [snap(p[0]), snap(p[1])] as [number, number])));
  }
  return largestOuter(current);
}

export function inset(ring: Ring, d: number): Ring | null {
  return insetPerEdge(
    ring,
    ring.map(() => d),
  );
}

export function intersection(a: Ring, b: Ring): Ring | null {
  return largestOuter(polygonClipping.intersection(toPoly(a), toPoly(b)));
}

export function intersectionArea(a: Ring, b: Ring): number {
  const mp = polygonClipping.intersection(toPoly(a), toPoly(b));
  let s = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => {
      const ar = area(ring.map((p) => [p[0], p[1]] as Vec2));
      s += i === 0 ? ar : -ar;
    });
  }
  return s;
}
