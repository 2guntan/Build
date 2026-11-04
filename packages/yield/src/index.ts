import { z } from 'zod';
import { UNIT_TYPES, USES, type BuildResult, type Use, type UnitType } from '@fs/recipe';

const PerUse = z.partialRecord(z.enum(USES), z.number().min(0));

/** User-entered assumptions. Everything is optional: nothing is invented. */
export const YieldAssumptions = z.object({
  currency: z.string().default('XOF'),
  salePricePerM2: PerUse.default({}),
  buildCostPerM2: PerUse.default({}),
  landCost: z.number().min(0).optional(),
  softCostRatio: z.number().min(0).max(2).optional(),
  parkingCostPerSpace: z.number().min(0).optional(),
  unitSizesM2: z.partialRecord(z.enum(UNIT_TYPES), z.number().positive()).default({}),
});
export type YieldAssumptions = z.infer<typeof YieldAssumptions>;

export interface YieldResult {
  currency: string;
  complete: boolean;
  /** Keys of assumptions that are needed but missing, e.g. "salePricePerM2.residential". */
  missing: string[];
  gfaByUse: Partial<Record<Use | 'unassigned', number>>;
  sellableByUse: Partial<Record<Use | 'unassigned', number>>;
  sellableM2: number;
  unitsByType: Partial<Record<UnitType, number>>;
  unitsByUse: Partial<Record<Use, number>>;
  unitCount: number | null;
  revenue: number;
  hardCost: number;
  softCost: number;
  landCost: number;
  parkingCost: number;
  totalCost: number;
  margin: number;
  /** margin ÷ total cost, as a ratio. */
  marginOnCost: number | null;
  costPerSellableM2: number | null;
}

/** Areas → revenue, cost and margin. Pure; amounts are not rounded. */
export function computeYield(br: BuildResult, input: Partial<YieldAssumptions> = {}): YieldResult {
  const a = YieldAssumptions.parse(input);
  const missing = new Set<string>();
  const gfaByUse: YieldResult['gfaByUse'] = {};
  const sellableByUse: YieldResult['sellableByUse'] = {};
  const unitsByType: YieldResult['unitsByType'] = {};
  let unitsKnown = true;
  let anyUnits = false;

  for (const b of br.blocks) {
    for (const s of b.storeys) {
      gfaByUse[s.use] = (gfaByUse[s.use] ?? 0) + s.areaM2;
      const sell = s.use === 'parking' ? 0 : s.areaM2 * s.efficiency;
      sellableByUse[s.use] = (sellableByUse[s.use] ?? 0) + sell;
      if (s.unitMix && sell > 0) {
        anyUnits = true;
        for (const [t, share] of Object.entries(s.unitMix) as [UnitType, number][]) {
          const size = a.unitSizesM2[t];
          if (!size) {
            unitsKnown = false;
            missing.add(`unitSizesM2.${t}`);
            continue;
          }
          unitsByType[t] = (unitsByType[t] ?? 0) + (sell * share) / size;
        }
      }
    }
  }

  let revenue = 0;
  let hardCost = 0;
  for (const [use, sell] of Object.entries(sellableByUse) as [Use | 'unassigned', number][]) {
    if (use === 'unassigned' || sell <= 0) continue;
    const price = a.salePricePerM2[use];
    if (price === undefined) missing.add(`salePricePerM2.${use}`);
    else revenue += sell * price;
  }
  for (const [use, gfa] of Object.entries(gfaByUse) as [Use | 'unassigned', number][]) {
    if (use === 'unassigned' || gfa <= 0) continue;
    const cost = a.buildCostPerM2[use];
    if (cost === undefined) missing.add(`buildCostPerM2.${use}`);
    else hardCost += gfa * cost;
  }
  if (a.softCostRatio === undefined) missing.add('softCostRatio');
  if (a.landCost === undefined) missing.add('landCost');
  const spaces = br.totals.parkingSpaces;
  if (spaces > 0 && a.parkingCostPerSpace === undefined) missing.add('parkingCostPerSpace');

  const softCost = hardCost * (a.softCostRatio ?? 0);
  const landCost = a.landCost ?? 0;
  const parkingCost = spaces * (a.parkingCostPerSpace ?? 0);
  const totalCost = hardCost + softCost + landCost + parkingCost;
  const margin = revenue - totalCost;
  const sellableM2 = Object.values(sellableByUse).reduce((s, v) => s + (v ?? 0), 0);
  const unitCount =
    anyUnits && unitsKnown ? Object.values(unitsByType).reduce((s, v) => s + Math.floor(v ?? 0), 0) : null;
  const unitsByUse: YieldResult['unitsByUse'] = unitCount !== null ? { residential: unitCount } : {};

  return {
    currency: a.currency,
    complete: missing.size === 0,
    missing: [...missing].sort(),
    gfaByUse,
    sellableByUse,
    sellableM2,
    unitsByType,
    unitsByUse,
    unitCount,
    revenue,
    hardCost,
    softCost,
    landCost,
    parkingCost,
    totalCost,
    margin,
    marginOnCost: totalCost > 0 ? margin / totalCost : null,
    costPerSellableM2: sellableM2 > 0 ? totalCost / sellableM2 : null,
  };
}
