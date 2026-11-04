import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRecipe } from '@fs/recipe';
import { build } from '../src/index.js';

const dir = join(import.meta.dirname, 'golden');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

describe('golden recipes', () => {
  it('has 10 golden files', () => expect(files).toHaveLength(10));
  for (const f of files) {
    it(f, () => {
      const g = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const br = build(parseRecipe(g.recipe), { plot: g.plot, edgeClasses: g.edgeClasses, buildable: g.buildable });
      expect(br.errors).toEqual([]);
      expect(br.totals.gfaM2).toBeCloseTo(g.expected.gfaM2, 2);
      expect(br.totals.footprintAreaM2).toBeCloseTo(g.expected.footprintAreaM2, 2);
      expect(br.totals.maxHeightM).toBeCloseTo(g.expected.maxHeightM, 3);
      // Determinism: a second build gives the same hash.
      expect(build(parseRecipe(g.recipe), { plot: g.plot, edgeClasses: g.edgeClasses, buildable: g.buildable }).hash).toBe(br.hash);
    });
  }
});
