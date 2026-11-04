import { area, insetPerEdge, normalizeRing, type Ring } from '@fs/geometry';
import type { EdgeClass } from '@fs/recipe';
import { evaluateFormula } from './formula.js';
import type { Zone } from './schema.js';

/** Default storey height used to turn a storey limit into metres (ground 4.5 m + typical 3.1 m). */
const GROUND_M = 4.5;
const TYPICAL_M = 3.1;

export interface Envelope {
  maxHeightM: number;
  maxStoreys: number;
}

/** Height envelope allowed by the zone. Falls back to `fallback` when the zone has no height rule. */
export function heightEnvelope(zone: Zone, fallback: Envelope = { maxHeightM: 40, maxStoreys: 12 }): Envelope {
  let maxHeightM = Infinity;
  let maxStoreys = Infinity;
  for (const r of zone.rules) {
    if (r.type !== 'max_height' || r.severity !== 'blocking') continue;
    if (r.maxMetres !== undefined) maxHeightM = Math.min(maxHeightM, r.maxMetres);
    if (r.maxStoreys !== undefined) maxStoreys = Math.min(maxStoreys, r.maxStoreys);
  }
  if (!Number.isFinite(maxStoreys) && Number.isFinite(maxHeightM)) {
    maxStoreys = Math.max(1, Math.floor((maxHeightM - GROUND_M) / TYPICAL_M) + 1);
  }
  if (!Number.isFinite(maxHeightM) && Number.isFinite(maxStoreys)) {
    maxHeightM = GROUND_M + (maxStoreys - 1) * TYPICAL_M;
  }
  if (!Number.isFinite(maxHeightM)) return fallback;
  return { maxHeightM, maxStoreys };
}

/** Setback distance per plot edge for a given block height. */
export function edgeSetbacks(
  plot: Ring,
  edgeClasses: EdgeClass[],
  zone: Zone,
  heightM: number,
  storeys: number,
): number[] {
  const A = area(plot);
  return plot.map((_, i) => {
    const cls = edgeClasses[i];
    let d = 0;
    for (const r of zone.rules) {
      if (r.type === 'setback' && r.edge === cls && r.severity === 'blocking') {
        d = Math.max(d, evaluateFormula(r.min, { H: heightM, n: storeys, A }));
      }
    }
    return d;
  });
}

/**
 * Plot polygon shrunk by the setback rules, using the maximum height allowed
 * (conservative). The evaluator still checks each block at its real height.
 * Pass `heightM` to get the buildable area for a specific height instead.
 */
export function buildableArea(
  plot: Ring,
  edgeClasses: EdgeClass[],
  zone: Zone,
  at?: { heightM: number; storeys: number },
): Ring | null {
  const ring = normalizeRing(plot);
  const env = at ?? (() => {
    const e = heightEnvelope(zone);
    return { heightM: e.maxHeightM, storeys: e.maxStoreys };
  })();
  return insetPerEdge(ring, edgeSetbacks(ring, edgeClasses, zone, env.heightM, env.storeys));
}
