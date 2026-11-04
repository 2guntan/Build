import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { build } from '@fs/builder';
import { LocalFrame } from '@fs/geometry';
import type { Recipe } from '@fs/recipe';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { designOption, evaluation, exportJob, project, recipeVersion } from '../db/schema.js';
import { projectContext } from './evaluation.js';
import type { Storage } from './storage.js';

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

/** WinAnsi-safe text for the standard PDF fonts. */
function safe(s: string) {
  return s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

export async function renderPdf(db: Db, cfg: Config, versionId: string): Promise<Uint8Array> {
  const { version, option, project: p, evaluation: ev } = await load(db, cfg, versionId);
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const line = (t: string, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(safe(t), { x: 48, y, size, font: f, color });
    y -= size + 6;
  };
  const metrics = (ev?.metrics ?? {}) as Record<string, number>;
  const compliance = (ev?.compliance ?? { results: [], test: false }) as {
    results: { ruleId: string; status: string; message_fr: string; cite: { source: string; article: string } }[];
    test: boolean;
    compliant: boolean;
  };
  const y_ = (ev?.yield ?? {}) as { complete?: boolean; revenue?: number; totalCost?: number; margin?: number; marginOnCost?: number | null; currency?: string; missing?: string[] };
  const fmt = (n: number | undefined, d = 0) => (n === undefined || n === null ? '-' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n));
  line('Feasibility Studio - Synthèse de faisabilité', 16, bold);
  line(`${p.name} · ${option.name} · version ${version.id}`, 10);
  line(`Généré le ${new Date().toISOString().slice(0, 10)}`, 8, font, rgb(0.4, 0.4, 0.4));
  if (compliance.test) line('ATTENTION : règles de TEST, non officielles. Ne pas utiliser pour une décision.', 10, bold, rgb(0.75, 0.1, 0.1));
  y -= 6;
  line('Programme', 12, bold);
  line(`Surface de plancher (SDP) : ${fmt(metrics.gfaM2)} m²   Emprise : ${fmt(metrics.footprintAreaM2)} m²   Parcelle : ${fmt(metrics.plotAreaM2)} m²`);
  line(`Hauteur max : ${fmt(metrics.maxHeightM, 1)} m   Niveaux max : R+${Math.max(0, (metrics.maxFloors ?? 1) - 1)}   Stationnement : ${fmt(metrics.parkingSpaces)} places`);
  if (metrics.plotAreaM2) line(`Emprise au sol : ${fmt((100 * metrics.footprintAreaM2!) / metrics.plotAreaM2, 1)} %   COS : ${fmt(metrics.gfaM2! / metrics.plotAreaM2, 2)}`);
  y -= 6;
  line(`Conformité : ${compliance.compliant ? 'conforme' : 'NON conforme'}`, 12, bold);
  for (const r of compliance.results.slice(0, 18)) {
    const mark = r.status === 'pass' ? 'OK ' : r.status === 'warn' ? '!  ' : 'X  ';
    line(`${mark} ${r.message_fr}  [${r.cite.source} ${r.cite.article}]`, 9);
  }
  y -= 6;
  line('Bilan', 12, bold);
  if (y_.complete) {
    line(`Chiffre d'affaires : ${fmt(y_.revenue)} ${y_.currency}   Coût total : ${fmt(y_.totalCost)} ${y_.currency}`);
    line(`Marge : ${fmt(y_.margin)} ${y_.currency}   Marge sur coût : ${y_.marginOnCost != null ? fmt(100 * y_.marginOnCost, 1) + ' %' : '-'}`);
  } else {
    line(`Hypothèses incomplètes : ${(y_.missing ?? []).join(', ') || 'saisissez vos prix'}`, 9);
  }
  y = 60;
  line(ATTRIBUTION, 7, font, rgb(0.4, 0.4, 0.4));
  line('Étude de capacité indicative. Ne remplace ni un relevé, ni un avis réglementaire.', 7, font, rgb(0.4, 0.4, 0.4));
  return doc.save();
}

export async function runExport(db: Db, cfg: Config, storage: Storage, exportId: string): Promise<void> {
  const [ex] = await db.select().from(exportJob).where(eq(exportJob.id, exportId));
  if (!ex) return;
  await db.update(exportJob).set({ status: 'running' }).where(eq(exportJob.id, exportId));
  try {
    let body: Uint8Array;
    let type: string;
    if (ex.kind === 'pdf') {
      body = await renderPdf(db, cfg, ex.recipeVersionId);
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
