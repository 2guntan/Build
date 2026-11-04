import { describe, expect, it } from 'vitest';
import { area } from '@fs/geometry';
import { parseRecipe, setParams } from '@fs/recipe';
import { build } from '../src/index.js';
import { baseRecipe, site } from './helpers.js';

describe('builder', () => {
  it('builds the spec example: 24×16, R+5, retail ground floor', () => {
    const br = build(baseRecipe(), site(40, 30, 5));
    const b = br.blocks[0]!;
    expect(br.errors).toEqual([]);
    expect(b.footprintAreaM2).toBe(384);
    expect(b.floors).toBe(6);
    expect(b.heightM).toBeCloseTo(4.5 + 5 * 3.1, 6); // 20.0 m
    expect(b.storeys.map((s) => s.use)).toEqual(['retail', ...Array(5).fill('residential')]);
    expect(br.totals.gfaM2).toBe(2304);
    expect(br.totals.gfaByUse).toEqual({ retail: 384, residential: 1920 });
    expect(br.totals.parkingSurfaceAreaM2).toBe(250);
    // front-left anchor at the buildable corner (5,5)
    expect(b.footprint[0]).toEqual([5, 5]);
  });

  it('is deterministic: same input → identical hash', () => {
    const a = build(baseRecipe(), site());
    const b = build(structuredClone(baseRecipe()), site());
    expect(a.hash).toBe(b.hash);
    expect(a.inputHash).toBe(b.inputHash);
    const c = build(setParams(baseRecipe(), { floorsA: 7 }), site());
    expect(c.hash).not.toBe(a.hash);
  });

  it('resolves anchors against the buildable area', () => {
    const r = baseRecipe();
    r.blocks[0]!.footprint = { kind: 'rect', anchor: 'buildable.rear-right', width: 10, depth: 8, rotation: 0, offsetU: 0, offsetV: 0 };
    const b = build(r, site(40, 30, 2)).blocks[0]!;
    const xs = b.footprint.map((p) => p[0]);
    const ys = b.footprint.map((p) => p[1]);
    expect(Math.max(...xs)).toBe(38);
    expect(Math.max(...ys)).toBe(28);
  });

  it('builds polygon and offset footprints', () => {
    const r = baseRecipe();
    r.blocks[0]!.footprint = { kind: 'polygon', vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] };
    expect(build(r, site()).blocks[0]!.footprintAreaM2).toBe(100);
    r.blocks[0]!.footprint = { kind: 'offset', distance: 2 };
    const b = build(r, site(40, 30, 5)).blocks[0]!;
    expect(b.footprintAreaM2).toBeCloseTo(26 * 16, 2);
    expect(area(b.footprint)).toBeCloseTo(416, 2);
  });

  it('handles the "last" floor and range selectors', () => {
    const r = baseRecipe();
    r.blocks[0]!.uses = [
      { floors: [0, 'last'], use: 'office', efficiency: 0.85 },
      { floors: ['last'], use: 'amenity', efficiency: 0.7 },
    ];
    const uses = build(r, site()).blocks[0]!.storeys.map((s) => s.use);
    expect(uses).toEqual(['office', 'office', 'office', 'office', 'office', 'amenity']);
  });

  it('reports a missing param as an error instead of throwing', () => {
    const r = baseRecipe();
    r.blocks[0]!.floors = '$params.nope';
    const br = build(r, site());
    expect(br.errors[0]).toMatch(/Unknown param nope/);
    expect(br.blocks).toHaveLength(0);
  });

  it('builds 6 blocks × 20 floors well under the 100 ms budget', () => {
    const r = baseRecipe();
    r.params.floorsA!.max = 20;
    r.params.floorsA!.value = 20;
    r.blocks = Array.from({ length: 6 }, (_, i) => ({
      ...r.blocks[0]!,
      id: `b${i}`,
      footprint: { kind: 'polygon' as const, vertices: [[i * 12, 0], [i * 12 + 10, 0], [i * 12 + 10, 10], [i * 12, 10]] as [number, number][] },
    }));
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) build(r, site(80, 30));
    // Spec budget is 100 ms for builder + rules + yield + viewport; the builder alone must stay well below.
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });

  it('accepts the spec example JSON through the schema', () => {
    expect(() => parseRecipe(baseRecipe())).not.toThrow();
  });
});
