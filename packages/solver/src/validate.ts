import { build } from '@fs/builder';
import { isSimple, ringInside, ringsOverlap, normalizeRing } from '@fs/geometry';
import { Recipe, missingParams, type BuildResult, type EdgeClass, type Vec2 } from '@fs/recipe';
import { buildableArea, evaluate, type Evaluation, type Zone } from '@fs/rules';
import { computeYield, type YieldAssumptions, type YieldResult } from '@fs/yield';

export type ValidationCode =
  | 'SCHEMA'
  | 'PARAM_MISSING'
  | 'PARAM_OUT_OF_BOUNDS'
  | 'BUILD_ERROR'
  | 'FOOTPRINT_NOT_SIMPLE'
  | 'FOOTPRINT_OUTSIDE_PLOT'
  | 'BLOCKS_OVERLAP'
  | 'FLOORS_INVALID'
  | 'FLOOR_HEIGHT_INVALID'
  | 'RULE_BLOCKING'
  | 'GFA_FAR_FROM_TARGET'
  | 'EFFICIENCY_OUT_OF_RANGE';

export interface ValidationIssue {
  code: ValidationCode;
  message: string;
  path?: string;
  elementIds?: string[];
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Blocking-rule issues that were tolerated because the option is a non-compliant study. */
  tolerated: ValidationIssue[];
  recipe?: Recipe;
  build?: BuildResult;
  evaluation?: Evaluation;
  yield?: YieldResult;
}

export interface ValidateContext {
  plot: Vec2[];
  edgeClasses: EdgeClass[];
  zone: Zone;
  assumptions?: Partial<YieldAssumptions>;
}

/** Schema, geometry, rule and sanity checks. Messages are written for Claude to act on. */
export function validate(input: unknown, ctx: ValidateContext): ValidationResult {
  const issues: ValidationIssue[] = [];
  const parsed = Recipe.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      tolerated: [],
      issues: parsed.error.issues.map((i) => ({ code: 'SCHEMA', message: i.message, path: i.path.join('.') })),
    };
  }
  const recipe = parsed.data;
  const missing = missingParams(recipe);
  for (const k of missing) issues.push({ code: 'PARAM_MISSING', message: `Param ${k} is referenced but not defined`, path: `params.${k}` });
  for (const [k, p] of Object.entries(recipe.params)) {
    if (p.value < p.min - 1e-9 || p.value > p.max + 1e-9) {
      issues.push({ code: 'PARAM_OUT_OF_BOUNDS', message: `Param ${k}=${p.value} outside [${p.min}, ${p.max}]`, path: `params.${k}` });
    }
  }
  if (missing.length) return { ok: false, issues, tolerated: [], recipe };

  const plot = normalizeRing(ctx.plot);
  const buildable = buildableArea(plot, ctx.edgeClasses, ctx.zone) ?? plot;
  const site = { plot, edgeClasses: ctx.edgeClasses, buildable };
  const br = build(recipe, site);
  for (const e of br.errors) issues.push({ code: 'BUILD_ERROR', message: e });

  for (const b of br.blocks) {
    if (!isSimple(b.footprint)) {
      issues.push({ code: 'FOOTPRINT_NOT_SIMPLE', message: `${b.name}: footprint self-intersects`, elementIds: [b.id] });
    }
    if (!ringInside(b.footprint, plot, 1e-3)) {
      issues.push({ code: 'FOOTPRINT_OUTSIDE_PLOT', message: `${b.name}: footprint extends outside the plot`, elementIds: [b.id] });
    }
    if (b.floors < 1) issues.push({ code: 'FLOORS_INVALID', message: `${b.name}: floors must be ≥ 1`, elementIds: [b.id] });
    for (const s of b.storeys) {
      if (s.heightM < 2.4 || s.heightM > 8) {
        issues.push({ code: 'FLOOR_HEIGHT_INVALID', message: `${b.name}: storey ${s.index} height ${s.heightM} m outside 2.4–8 m`, elementIds: [b.id] });
        break;
      }
    }
  }
  for (let i = 0; i < br.blocks.length; i++) {
    for (let j = i + 1; j < br.blocks.length; j++) {
      const a = br.blocks[i]!;
      const b = br.blocks[j]!;
      if (ringsOverlap(a.footprint, b.footprint)) {
        issues.push({ code: 'BLOCKS_OVERLAP', message: `${a.name} and ${b.name} overlap`, elementIds: [a.id, b.id] });
      }
    }
  }
  for (const blk of recipe.blocks) {
    for (const u of blk.uses) {
      if (u.use !== 'parking' && (u.efficiency < 0.5 || u.efficiency > 0.95)) {
        issues.push({ code: 'EFFICIENCY_OUT_OF_RANGE', message: `${blk.name}: efficiency ${u.efficiency} for ${u.use} outside 0.5–0.95`, elementIds: [blk.id] });
      }
    }
  }
  const target = recipe.programme.targetGfa;
  if (target && Math.abs(br.totals.gfaM2 - target) > 0.5 * target) {
    issues.push({ code: 'GFA_FAR_FROM_TARGET', message: `GFA ${br.totals.gfaM2.toFixed(0)} m² is more than ±50% from target ${target} m²` });
  }

  const y = computeYield(br, ctx.assumptions);
  const evaluation = evaluate(ctx.zone, br, { plot, edgeClasses: ctx.edgeClasses, unitsByUse: y.unitsByUse });
  const ruleIssues: ValidationIssue[] = evaluation.results
    .filter((r) => r.status === 'fail')
    .map((r) => ({
      code: 'RULE_BLOCKING' as const,
      message: `${r.ruleId}: ${r.message_en}; margin ${r.margin} ${r.unit} [${r.cite.source} ${r.cite.article}]`,
      elementIds: r.elementIds,
    }));
  const tolerated = recipe.meta.nonCompliantStudy ? ruleIssues : [];
  if (!recipe.meta.nonCompliantStudy) issues.push(...ruleIssues);
  return { ok: issues.length === 0, issues, tolerated, recipe, build: br, evaluation, yield: y };
}
