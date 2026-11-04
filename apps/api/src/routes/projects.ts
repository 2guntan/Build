import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  CreateOption,
  CreateProject,
  PatchContextBuilding,
  PatchEdges,
  PutPlot,
  PutYieldAssumptions,
  UpdateProject,
} from '@fs/api-contract';
import { epsgForZone, utmZoneFor } from '@fs/geometry';
import { findZone } from '@fs/rules';
import {
  contextBuilding,
  designOption,
  evaluation,
  membership,
  plot,
  project,
  ruleSet,
  siteImport,
  terrainTile,
  yieldAssumption,
} from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { requireUser, type Deps } from '../app.js';
import { projectFor } from '../services/access.js';
import { loadAssumptions, projectContext } from '../services/evaluation.js';
import { createOption } from '../services/options.js';
import { frameFor, outerRingLonLat, plotSummary, validatePlotGeoJson, type PlotRow } from '../services/site.js';

type P = { Params: { id: string } };

async function defaultRuleSet(deps: Deps, jurisdictionId: string) {
  const sets = await deps.db.select().from(ruleSet).where(eq(ruleSet.jurisdictionId, jurisdictionId));
  const published = sets.filter((s) => s.status === 'published').sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  if (published[0]) return published[0].id;
  if (deps.cfg.ALLOW_DRAFT_RULESETS && sets[0]) return sets[0].id;
  return null;
}

async function projectDto(deps: Deps, p: typeof project.$inferSelect) {
  const ctx = await projectContext(deps.db, deps.cfg, p.id).catch(() => null);
  const [pl] = await deps.db.select().from(plot).where(eq(plot.projectId, p.id));
  const opts = await deps.db.select({ head: designOption.headVersionId }).from(designOption).where(and(eq(designOption.projectId, p.id), eq(designOption.isArchived, false)));
  const heads = opts.map((o) => o.head).filter((h): h is string => !!h);
  const evs = heads.length ? await deps.db.select({ y: evaluation.yield }).from(evaluation).where(inArray(evaluation.recipeVersionId, heads)) : [];
  const margins = evs.map((e) => e.y as { complete: boolean; margin: number }).filter((y) => y.complete).map((y) => y.margin);
  return {
    id: p.id,
    orgId: p.orgId,
    name: p.name,
    jurisdictionId: p.jurisdictionId,
    ruleSetId: p.ruleSetId,
    currency: p.currency,
    locale: p.locale,
    archived: p.archived,
    createdAt: p.createdAt.toISOString(),
    plot: pl ? plotSummary(pl as PlotRow, ctx?.zone ?? null) : null,
    bestMargin: margins.length ? Math.max(...margins) : null,
    ruleSetIsTest: ctx?.isTest ?? false,
  };
}

export function registerProjectRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps;

  app.get('/api/v1/projects', async (req) => {
    const u = await requireUser(deps, req);
    const rows = await db
      .select({ project })
      .from(project)
      .innerJoin(membership, and(eq(membership.orgId, project.orgId), eq(membership.userId, u.userId)))
      .where(eq(project.archived, false))
      .orderBy(desc(project.createdAt));
    return Promise.all(rows.map((r) => projectDto(deps, r.project)));
  });

  app.post('/api/v1/projects', async (req, reply) => {
    const u = await requireUser(deps, req);
    const body = CreateProject.parse(req.body ?? {});
    const mems = await db.select().from(membership).where(eq(membership.userId, u.userId));
    const mem = body.orgId ? mems.find((m) => m.orgId === body.orgId) : mems.find((m) => m.role !== 'viewer');
    if (!mem) throw new ProblemError(body.orgId ? 'NOT_FOUND' : 'FORBIDDEN');
    if (mem.role === 'viewer') throw new ProblemError('FORBIDDEN');
    const [p] = await db
      .insert(project)
      .values({
        orgId: mem.orgId,
        name: body.name,
        jurisdictionId: body.jurisdictionId,
        ruleSetId: await defaultRuleSet(deps, body.jurisdictionId),
        currency: body.currency,
        locale: body.locale,
        createdBy: u.userId,
      })
      .returning();
    reply.status(201);
    return projectDto(deps, p!);
  });

  app.get<P>('/api/v1/projects/:id', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id);
    return projectDto(deps, p);
  });

  app.patch<P>('/api/v1/projects/:id', async (req) => {
    const u = await requireUser(deps, req);
    await projectFor(db, u, req.params.id, 'editor');
    const body = UpdateProject.parse(req.body ?? {});
    const [p] = await db.update(project).set(body).where(eq(project.id, req.params.id)).returning();
    return projectDto(deps, p!);
  });

  app.delete<P>('/api/v1/projects/:id', async (req, reply) => {
    const u = await requireUser(deps, req);
    await projectFor(db, u, req.params.id, 'owner');
    await db.update(project).set({ archived: true }).where(eq(project.id, req.params.id));
    return reply.status(204).send();
  });

  app.put<P>('/api/v1/projects/:id/plot', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const body = PutPlot.parse(req.body);
    const { ring, origin } = validatePlotGeoJson(body.geojson);
    const geom = { type: 'Polygon' as const, coordinates: [ring.map((v) => [v[0], v[1]] as [number, number])] };
    const crs = `EPSG:${epsgForZone(utmZoneFor(origin.lon, origin.lat))}`;
    const edgeClasses = body.edgeClasses && body.edgeClasses.length === ring.length ? body.edgeClasses : ring.map((_, i) => (i === 0 ? 'front' : 'side') as 'front' | 'side');
    const values = { geom, originLon: origin.lon, originLat: origin.lat, crs, edgeClasses, zoneId: body.zoneId ?? null, source: body.source, updatedAt: new Date() };
    await db.insert(plot).values({ projectId: p.id, ...values }).onConflictDoUpdate({ target: plot.projectId, set: values });
    const ctx = await projectContext(db, deps.cfg, p.id);
    if (body.zoneId && ctx.ruleSet) findZone(ctx.ruleSet, body.zoneId); // throws on unknown zone
    return plotSummary(ctx.plot!, ctx.zone);
  });

  app.patch<P>('/api/v1/projects/:id/plot/edges', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const body = PatchEdges.parse(req.body);
    const [pl] = await db.select().from(plot).where(eq(plot.projectId, p.id));
    if (!pl) throw new ProblemError('PLOT_INVALID', 'Set the plot first');
    if (body.edgeClasses.length !== outerRingLonLat(pl.geom).length) throw new ProblemError('PLOT_INVALID', 'One class per plot edge');
    const ctx0 = await projectContext(db, deps.cfg, p.id);
    if (body.zoneId && ctx0.ruleSet) {
      try {
        findZone(ctx0.ruleSet, body.zoneId);
      } catch {
        throw new ProblemError('VALIDATION_FAILED', `Unknown zone ${body.zoneId}`);
      }
    }
    await db
      .update(plot)
      .set({ edgeClasses: body.edgeClasses, ...(body.zoneId ? { zoneId: body.zoneId } : {}), updatedAt: new Date() })
      .where(eq(plot.id, pl.id));
    const ctx = await projectContext(db, deps.cfg, p.id);
    return plotSummary(ctx.plot!, ctx.zone);
  });

  app.post<P>('/api/v1/projects/:id/site-data', async (req, reply) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const [imp] = await db.insert(siteImport).values({ projectId: p.id }).returning();
    await deps.jobs.enqueue('site.import', { id: imp!.id });
    reply.status(202);
    return { jobId: imp!.id };
  });

  app.get<P>('/api/v1/projects/:id/context', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id);
    const [pl] = await db.select().from(plot).where(eq(plot.projectId, p.id));
    const buildings = await db.select().from(contextBuilding).where(and(eq(contextBuilding.projectId, p.id), eq(contextBuilding.deleted, false)));
    const tiles = await db.select().from(terrainTile).where(eq(terrainTile.projectId, p.id));
    const [lastImport] = await db.select().from(siteImport).where(eq(siteImport.projectId, p.id)).orderBy(desc(siteImport.createdAt)).limit(1);
    const frame = pl ? frameFor(pl) : null;
    return {
      import: lastImport ? { id: lastImport.id, status: lastImport.status, stats: lastImport.stats, error: lastImport.error } : null,
      buildings: buildings.map((b) => ({
        id: b.id,
        geom: b.geom,
        heightM: b.heightM,
        heightSource: b.heightSource,
        dataSource: b.dataSource,
        local: frame ? outerRingLonLat(b.geom).map(([lon, lat]) => frame.toLocal(lon, lat)) : [],
      })),
      terrain: await Promise.all(tiles.map(async (t) => ({ id: t.id, resolutionM: t.resolutionM, url: await deps.storage.signedUrl(t.storageKey) }))),
    };
  });

  app.patch<{ Params: { id: string; bid: string } }>('/api/v1/projects/:id/context/:bid', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const body = PatchContextBuilding.parse(req.body);
    const [b] = await db
      .update(contextBuilding)
      .set({ ...(body.heightM !== undefined ? { heightM: body.heightM, heightSource: 'user' as const } : {}), ...(body.deleted !== undefined ? { deleted: body.deleted } : {}) })
      .where(and(eq(contextBuilding.id, req.params.bid), eq(contextBuilding.projectId, p.id)))
      .returning();
    if (!b) throw new ProblemError('NOT_FOUND');
    return { id: b.id, heightM: b.heightM, heightSource: b.heightSource, deleted: b.deleted };
  });

  app.get<P>('/api/v1/projects/:id/yield-assumptions', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id);
    return { currency: p.currency, ...(await loadAssumptions(db, p.id)) };
  });

  app.put<P>('/api/v1/projects/:id/yield-assumptions', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const a = PutYieldAssumptions.parse(req.body);
    const values = {
      currency: a.currency,
      salePricePerM2: a.salePricePerM2,
      buildCostPerM2: a.buildCostPerM2,
      unitSizesM2: a.unitSizesM2,
      landCost: a.landCost ?? null,
      softCostRatio: a.softCostRatio ?? null,
      parkingCostPerSpace: a.parkingCostPerSpace ?? null,
      updatedAt: new Date(),
    };
    await db.insert(yieldAssumption).values({ projectId: p.id, ...values }).onConflictDoUpdate({ target: yieldAssumption.projectId, set: values });
    return loadAssumptions(db, p.id);
  });

  app.get<P & { Querystring: { options?: string } }>('/api/v1/projects/:id/compare', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id);
    const ids = (req.query.options ?? '').split(',').filter(Boolean).slice(0, 4);
    if (ids.length < 1) throw new ProblemError('VALIDATION_FAILED', 'options=a,b[,c,d] required');
    const opts = await db.select().from(designOption).where(and(eq(designOption.projectId, p.id), inArray(designOption.id, ids)));
    const heads = opts.map((o) => o.headVersionId).filter((h): h is string => !!h);
    const evs = heads.length ? await db.select().from(evaluation).where(inArray(evaluation.recipeVersionId, heads)) : [];
    return ids
      .map((id) => opts.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => {
        const e = evs.find((x) => x.recipeVersionId === o.headVersionId);
        return { optionId: o.id, name: o.name, versionId: o.headVersionId, metrics: e?.metrics ?? null, compliance: e?.compliance ?? null, yield: e?.yield ?? null };
      });
  });

  app.get<P>('/api/v1/projects/:id/options', async (req) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id);
    return db.select().from(designOption).where(and(eq(designOption.projectId, p.id), eq(designOption.isArchived, false))).orderBy(designOption.createdAt);
  });

  app.post<P>('/api/v1/projects/:id/options', async (req, reply) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const body = CreateOption.parse(req.body ?? {});
    const opt = await createOption(db, deps.cfg, { projectId: p.id, name: body.name, duplicateFrom: body.duplicateFrom, ruleSetId: body.ruleSetId ?? p.ruleSetId, userId: u.userId });
    reply.status(201);
    return opt;
  });
}
