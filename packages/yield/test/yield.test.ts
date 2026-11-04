import { describe, expect, it } from 'vitest';
import { build } from '@fs/builder';
import { computeYield } from '../src/index.js';
import { baseRecipe, site } from './helpers.js';

// Prices below are TEST inputs for arithmetic checks, not market figures.
const assumptions = {
  currency: 'XOF',
  salePricePerM2: { retail: 900_000, residential: 750_000 },
  buildCostPerM2: { retail: 400_000, residential: 350_000 },
  landCost: 150_000_000,
  softCostRatio: 0.12,
  parkingCostPerSpace: 2_000_000,
  unitSizesM2: { T2: 55, T3: 75, T4: 95 },
};

describe('yield model (hand-checked to the franc)', () => {
  it('case 1: spec example, mixed use with surface parking', () => {
    const y = computeYield(build(baseRecipe(), site(40, 30, 5)), assumptions);
    expect(y.complete).toBe(true);
    expect(y.sellableByUse.retail).toBeCloseTo(326.4, 9);
    expect(y.sellableByUse.residential).toBeCloseTo(1536, 9);
    expect(Math.round(y.revenue)).toBe(1_445_760_000);
    expect(Math.round(y.hardCost)).toBe(825_600_000);
    expect(Math.round(y.softCost)).toBe(99_072_000);
    expect(Math.round(y.parkingCost)).toBe(20_000_000);
    expect(Math.round(y.totalCost)).toBe(1_094_672_000);
    expect(Math.round(y.margin)).toBe(351_088_000);
    expect(y.marginOnCost!).toBeCloseTo(351_088_000 / 1_094_672_000, 12);
    expect(y.unitCount).toBe(22); // 11 T2 + 9 T3 + 2 T4
  });

  it('case 2: office only, no parking, no soft costs', () => {
    const r = baseRecipe();
    r.blocks[0]!.uses = [{ floors: [0, 'last'], use: 'office', efficiency: 0.9 }];
    r.parking = { kind: 'none', spaces: 0, area: 'auto' };
    const y = computeYield(build(r, site(40, 30, 5)), {
      salePricePerM2: { office: 1_000_000 },
      buildCostPerM2: { office: 500_000 },
      landCost: 0,
      softCostRatio: 0,
    });
    // GFA 2304, sellable 2073.6
    expect(Math.round(y.revenue)).toBe(2_073_600_000);
    expect(Math.round(y.totalCost)).toBe(1_152_000_000);
    expect(Math.round(y.margin)).toBe(921_600_000);
    expect(Math.round(y.costPerSellableM2!)).toBe(555_556);
    expect(y.complete).toBe(true);
  });

  it('case 3: missing assumptions are listed, never invented', () => {
    const y = computeYield(build(baseRecipe(), site(40, 30, 5)), {});
    expect(y.complete).toBe(false);
    expect(y.revenue).toBe(0);
    expect(y.missing).toEqual([
      'buildCostPerM2.residential', 'buildCostPerM2.retail', 'landCost', 'parkingCostPerSpace',
      'salePricePerM2.residential', 'salePricePerM2.retail', 'softCostRatio',
      'unitSizesM2.T2', 'unitSizesM2.T3', 'unitSizesM2.T4',
    ]);
    expect(y.unitCount).toBeNull();
  });
});
