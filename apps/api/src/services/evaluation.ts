import { eq } from 'drizzle-orm';
import { build } from '@fs/builder';
import { RecipeSchemaError, migrateRecipe, type BuildResult, type Recipe, type SiteInput } from '@fs/recipe';
import { evaluate, findZone, RuleSet, type Evaluation, type Zone } from '@fs/rules';
import { computeYield, type YieldAssumptions, type YieldResult } from '@fs/yield';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { plot as plotT, project as projectT, ruleSet, yieldAssumption } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { siteInput, type PlotRow } from './site.js';

export interface ProjectContext {
  projectId: string;
  plot: PlotRow | null;
  ruleSetId: string | null;
  ruleSet: RuleSet | null;
  isTest: boolean;
  zone: Zone | null;
  site: SiteInput | null;
  assumptions: Partial<YieldAssumptions>;
}

export interface EvaluationResult {
  build: BuildResult;
  compliance: Evaluation & { test: boolean; ruleSetId: string | null; zoneId: string | null };
  yield: YieldResult;
}

export async function loadRuleSet(db: Db, cfg: Config, id: string) {
  const [rs] = await db.select().from(ruleSet).where(eq(ruleSet.id, id));
  if (!rs) throw new ProblemError('NOT_FOUND', `Rule set ${id} not found`);
  if (rs.status !== 'published' && !cfg.ALLOW_DRAFT_RULESETS) throw new ProblemError('RULESET_NOT_PUBLISHED');
  return { row: rs, content: RuleSet.parse(rs.content) };
}

export async function loadAssumptions(db: Db, projectId: string): Promise<Partial<YieldAssumptions>> {
  const [ya] = await db.select().from(yieldAssumption).where(eq(yieldAssumption.projectId, projectId));
  if (!ya) return {};
  const out: Partial<YieldAssumptions> = {
    currency: ya.currency,
    salePricePerM2: ya.salePricePerM2 as YieldAssumptions['salePricePerM2'],
    buildCostPerM2: ya.buildCostPerM2 as YieldAssumptions['buildCostPerM2'],
    unitSizesM2: ya.unitSizesM2 as YieldAssumptions['unitSizesM2'],
  };
  if (ya.landCost !== null) out.landCost = ya.landCost;
  if (ya.softCostRatio !== null) out.softCostRatio = ya.softCostRatio;
  if (ya.parkingCostPerSpace !== null) out.parkingCostPerSpace = ya.parkingCostPerSpace;
  return out;
}

/** Everything needed to evaluate a recipe for a project, loaded once. */
export async function projectContext(db: Db, cfg: Config, projectId: string, ruleSetIdOverride?: string | null): Promise<ProjectContext> {
  const [p] = await db.select().from(projectT).where(eq(projectT.id, projectId));
  if (!p) throw new ProblemError('NOT_FOUND');
  const [pl] = await db.select().from(plotT).where(eq(plotT.projectId, projectId));
  const rsId = ruleSetIdOverride ?? p.ruleSetId;
  let rs: RuleSet | null = null;
  let isTest = false;
  if (rsId) {
    const loaded = await loadRuleSet(db, cfg, rsId);
    rs = loaded.content;
    isTest = loaded.row.isTest;
  }
  const plotRow = (pl ?? null) as PlotRow | null;
  let zone: Zone | null = null;
  if (rs && plotRow?.zoneId) {
    try {
      zone = findZone(rs, plotRow.zoneId);
    } catch {
      zone = null;
    }
  }
  return {
    projectId,
    plot: plotRow,
    ruleSetId: rsId ?? null,
    ruleSet: rs,
    isTest,
    zone,
    site: plotRow ? siteInput(plotRow, zone) : null,
    assumptions: await loadAssumptions(db, projectId),
  };
}

export function parseRecipeOrThrow(input: unknown): Recipe {
  try {
    return migrateRecipe(input);
  } catch (e) {
    if (e instanceof RecipeSchemaError) throw new ProblemError('RECIPE_SCHEMA_INVALID', e.message, e.issues);
    throw e;
  }
}

/** Authoritative server-side evaluation: builder + rules + yield. */
export function evaluateRecipe(recipe: Recipe, ctx: ProjectContext): EvaluationResult {
  if (!ctx.site) throw new ProblemError('PLOT_INVALID', 'The project has no plot yet');
  const br = build(recipe, ctx.site, { mesh: false });
  const y = computeYield(br, ctx.assumptions);
  const ev: Evaluation = ctx.zone
    ? evaluate(ctx.zone, br, { plot: ctx.site.plot, edgeClasses: ctx.site.edgeClasses, unitsByUse: y.unitsByUse })
    : { results: [], blockingFailures: 0, warnings: 0, compliant: true };
  return {
    build: br,
    compliance: { ...ev, test: ctx.isTest, ruleSetId: ctx.ruleSetId, zoneId: ctx.zone?.id ?? null },
    yield: y,
  };
}
