import { describe, expect, it } from 'vitest';
import { findZone, TEST_RULESET } from '@fs/rules';
import { validate } from '../src/index.js';
import { baseRecipe } from '../../builder/test/helpers.js';

const plot = [[0, 0], [40, 0], [40, 30], [0, 30]] as [number, number][];
const ctx = { plot, edgeClasses: ['front', 'side', 'rear', 'side'] as const, zone: findZone(TEST_RULESET, 'test-r') };
const c = () => ({ ...ctx, edgeClasses: [...ctx.edgeClasses] });

describe('validator', () => {
  it('rejects schema errors', () => {
    const v = validate({ schemaVersion: 1 }, c());
    expect(v.ok).toBe(false);
    expect(v.issues[0]!.code).toBe('SCHEMA');
  });
  it('rejects footprints outside the plot and overlapping blocks', () => {
    const r = baseRecipe();
    r.blocks[0]!.footprint = { kind: 'polygon', vertices: [[-5, 0], [10, 0], [10, 10], [-5, 10]] };
    r.blocks.push({ ...r.blocks[0]!, id: 'blk_B', name: 'Block B', footprint: { kind: 'polygon', vertices: [[5, 5], [15, 5], [15, 15], [5, 15]] } });
    const codes = validate(r, c()).issues.map((i) => i.code);
    expect(codes).toContain('FOOTPRINT_OUTSIDE_PLOT');
    expect(codes).toContain('BLOCKS_OVERLAP');
  });
  it('rejects blocking rule failures with citations, unless marked non-compliant study', () => {
    const r = baseRecipe();
    r.params.floorsA = { value: 12, min: 1, max: 12, step: 1 };
    const v = validate(r, c());
    const rule = v.issues.filter((i) => i.code === 'RULE_BLOCKING');
    expect(rule.length).toBeGreaterThan(0);
    expect(rule.some((i) => /t-height/.test(i.message) && /\[test T3\]/.test(i.message))).toBe(true);
    r.meta = { createdBy: 'user', nonCompliantStudy: true };
    const v2 = validate(r, c());
    expect(v2.issues.filter((i) => i.code === 'RULE_BLOCKING')).toEqual([]);
    expect(v2.tolerated.length).toBe(rule.length);
  });
  it('applies sanity checks', () => {
    const r = baseRecipe();
    r.programme.targetGfa = 20_000;
    r.blocks[0]!.uses[0]!.efficiency = 0.3;
    const codes = validate(r, c()).issues.map((i) => i.code);
    expect(codes).toContain('GFA_FAR_FROM_TARGET');
    expect(codes).toContain('EFFICIENCY_OUT_OF_RANGE');
  });
});
