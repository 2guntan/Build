import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ringInside, ringsOverlap, type Vec2 } from '@fs/geometry';
import { findZone, REFERENCE_ORIGIN, REFERENCE_PLOTS, TEST_RULESET } from '@fs/rules';
import { solve, validate } from '../src/index.js';

const base = { optionId: 'opt_s', origin: REFERENCE_ORIGIN, plotRef: 'p' };

describe('solver on the 5 reference plots', () => {
  for (const ref of REFERENCE_PLOTS) {
    it(`${ref.id}: compliant candidates in < 2 s`, () => {
      const zone = findZone(TEST_RULESET, ref.zone);
      const t0 = performance.now();
      const res = solve({ intent: { targetUse: 'mixed' }, plot: ref.plot, edgeClasses: ref.edgeClasses, zone, base });
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(2000);
      expect(res.candidates.length).toBeGreaterThan(0);
      expect(res.candidates.length).toBeLessThanOrEqual(3);
      for (const c of res.candidates) {
        expect(c.compliance.compliant).toBe(true);
        const v = validate(c.recipe, { plot: ref.plot, edgeClasses: ref.edgeClasses, zone });
        expect(v.issues).toEqual([]);
      }
    });
  }

  it('is deterministic', () => {
    const ref = REFERENCE_PLOTS[2]!;
    const zone = findZone(TEST_RULESET, ref.zone);
    const a = solve({ intent: { targetUse: 'residential' }, plot: ref.plot, edgeClasses: ref.edgeClasses, zone, base });
    const b = solve({ intent: { targetUse: 'residential' }, plot: ref.plot, edgeClasses: ref.edgeClasses, zone, base });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('honours a target GFA and a fixed layout', () => {
    const ref = REFERENCE_PLOTS[2]!;
    const zone = findZone(TEST_RULESET, ref.zone);
    const res = solve({ intent: { targetUse: 'residential', targetGfa: 6000, layout: 'bar' }, plot: ref.plot, edgeClasses: ref.edgeClasses, zone, base });
    expect(res.candidates[0]!.template).toBe('bar');
    expect(Math.abs(res.candidates[0]!.metrics.gfaM2 - 6000)).toBeLessThan(3000);
  });
});

describe('property: solved recipes never overlap or leave the plot', () => {
  it('holds for random rectangular and skewed plots', () => {
    const zone = findZone(TEST_RULESET, 'test-r');
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 80 }),
        fc.integer({ min: 20, max: 80 }),
        fc.integer({ min: -10, max: 10 }),
        fc.constantFrom('mixed', 'residential', 'office'),
        (w, d, skew, use) => {
          const plot: Vec2[] = [[0, 0], [w, 0], [w + skew, d], [skew, d]];
          const res = solve({ intent: { targetUse: use as 'mixed' }, plot, edgeClasses: ['front', 'side', 'rear', 'side'], zone, base, maxIterations: 600 });
          for (const c of res.candidates) {
            const fps = c.recipe.blocks.map((b) => (b.footprint.kind === 'polygon' ? b.footprint.vertices : []) as Vec2[]);
            for (let i = 0; i < fps.length; i++) {
              expect(ringInside(fps[i]!, plot, 1e-3)).toBe(true);
              for (let j = i + 1; j < fps.length; j++) expect(ringsOverlap(fps[i]!, fps[j]!)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 25, seed: 42 },
    );
  });
});
