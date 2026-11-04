import { describe, expect, it } from 'vitest';
import type { BuildResult, BlockResult, Vec2 } from '@fs/recipe';
import { buildableArea, evaluate, heightEnvelope, RuleSet, TEST_RULESET, type Rule, type Zone } from '../src/index.js';
import { area } from '@fs/geometry';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const plot: Vec2[] = [[0, 0], [40, 0], [40, 30], [0, 30]];
const edgeClasses = ['front', 'side', 'rear', 'side'] as const;
const cite = { source: 'x', article: '1' };

function block(id: string, fp: Vec2[], floors: number, heightM: number): BlockResult {
  const a = area(fp);
  return { id, name: id, footprint: fp, footprintAreaM2: a, floors, heightM, gfaM2: a * floors, storeys: Array.from({ length: floors }, (_, i) => ({ index: i, elevationM: i * 3, heightM: 3, areaM2: a, use: 'residential' as const, efficiency: 0.8 })) };
}
function br(blocks: BlockResult[], extra: Partial<BuildResult['totals']> = {}): BuildResult {
  const fp = blocks.reduce((s, b) => s + b.footprintAreaM2, 0);
  const gfa = blocks.reduce((s, b) => s + b.gfaM2, 0);
  return {
    builderVersion: 't', inputHash: '', hash: '', errors: [], blocks,
    totals: { plotAreaM2: 1200, footprintAreaM2: fp, gfaM2: gfa, gfaByUse: { residential: gfa }, maxHeightM: Math.max(0, ...blocks.map((b) => b.heightM)), maxFloors: Math.max(0, ...blocks.map((b) => b.floors)), parkingSpaces: 0, parkingSurfaceAreaM2: 0, ...extra },
  };
}
const rect = (x: number, y: number, w: number, d: number): Vec2[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const zone = (rule: Rule): Zone => ({ id: 'z', name: 'z', rules: [rule] });
const run = (rule: Rule, b: BuildResult, ctx = {}) => evaluate(zone(rule), b, { plot, edgeClasses: [...edgeClasses], ...ctx }).results[0]!;

describe('rule types at the boundary', () => {
  it('max_coverage', () => {
    const r: Rule = { id: 'c', type: 'max_coverage', max: 0.5, severity: 'blocking', cite };
    expect(run(r, br([block('a', rect(0, 0, 30, 20), 1, 3)])).status).toBe('pass'); // exactly 0.5
    expect(run(r, br([block('a', rect(0, 0, 30.1, 20), 1, 3)])).status).toBe('fail');
    expect(run({ ...r, severity: 'warning' }, br([block('a', rect(0, 0, 31, 20), 1, 3)])).status).toBe('warn');
  });
  it('max_far', () => {
    const r: Rule = { id: 'f', type: 'max_far', max: 2, severity: 'blocking', cite };
    expect(run(r, br([block('a', rect(0, 0, 20, 20), 6, 18)])).status).toBe('pass'); // 2400/1200
    expect(run(r, br([block('a', rect(0, 0, 20, 20), 7, 21)])).status).toBe('fail');
  });
  it('max_height in metres and storeys', () => {
    const r: Rule = { id: 'h', type: 'max_height', maxMetres: 21, maxStoreys: 7, severity: 'blocking', cite };
    expect(run(r, br([block('a', rect(0, 0, 10, 10), 7, 21)])).status).toBe('pass');
    expect(run(r, br([block('a', rect(0, 0, 10, 10), 7, 21.01)])).status).toBe('fail');
    const s = run(r, br([block('a', rect(0, 0, 10, 10), 8, 20)]));
    expect(s.status).toBe('fail');
    expect(s.elementIds).toEqual(['a']);
  });
  it('setback with a height formula', () => {
    const r: Rule = { id: 's', type: 'setback', edge: 'front', min: 'max(5, H/2)', severity: 'blocking', cite };
    expect(run(r, br([block('a', rect(5, 5, 10, 10), 3, 10)])).status).toBe('pass'); // 5 ≥ 5
    const f = run(r, br([block('a', rect(5, 5, 10, 10), 4, 12)])); // needs 6
    expect(f.status).toBe('fail');
    expect(f.limit).toBe(6);
    expect(f.margin).toBe(-1);
    expect(run({ ...r, edge: 'rear' }, br([block('a', rect(5, 5, 10, 10), 4, 12)])).actual).toBe(15);
  });
  it('min_separation', () => {
    const r: Rule = { id: 'm', type: 'min_separation', min: 'H/2', severity: 'blocking', cite };
    expect(run(r, br([block('a', rect(0, 0, 10, 10), 1, 10), block('b', rect(15, 0, 10, 10), 1, 10)])).status).toBe('pass');
    expect(run(r, br([block('a', rect(0, 0, 10, 10), 1, 10), block('b', rect(14.9, 0, 10, 10), 1, 10)])).status).toBe('fail');
    expect(run(r, br([block('a', rect(0, 0, 10, 10), 1, 10)])).actual).toBeNull();
  });
  it('parking_ratio per 100 m² and per unit', () => {
    const r: Rule = { id: 'p', type: 'parking_ratio', perUse: { residential: { per100m2: 1 } }, severity: 'blocking', cite };
    const b = br([block('a', rect(0, 0, 10, 10), 5, 15)]); // 500 m² → 5 spaces
    expect(run(r, b, { parkingSpaces: 5 }).status).toBe('pass');
    expect(run(r, b, { parkingSpaces: 4 }).status).toBe('fail');
    const u: Rule = { ...r, perUse: { residential: { perUnit: 1 } } };
    expect(run(u, b, { parkingSpaces: 3, unitsByUse: { residential: 3 } }).status).toBe('pass');
    expect(run(u, b, { parkingSpaces: 3 }).status).toBe('warn'); // units unknown
  });
  it('min_open_space counts surface parking as built', () => {
    const r: Rule = { id: 'o', type: 'min_open_space', min: 0.5, severity: 'blocking', cite };
    expect(run(r, br([block('a', rect(0, 0, 30, 10), 1, 3)], { parkingSurfaceAreaM2: 300 })).status).toBe('pass');
    expect(run(r, br([block('a', rect(0, 0, 30, 10), 1, 3)], { parkingSurfaceAreaM2: 301 })).status).toBe('fail');
  });
});

describe('buildable area', () => {
  it('insets per edge class using the max allowed height', () => {
    const z: Zone = { id: 'z', name: 'z', rules: [
      { id: 'h', type: 'max_height', maxMetres: 20, severity: 'blocking', cite },
      { id: 'f', type: 'setback', edge: 'front', min: 'max(5, H/2)', severity: 'blocking', cite },
      { id: 's', type: 'setback', edge: 'side', min: 3, severity: 'blocking', cite },
    ] };
    expect(heightEnvelope(z).maxHeightM).toBe(20);
    const b = buildableArea(plot, [...edgeClasses], z)!;
    expect(area(b)).toBeCloseTo((40 - 6) * (30 - 10), 3);
    const low = buildableArea(plot, [...edgeClasses], z, { heightM: 6, storeys: 2 })!;
    expect(area(low)).toBeCloseTo((40 - 6) * (30 - 5), 3);
  });
});

describe('jurisdiction files', () => {
  const dir = join(import.meta.dirname, '../../../data/jurisdictions');
  for (const j of readdirSync(dir)) {
    for (const f of readdirSync(join(dir, j)).filter((x) => x.endsWith('.json'))) {
      it(`${j}/${f} matches the schema and cites every rule`, () => {
        const rs = RuleSet.parse(JSON.parse(readFileSync(join(dir, j, f), 'utf8')));
        const ids = new Set(rs.sources.map((s) => s.id));
        for (const z of rs.zones) for (const r of z.rules) expect(ids.has(r.cite.source)).toBe(true);
      });
    }
  }
  it('the test fixture is flagged as non-official', () => {
    expect(TEST_RULESET.test).toBe(true);
    expect(TEST_RULESET.disclaimer).toMatch(/NON OFFICIEL/);
  });
});
