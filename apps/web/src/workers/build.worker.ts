/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { build } from '@fs/builder';
import type { BuildResult, Recipe, SiteInput } from '@fs/recipe';
import { evaluate, type Evaluation, type Zone } from '@fs/rules';
import { runSunStudy, type ContextPrism, type SunStudySummary } from '@fs/sun';
import { computeYield, type YieldAssumptions, type YieldResult } from '@fs/yield';

export interface EvalOutput {
  build: BuildResult;
  compliance: Evaluation;
  yield: YieldResult;
  ms: number;
}

const sunCache = new Map<string, { hours: Float32Array; points: [number, number, number][]; summary: SunStudySummary }>();

const api = {
  /** Builder + rules + yield in one go, off the main thread. */
  evaluate(recipe: Recipe, site: SiteInput, zone: Zone | null, assumptions: Partial<YieldAssumptions>): EvalOutput {
    const t0 = performance.now();
    const br = build(recipe, site);
    const y = computeYield(br, assumptions);
    const compliance: Evaluation = zone
      ? evaluate(zone, br, { plot: site.plot, edgeClasses: site.edgeClasses, unitsByUse: y.unitsByUse })
      : { results: [], blockingFailures: 0, warnings: 0, compliant: true };
    const out = { build: br, compliance, yield: y, ms: performance.now() - t0 };
    const transfer = br.blocks.flatMap((b) => (b.mesh ? [b.mesh.positions.buffer, b.mesh.indices.buffer] : []));
    return Comlink.transfer(out, transfer as ArrayBuffer[]);
  },

  sunHours(recipe: Recipe, site: SiteInput, context: ContextPrism[], date: { year: number; month: number; day: number }, lat: number, lon: number) {
    const br = build(recipe, site, { mesh: false });
    const key = `${br.hash}:${date.year}-${date.month}-${date.day}:${context.length}`;
    const hit = sunCache.get(key);
    if (hit) return hit;
    const r = runSunStudy({ build: br, plot: site.plot, context, date, lat, lon, maxPoints: 2500 });
    const res = { hours: r.hours, points: r.points.map((p) => p.pos), summary: r.summary };
    sunCache.set(key, res);
    if (sunCache.size > 20) sunCache.delete(sunCache.keys().next().value!);
    return res;
  },
};

export type BuildWorkerApi = typeof api;
Comlink.expose(api);
