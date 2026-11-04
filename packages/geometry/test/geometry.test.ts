import { describe, expect, it } from 'vitest';
import {
  area, centroid, hashValue, inset, insetPerEdge, isSimple, LocalFrame, lonLatToUtm,
  normalizeRing, pointInRing, ringDistance, ringInside, ringsOverlap, stableStringify, extrudeRing,
} from '../src/index.js';

const sq = (s: number, x = 0, y = 0) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]] as [number, number][];

describe('polygon maths', () => {
  it('computes area and centroid', () => {
    expect(area(sq(10))).toBe(100);
    expect(centroid(sq(10))).toEqual([5, 5]);
  });
  it('normalizes orientation and closing vertex', () => {
    const r = normalizeRing([[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]);
    expect(r).toHaveLength(4);
    expect(area(r)).toBe(100);
  });
  it('tests containment, overlap and distance', () => {
    expect(pointInRing([5, 5], sq(10))).toBe(true);
    expect(ringInside(sq(4, 1, 1), sq(10))).toBe(true);
    expect(ringInside(sq(4, 8, 8), sq(10))).toBe(false);
    expect(ringsOverlap(sq(4), sq(4, 2, 2))).toBe(true);
    expect(ringsOverlap(sq(4), sq(4, 4, 0))).toBe(false);
    expect(ringDistance(sq(4), sq(4, 10, 0))).toBeCloseTo(6);
    expect(isSimple([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false);
  });
  it('insets uniformly and per edge', () => {
    expect(area(inset(sq(20), 2)!)).toBeCloseTo(256, 6);
    const r = insetPerEdge(sq(20), [5, 0, 3, 0])!; // front 5, rear 3
    expect(area(r)).toBeCloseTo(20 * 12, 6);
  });
  it('extrudes a closed prism', () => {
    const m = extrudeRing(sq(10), 0, 3);
    expect(m.indices.length).toBe(3 * (2 * 2 + 4 * 2));
  });
});

describe('projection', () => {
  it('matches a known UTM 28N point (Dakar)', () => {
    // Reference: Dakar Plateau, pyproj 3.x (EPSG:4326 → EPSG:32628).
    const [x, y] = lonLatToUtm(-17.4677, 14.7167, { zone: 28, north: true });
    expect(x).toBeCloseTo(234285.723, 2);
    expect(y).toBeCloseTo(1628446.437, 2);
  });
  it('round-trips through the local frame', () => {
    const f = new LocalFrame({ lon: -17.4677, lat: 14.7167 }, 32628);
    const p = f.toLocal(-17.467, 14.717);
    const back = f.toLonLat(p[0], p[1]);
    expect(back[0]).toBeCloseTo(-17.467, 9);
    expect(back[1]).toBeCloseTo(14.717, 9);
  });
});

describe('hash', () => {
  it('is key-order independent', () => {
    expect(stableStringify({ b: 1, a: [1, 2] })).toBe('{"a":[1,2],"b":1}');
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});
