import { build, fromFrame, siteFrame, toFrame } from '@fs/builder';
import { area, bbox, intersection, normalizeRing, type Vec2 } from '@fs/geometry';
import type { BuildResult, EdgeClass, Recipe } from '@fs/recipe';
import {
  buildableArea,
  evaluate,
  evaluateFormula,
  heightEnvelope,
  type Evaluation,
  type Zone,
} from '@fs/rules';
import { computeYield, type YieldAssumptions, type YieldResult } from '@fs/yield';
import { Intent, type IntentInput } from './intent.js';
import { recipeFromShapes, type RecipeBase } from './recipe-from-shapes.js';
import { TEMPLATES, templateShapes, type Template, type TemplateParams } from './templates.js';

export interface SolveInput {
  intent: IntentInput;
  plot: Vec2[];
  edgeClasses: EdgeClass[];
  zone: Zone;
  base: RecipeBase;
  assumptions?: Partial<YieldAssumptions>;
  /** Evaluation budget; replaces a wall-clock limit so results stay deterministic. */
  maxIterations?: number;
}

export interface Candidate {
  id: string;
  template: Template;
  recipe: Recipe;
  metrics: BuildResult['totals'];
  compliance: Evaluation;
  yield: YieldResult;
  score: number;
  scoreBasis: 'gfa' | 'target_gfa' | 'sun_proxy' | 'margin' | 'gfa_fallback';
}

export interface SolveResult {
  candidates: Candidate[];
  iterations: number;
  reason?: string;
}

const DEPTHS = [10, 13, 16, 19];
const FILL_U = [1, 0.75, 0.5];
const FILL_V = [1, 0.7, 0.45];

function blockCountOk(t: Template, n: number | undefined, shapes: number): boolean {
  if (n === undefined) return true;
  if (t === 'towers') return shapes === n;
  return shapes === n;
}

export function solve(input: SolveInput): SolveResult {
  const intent = Intent.parse(input.intent);
  const zone = input.zone;
  const plot = normalizeRing(input.plot);
  const env = heightEnvelope(zone);
  const maxIter = input.maxIterations ?? 2500;
  const ground = intent.groundFloorUse && intent.groundFloorUse !== 'residential' ? 4.5 : intent.targetUse === 'mixed' ? 4.5 : 3.1;
  const typical = 3.1;
  const heightFor = (n: number) => ground + (n - 1) * typical;
  const maxFloorsAllowed = Math.max(
    1,
    Math.min(env.maxStoreys, Math.floor((env.maxHeightM - ground) / typical + 1e-9) + 1),
  );
  const floorsList = intent.floors
    ? [Math.min(intent.floors, maxFloorsAllowed)]
    : Array.from({ length: maxFloorsAllowed }, (_, i) => maxFloorsAllowed - i);
  const templates: Template[] = intent.layout === 'auto' ? [...TEMPLATES] : [intent.layout];
  const priority = intent.priority ?? (intent.targetGfa ? 'target_gfa' : 'max_gfa');
  const sepRule = zone.rules.find((r) => r.type === 'min_separation');
  const frame = siteFrame({ plot, edgeClasses: input.edgeClasses });
  let iterations = 0;
  const best = new Map<string, Candidate>();
  const origin = new Map<string, { n: number; tp: TemplateParams }>();

  const score = (br: BuildResult, y: YieldResult): { s: number; basis: Candidate['scoreBasis'] } => {
    const gfa = br.totals.gfaM2;
    switch (priority) {
      case 'target_gfa':
        return { s: -Math.abs(gfa - (intent.targetGfa ?? gfa)), basis: 'target_gfa' };
      case 'max_sun': {
        const cov = br.totals.plotAreaM2 > 0 ? br.totals.footprintAreaM2 / br.totals.plotAreaM2 : 1;
        // Proxy: less coverage and lower height let more sun reach façades and ground.
        return { s: gfa * (1 - cov) / Math.max(1, br.totals.maxHeightM / 10), basis: 'sun_proxy' };
      }
      case 'max_margin':
        return y.complete ? { s: y.margin, basis: 'margin' } : { s: gfa, basis: 'gfa_fallback' };
      default:
        return { s: gfa, basis: 'gfa' };
    }
  };

  const tryCandidate = (t: Template, n: number, tp: TemplateParams, buildable: Vec2[]): Candidate | null => {
    if (iterations >= maxIter) return null;
    iterations++;
    const shapesF = templateShapes(t, tp);
    if (!shapesF || !blockCountOk(t, intent.blocks, shapesF.length)) return null;
    const shapes: Vec2[][] = [];
    for (const s of shapesF) {
      const local = s.map((q) => fromFrame(frame, q));
      const clipped = intersection(local, buildable);
      if (!clipped || area(clipped) < 0.6 * area(local) || area(clipped) < 30) return null;
      shapes.push(clipped);
    }
    const make = (parking: Recipe['parking']) =>
      recipeFromShapes({
        base: input.base,
        intent,
        template: t,
        shapes,
        floors: n,
        maxFloors: maxFloorsAllowed,
        groundHeightM: ground,
        typicalHeightM: typical,
        parking,
        ...(t === 'podium_tower' ? { stepBacks: [{ fromFloor: 2, inset: Math.max(3, Math.round(tp.depth * 0.25 * 2) / 2) }] } : {}),
      });
    const site = { plot, edgeClasses: input.edgeClasses, buildable };
    let recipe = make({ kind: 'none', spaces: 0, area: 'auto' });
    let br = build(recipe, site, { mesh: false });
    if (br.errors.length) return null;
    let y = computeYield(br, input.assumptions);
    const ctx = { plot, edgeClasses: input.edgeClasses, unitsByUse: y.unitsByUse };
    let ev = evaluate(zone, br, ctx);
    const park = ev.results.find((r) => r.type === 'parking_ratio');
    if (park && park.limit && park.limit > 0) {
      const spaces = park.limit;
      recipe = make({ kind: 'surface', spaces, area: 'auto' });
      br = build(recipe, site, { mesh: false });
      ev = evaluate(zone, br, ctx);
      if (!ev.compliant) {
        recipe = make({ kind: 'underground', spaces, area: 'auto' });
        br = build(recipe, site, { mesh: false });
        ev = evaluate(zone, br, ctx);
      }
      y = computeYield(br, input.assumptions);
    }
    if (!ev.compliant) return null;
    if (intent.targetGfa && Math.abs(br.totals.gfaM2 - intent.targetGfa) > 0.5 * intent.targetGfa) return null;
    const sc = score(br, y);
    const id = `${t}-${n}-${tp.depth}-${tp.fillU}-${tp.fillV}`;
    origin.set(id, { n, tp });
    return {
      id,
      template: t,
      recipe,
      metrics: br.totals,
      compliance: ev,
      yield: y,
      score: sc.s,
      scoreBasis: sc.basis,
    };
  };

  const keep = (c: Candidate | null) => {
    if (!c) return;
    const prev = best.get(c.template);
    if (!prev || c.score > prev.score + 1e-9) best.set(c.template, c);
  };

  for (const n of floorsList) {
    if (iterations >= maxIter) break;
    const H = heightFor(n);
    const buildable = buildableArea(plot, input.edgeClasses, zone, { heightM: H, storeys: n });
    if (!buildable || area(buildable) < 40) continue;
    const b = bbox(buildable.map((p) => toFrame(frame, p)));
    const gap = sepRule && sepRule.type === 'min_separation'
      ? Math.ceil(evaluateFormula(sepRule.min, { H, n, A: area(plot) }) * 2) / 2 + 0.5
      : 6;
    for (const t of templates) {
      for (const depth of DEPTHS) {
        for (const fillU of FILL_U) {
          for (const fillV of FILL_V) {
            const tp: TemplateParams = {
              u0: b.minX,
              v0: b.minY,
              lenU: b.maxX - b.minX,
              lenV: b.maxY - b.minY,
              fillU,
              fillV,
              depth,
              gap: Math.max(gap, 6),
            };
            keep(tryCandidate(t, n, tp, buildable));
          }
        }
      }
    }
  }

  // Local refinement around each template's best candidate.
  for (const c of [...best.values()]) {
    const o = origin.get(c.id);
    if (!o) continue;
    const buildable = buildableArea(plot, input.edgeClasses, zone, { heightM: heightFor(o.n), storeys: o.n });
    if (!buildable) continue;
    for (const dd of [-1.5, 0, 1.5]) {
      for (const du of [-0.1, 0, 0.1]) {
        for (const dv of [-0.1, 0, 0.1]) {
          if (dd === 0 && du === 0 && dv === 0) continue;
          const tp: TemplateParams = {
            ...o.tp,
            fillU: Math.min(1, Number((o.tp.fillU + du).toFixed(3))),
            fillV: Math.min(1, Number((o.tp.fillV + dv).toFixed(3))),
            depth: o.tp.depth + dd,
          };
          keep(tryCandidate(c.template, o.n, tp, buildable));
        }
      }
    }
  }

  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.template.localeCompare(b.template));
  const out: Candidate[] = [];
  for (const c of sorted) {
    if (out.length >= 3) break;
    const similar = out.some(
      (o) => Math.abs(o.metrics.gfaM2 - c.metrics.gfaM2) < 0.03 * Math.max(1, o.metrics.gfaM2) && o.template === c.template,
    );
    if (!similar) out.push(c);
  }
  return {
    candidates: out,
    iterations,
    ...(out.length === 0 ? { reason: 'No compliant layout found for this intent on this plot' } : {}),
  };
}
