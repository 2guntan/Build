import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Recipe } from '@fs/recipe';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { designOption, evaluation, recipeVersion } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { evaluateRecipe, parseRecipeOrThrow, projectContext, type ProjectContext } from './evaluation.js';

export function starterRecipe(optionId: string, ctx: ProjectContext): Recipe {
  const p = ctx.plot;
  return {
    schemaVersion: 1,
    optionId,
    site: {
      origin: { lon: p?.originLon ?? -17.4677, lat: p?.originLat ?? 14.7167, crs: p?.crs ?? 'EPSG:32628' },
      plotRef: p?.id ?? 'none',
      northAngle: 0,
    },
    programme: { targetUse: 'mixed' },
    params: {
      floorsA: { value: 4, min: 1, max: 12, step: 1, label: 'Niveaux bloc A' },
      widthA: { value: 20, min: 6, max: 80, step: 0.5, unit: 'm', label: 'Largeur bloc A' },
      depthA: { value: 12, min: 6, max: 40, step: 0.5, unit: 'm', label: 'Profondeur bloc A' },
      groundFloorHeight: { value: 4.5, min: 3, max: 6, step: 0.1, unit: 'm', label: 'Hauteur RDC' },
      typicalFloorHeight: { value: 3.1, min: 2.8, max: 4, step: 0.1, unit: 'm', label: 'Hauteur étage courant' },
    },
    blocks: [
      {
        id: `blk_${optionId.slice(-6)}A`,
        name: 'Bloc A',
        footprint: { kind: 'rect', anchor: 'buildable.front-left', width: '$params.widthA', depth: '$params.depthA', rotation: 0, offsetU: 0, offsetV: 0 },
        floors: '$params.floorsA',
        floorHeights: { ground: '$params.groundFloorHeight', typical: '$params.typicalFloorHeight' },
        uses: [
          { floors: [0], use: 'retail', efficiency: 0.85 },
          { floors: [1, 'last'], use: 'residential', efficiency: 0.8, unitMix: { T2: 0.4, T3: 0.45, T4: 0.15 } },
        ],
        roof: { kind: 'flat', accessible: false },
      },
    ],
    parking: { kind: 'surface', spaces: 0, area: 'auto' },
    meta: { createdBy: 'user' },
  };
}

export interface SaveArgs {
  optionId: string;
  recipe: unknown;
  authorKind: 'user' | 'slider' | 'agent';
  authorId: string;
  summary?: string | undefined;
  parentId?: string | null | undefined;
}

/** Re-evaluates on the server and stores an immutable version + evaluation, then moves the head. */
export async function saveVersion(db: Db, cfg: Config, args: SaveArgs) {
  const [opt] = await db.select().from(designOption).where(eq(designOption.id, args.optionId));
  if (!opt) throw new ProblemError('NOT_FOUND');
  if (args.parentId !== undefined && args.parentId !== opt.headVersionId) {
    throw new ProblemError('CONFLICT', 'The option head moved since this edit started');
  }
  const recipe = parseRecipeOrThrow(args.recipe);
  if (recipe.optionId !== opt.id) recipe.optionId = opt.id;
  recipe.meta.nonCompliantStudy = opt.nonCompliantStudy || recipe.meta.nonCompliantStudy || undefined;
  const ctx = await projectContext(db, cfg, opt.projectId, opt.ruleSetId);
  const res = evaluateRecipe(recipe, ctx);
  return db.transaction(async (tx) => {
    const [v] = await tx
      .insert(recipeVersion)
      .values({
        optionId: opt.id,
        parentId: opt.headVersionId,
        schemaVersion: recipe.schemaVersion,
        recipe,
        authorKind: args.authorKind,
        authorId: args.authorId,
        summary: args.summary ?? null,
      })
      .returning();
    const [ev] = await tx
      .insert(evaluation)
      .values({
        recipeVersionId: v!.id,
        compliance: res.compliance,
        metrics: { ...res.build.totals, hash: res.build.hash, inputHash: res.build.inputHash, errors: res.build.errors },
        yield: res.yield,
        builderVersion: res.build.builderVersion,
        ruleSetId: ctx.ruleSetId,
      })
      .returning();
    await tx.update(designOption).set({ headVersionId: v!.id }).where(eq(designOption.id, opt.id));
    return { version: v!, evaluation: ev! };
  });
}

export async function createOption(
  db: Db,
  cfg: Config,
  a: { projectId: string; name: string; duplicateFrom?: string | undefined; ruleSetId?: string | null; userId: string },
) {
  const [opt] = await db.insert(designOption).values({ projectId: a.projectId, name: a.name, ruleSetId: a.ruleSetId ?? null }).returning();
  let recipe: unknown;
  if (a.duplicateFrom) {
    const [src] = await db.select().from(designOption).where(and(eq(designOption.id, a.duplicateFrom), eq(designOption.projectId, a.projectId)));
    if (!src?.headVersionId) throw new ProblemError('NOT_FOUND', 'Source option not found');
    const [v] = await db.select().from(recipeVersion).where(eq(recipeVersion.id, src.headVersionId));
    recipe = { ...(v!.recipe as Recipe), optionId: opt!.id };
  } else {
    recipe = starterRecipe(opt!.id, await projectContext(db, cfg, a.projectId, a.ruleSetId));
  }
  const ctx = await projectContext(db, cfg, a.projectId, a.ruleSetId);
  if (ctx.site) {
    await saveVersion(db, cfg, { optionId: opt!.id, recipe, authorKind: 'user', authorId: a.userId, summary: a.duplicateFrom ? 'Duplicate' : 'Start' });
  }
  const [fresh] = await db.select().from(designOption).where(eq(designOption.id, opt!.id));
  return fresh!;
}

export async function optionWithHead(db: Db, optionId: string) {
  const [opt] = await db.select().from(designOption).where(eq(designOption.id, optionId));
  if (!opt) throw new ProblemError('NOT_FOUND');
  if (!opt.headVersionId) return { option: opt, head: null, evaluation: null };
  const [v] = await db.select().from(recipeVersion).where(eq(recipeVersion.id, opt.headVersionId));
  const [ev] = await db.select().from(evaluation).where(eq(evaluation.recipeVersionId, opt.headVersionId));
  return { option: opt, head: v ?? null, evaluation: ev ?? null };
}

export async function history(db: Db, optionId: string) {
  const versions = await db.select().from(recipeVersion).where(eq(recipeVersion.optionId, optionId)).orderBy(desc(recipeVersion.createdAt));
  const ids = versions.map((v) => v.id);
  const evs = ids.length ? await db.select().from(evaluation).where(inArray(evaluation.recipeVersionId, ids)) : [];
  const byV = new Map(evs.map((e) => [e.recipeVersionId, e]));
  return versions.map((v) => {
    const e = byV.get(v.id);
    return {
      id: v.id,
      parentId: v.parentId,
      authorKind: v.authorKind,
      summary: v.summary,
      createdAt: v.createdAt.toISOString(),
      gfaM2: e ? ((e.metrics as { gfaM2: number }).gfaM2 ?? null) : null,
      compliant: e ? ((e.compliance as { compliant: boolean }).compliant ?? null) : null,
    };
  });
}

export async function moveHead(db: Db, optionId: string, versionId: string) {
  const [v] = await db.select().from(recipeVersion).where(and(eq(recipeVersion.id, versionId), eq(recipeVersion.optionId, optionId)));
  if (!v) throw new ProblemError('NOT_FOUND', 'Version does not belong to this option');
  await db.update(designOption).set({ headVersionId: v.id }).where(eq(designOption.id, optionId));
  return optionWithHead(db, optionId);
}
