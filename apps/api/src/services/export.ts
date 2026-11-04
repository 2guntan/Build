import { eq } from 'drizzle-orm';
import { build } from '@fs/builder';
import { LocalFrame } from '@fs/geometry';
import type { Recipe } from '@fs/recipe';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { designOption, evaluation, exportJob, project, recipeVersion } from '../db/schema.js';
import { projectContext } from './evaluation.js';
import type { Storage } from './storage.js';
import { buildPdf, type PdfInput } from './pdf.js';

export const ATTRIBUTION =
  'Bâtiments : Google Open Buildings (CC BY 4.0 / ODbL), Overture Maps, © contributeurs OpenStreetMap (ODbL). Terrain : Copernicus DEM GLO-30 (© DLR/Airbus, licence Copernicus).';

async function load(db: Db, cfg: Config, versionId: string) {
  const [v] = await db.select().from(recipeVersion).where(eq(recipeVersion.id, versionId));
  const [opt] = await db.select().from(designOption).where(eq(designOption.id, v!.optionId));
  const [p] = await db.select().from(project).where(eq(project.id, opt!.projectId));
  const [ev] = await db.select().from(evaluation).where(eq(evaluation.recipeVersionId, versionId));
  const ctx = await projectContext(db, cfg, p!.id, opt!.ruleSetId);
  return { version: v!, option: opt!, project: p!, evaluation: ev ?? null, ctx };
}

export async function buildIfcPayload(db: Db, cfg: Config, versionId: string) {
  const { version, option, project: p, ctx } = await load(db, cfg, versionId);
  const recipe = version.recipe as Recipe;
  const br = build(recipe, ctx.site!, { mesh: false });
  const frame = new LocalFrame({ lon: ctx.plot!.originLon, lat: ctx.plot!.originLat }, Number(ctx.plot!.crs.split(':')[1]));
  return {
    project: { id: p.id, name: p.name, optionName: option.name, versionId: version.id },
    site: {
      origin: { lon: ctx.plot!.originLon, lat: ctx.plot!.originLat, crs: ctx.plot!.crs },
      originUtm: frame.originUtm,
      northAngle: recipe.site.northAngle,
      plot: ctx.site!.plot,
    },
    blocks: br.blocks.map((b) => ({ id: b.id, name: b.name, footprint: b.footprint, heightM: b.heightM, storeys: b.storeys })),
    attribution: ATTRIBUTION,
  };
}

export async function renderPdf(db: Db, cfg: Config, versionId: string, storage?: Storage): Promise<Uint8Array> {
  const { version, option, project: p, evaluation: ev, ctx } = await load(db, cfg, versionId);
  let thumbnail: Uint8Array | null = null;
  if (storage && option.thumbnailKey) thumbnail = await storage.get(option.thumbnailKey).catch(() => null);
  return buildPdf({
    projectName: p.name,
    optionName: option.name,
    versionId: version.id,
    attribution: ATTRIBUTION,
    recipe: version.recipe as Recipe,
    site: ctx.site!,
    metrics: (ev?.metrics ?? {}) as Record<string, number>,
    compliance: (ev?.compliance ?? { results: [], test: false, compliant: true }) as PdfInput['compliance'],
    yield: (ev?.yield ?? {}) as PdfInput['yield'],
    thumbnail,
  });
}

export async function runExport(db: Db, cfg: Config, storage: Storage, exportId: string): Promise<void> {
  const [ex] = await db.select().from(exportJob).where(eq(exportJob.id, exportId));
  if (!ex) return;
  await db.update(exportJob).set({ status: 'running' }).where(eq(exportJob.id, exportId));
  try {
    let body: Uint8Array;
    let type: string;
    if (ex.kind === 'pdf') {
      body = await renderPdf(db, cfg, ex.recipeVersionId, storage);
      type = 'application/pdf';
    } else {
      const payload = await buildIfcPayload(db, cfg, ex.recipeVersionId);
      const res = await fetch(`${cfg.IFC_SERVICE_URL}/ifc/build`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e: unknown) => {
        throw new Error(`IFC service unreachable: ${e instanceof Error ? e.message : String(e)}`);
      });
      if (!res.ok) throw new Error(`IFC service ${res.status}: ${(await res.text()).slice(0, 300)}`);
      body = new Uint8Array(await res.arrayBuffer());
      type = 'application/x-step';
      // IDS checks on the generated file; a failed check blocks the export.
      const v = await fetch(`${cfg.IFC_SERVICE_URL}/ifc/validate`, { method: 'POST', headers: { 'content-type': 'application/x-step' }, body })
        .then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean; checks?: { id: string; ok: boolean }[] }>) : null))
        .catch(() => null);
      if (v && v.ok === false) {
        throw new Error(`IDS validation failed: ${(v.checks ?? []).filter((c) => !c.ok).map((c) => c.id).join(', ')}`);
      }
    }
    const key = `exports/${ex.recipeVersionId}/${ex.id}.${ex.kind}`;
    await storage.put(key, body, type);
    await db.update(exportJob).set({ status: 'done', storageKey: key }).where(eq(exportJob.id, exportId));
  } catch (e) {
    await db.update(exportJob).set({ status: 'failed', error: e instanceof Error ? e.message : String(e) }).where(eq(exportJob.id, exportId));
  }
}
