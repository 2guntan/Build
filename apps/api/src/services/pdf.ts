import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { build } from '@fs/builder';
import { bbox } from '@fs/geometry';
import type { Recipe, Vec2 } from '@fs/recipe';

/** WinAnsi-safe text for the standard PDF fonts. */
export function safe(s: string) {
  return s
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

const C = {
  ink: rgb(0.07, 0.09, 0.15),
  muted: rgb(0.36, 0.4, 0.45),
  line: rgb(0.86, 0.88, 0.9),
  accent: rgb(0.06, 0.46, 0.43),
  ok: rgb(0.08, 0.5, 0.24),
  warn: rgb(0.7, 0.33, 0.04),
  bad: rgb(0.73, 0.11, 0.11),
  tile: rgb(0.96, 0.97, 0.97),
};
const USE: Record<string, RGB> = {
  retail: rgb(0.96, 0.62, 0.04),
  residential: rgb(0.06, 0.46, 0.43),
  office: rgb(0.15, 0.39, 0.92),
  hotel: rgb(0.58, 0.2, 0.92),
  amenity: rgb(0.86, 0.15, 0.47),
  parking: rgb(0.39, 0.45, 0.55),
  unassigned: rgb(0.64, 0.64, 0.64),
};

export interface PdfInput {
  projectName: string;
  optionName: string;
  versionId: string;
  attribution: string;
  recipe: Recipe;
  site: { plot: Vec2[]; edgeClasses: ('front' | 'side' | 'rear')[]; buildable: Vec2[] };
  metrics: Record<string, number>;
  compliance: { results: { ruleId: string; status: string; message_fr: string; cite: { source: string; article: string } }[]; test: boolean; compliant: boolean };
  yield: { complete?: boolean; revenue?: number; hardCost?: number; softCost?: number; landCost?: number; parkingCost?: number; totalCost?: number; margin?: number; marginOnCost?: number | null; currency?: string; missing?: string[]; sellableM2?: number };
  thumbnail?: Uint8Array | null;
}

const fmt = (n: number | undefined | null, d = 0) => (n === undefined || n === null || Number.isNaN(n) ? '-' : safe(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n)));

function text(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = C.ink) {
  page.drawText(safe(s), { x, y, size, font, color });
}

function tile(page: PDFPage, x: number, y: number, w: number, label: string, value: string, f: PDFFont, b: PDFFont) {
  page.drawRectangle({ x, y, width: w, height: 40, color: C.tile, borderColor: C.line, borderWidth: 0.5 });
  text(page, label, x + 8, y + 27, 7.5, f, C.muted);
  text(page, value, x + 8, y + 10, 12, b);
}

/** Plan of the plot, buildable area and footprints, north up, with a scale bar. */
function drawPlan(page: PDFPage, input: PdfInput, x: number, y: number, w: number, h: number, f: PDFFont) {
  const br = build(input.recipe, input.site, { mesh: false });
  const all = [...input.site.plot, ...br.blocks.flatMap((b) => b.footprint)];
  const bb = bbox(all);
  const pad = 14;
  const s = Math.min((w - 2 * pad) / (bb.maxX - bb.minX || 1), (h - 2 * pad) / (bb.maxY - bb.minY || 1));
  const ox = x + pad + ((w - 2 * pad) - (bb.maxX - bb.minX) * s) / 2;
  const oy = y + pad + ((h - 2 * pad) - (bb.maxY - bb.minY) * s) / 2;
  const P = (p: Vec2) => ({ x: ox + (p[0] - bb.minX) * s, y: oy + (p[1] - bb.minY) * s });
  const poly = (ring: Vec2[], opts: { fill?: RGB; stroke?: RGB; width?: number; dash?: number[]; opacity?: number }) => {
    const pts = ring.map(P);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x - x} ${-(p.y - y - h)}`).join(' ') + ' Z';
    page.drawSvgPath(path, {
      x,
      y: y + h,
      ...(opts.fill ? { color: opts.fill, opacity: opts.opacity ?? 1 } : {}),
      ...(opts.stroke ? { borderColor: opts.stroke, borderWidth: opts.width ?? 1 } : {}),
      ...(opts.dash ? { borderDashArray: opts.dash } : {}),
    });
  };
  page.drawRectangle({ x, y, width: w, height: h, borderColor: C.line, borderWidth: 0.5 });
  poly(input.site.plot, { fill: rgb(0.88, 0.93, 0.92), stroke: C.bad, width: 1.2 });
  poly(input.site.buildable, { stroke: C.accent, width: 0.8, dash: [3, 2] });
  for (const b of br.blocks) {
    poly(b.footprint, { fill: USE[b.storeys[0]?.use ?? 'unassigned'] ?? USE.unassigned!, stroke: C.ink, width: 0.6, opacity: 0.9 });
    const c = bbox(b.footprint);
    const pc = P([(c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2]);
    text(page, `${b.name} R+${Math.max(0, b.floors - 1)}`, pc.x - 18, pc.y - 3, 7, f, rgb(1, 1, 1));
  }
  // North arrow
  const nx = x + w - 18;
  const ny = y + h - 30;
  page.drawSvgPath('M 0 -16 L 5 0 L 0 -4 L -5 0 Z', { x: nx, y: ny + 16, color: C.bad });
  text(page, 'N', nx - 2.5, ny + 20, 7, f);
  // Scale bar (10 m or 20 m)
  const m = s * 10 > 40 ? 10 : 20;
  page.drawRectangle({ x: x + 10, y: y + 8, width: m * s, height: 3, color: C.ink });
  text(page, `${m} m`, x + 12 + m * s, y + 7, 7, f, C.muted);
}

export async function buildPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`${input.projectName} - ${input.optionName}`));
  doc.setProducer('Feasibility Studio');
  const page = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const m = input.metrics;
  const y_ = input.yield;
  const cur = y_.currency ?? 'XOF';

  // Header band
  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: C.accent });
  text(page, 'Synthèse de faisabilité', 40, 815, 16, b, rgb(1, 1, 1));
  text(page, `${input.projectName} · ${input.optionName}`, 40, 797, 10, f, rgb(0.9, 0.97, 0.96));
  text(page, `${new Date().toISOString().slice(0, 10)} · version ${input.versionId}`, 400, 797, 8, f, rgb(0.85, 0.95, 0.93));
  let y = 770;
  if (input.compliance.test) {
    page.drawRectangle({ x: 40, y: y - 16, width: 515, height: 18, color: rgb(0.99, 0.91, 0.91) });
    text(page, 'ATTENTION : règles de TEST, non officielles. Ne pas utiliser pour une décision.', 48, y - 11, 9, b, C.bad);
    y -= 26;
  }

  // 3D view + plan
  const imgH = 190;
  if (input.thumbnail) {
    try {
      const img = await doc.embedPng(input.thumbnail);
      const w = (img.width / img.height) * imgH;
      page.drawImage(img, { x: 40, y: y - imgH, width: Math.min(w, 300), height: imgH });
    } catch {
      /* ignore broken thumbnails */
    }
  } else {
    page.drawRectangle({ x: 40, y: y - imgH, width: 285, height: imgH, color: C.tile });
    text(page, 'Vue 3D disponible après ouverture du projet', 60, y - imgH / 2, 8, f, C.muted);
  }
  drawPlan(page, input, 335, y - imgH, 220, imgH, f);
  y -= imgH + 14;

  // Metric tiles
  const tiles: [string, string][] = [
    ['SDP', `${fmt(m.gfaM2)} m²`],
    ['Niveaux', `R+${Math.max(0, (m.maxFloors ?? 1) - 1)} · ${fmt(m.maxHeightM, 1)} m`],
    ['Emprise au sol', m.plotAreaM2 ? `${fmt((100 * (m.footprintAreaM2 ?? 0)) / m.plotAreaM2, 1)} %` : '-'],
    ['COS', m.plotAreaM2 ? fmt((m.gfaM2 ?? 0) / m.plotAreaM2, 2) : '-'],
    ['Surface vendable', `${fmt(y_.sellableM2)} m²`],
    ['Stationnement', `${fmt(m.parkingSpaces)} pl.`],
  ];
  const tw = (515 - 5 * 6) / 6;
  tiles.forEach(([l, v], i) => tile(page, 40 + i * (tw + 6), y - 40, tw, l, v, f, b));
  y -= 58;

  // Compliance
  text(page, `Conformité · ${input.compliance.compliant ? 'toutes les règles bloquantes sont respectées' : 'règles bloquantes non respectées'}`, 40, y, 11, b, input.compliance.compliant ? C.ok : C.bad);
  y -= 6;
  for (const r of input.compliance.results.slice(0, 14)) {
    y -= 15;
    page.drawLine({ start: { x: 40, y: y - 4 }, end: { x: 555, y: y - 4 }, thickness: 0.3, color: C.line });
    const col = r.status === 'pass' ? C.ok : r.status === 'warn' ? C.warn : C.bad;
    page.drawCircle({ x: 46, y: y + 3, size: 3, color: col });
    text(page, r.message_fr.slice(0, 95), 56, y, 8.5, f);
    text(page, `${r.cite.source} ${r.cite.article}`, 500, y, 7.5, f, C.muted);
  }
  y -= 26;

  // Yield
  text(page, 'Bilan promoteur', 40, y, 11, b);
  y -= 8;
  if (y_.complete) {
    const rows: [string, number, RGB][] = [
      ["Chiffre d'affaires", y_.revenue ?? 0, C.accent],
      ['Construction', y_.hardCost ?? 0, C.warn],
      ['Frais annexes', y_.softCost ?? 0, C.warn],
      ['Foncier', y_.landCost ?? 0, C.warn],
      ['Stationnement', y_.parkingCost ?? 0, C.warn],
      ['Marge', y_.margin ?? 0, (y_.margin ?? 0) >= 0 ? C.ok : C.bad],
    ];
    const max = Math.max(1, ...rows.map((r) => Math.abs(r[1])));
    for (const [l, v, col] of rows) {
      y -= 15;
      text(page, l, 40, y, 8.5, f, C.muted);
      page.drawRectangle({ x: 140, y: y - 1, width: Math.max(1, (Math.abs(v) / max) * 300), height: 9, color: col });
      text(page, `${fmt(v)} ${cur}`, 448, y, 8.5, b);
    }
    y -= 16;
    text(page, `Marge sur coût : ${y_.marginOnCost != null ? fmt(100 * y_.marginOnCost, 1) + ' %' : '-'}   ·   Coût total : ${fmt(y_.totalCost)} ${cur}`, 40, y, 9, f);
  } else {
    y -= 14;
    text(page, `Hypothèses de prix et de coûts à saisir (${(y_.missing ?? []).length} manquantes) : aucun prix de marché n'est inventé.`, 40, y, 9, f, C.warn);
  }

  // Footer
  page.drawLine({ start: { x: 40, y: 58 }, end: { x: 555, y: 58 }, thickness: 0.5, color: C.line });
  text(page, input.attribution.slice(0, 160), 40, 46, 6.5, f, C.muted);
  text(page, 'Étude de capacité indicative. Ne remplace ni un relevé, ni un avis réglementaire, ni une étude de marché.', 40, 36, 6.5, f, C.muted);
  return doc.save();
}
