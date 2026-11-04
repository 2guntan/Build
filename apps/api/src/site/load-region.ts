/**
 * One-off loader for the regional building extract (ref_building). Project imports
 * copy from this table with a spatial query, never from a live API per request.
 *
 *   pnpm load:region -- --osm                                  # OSM buildings via Overpass (Dakar bbox)
 *   pnpm load:region -- --geojson open-buildings.geojson --source google-open-buildings --priority 1
 *   pnpm load:region -- --geojson overture.geojson --source overture --priority 2
 *
 * Priority: lower wins when footprints overlap (IoU > 0.5) at project import time.
 * Licences: Open Buildings CC BY 4.0 / ODbL (check the release), Overture (per theme), OSM ODbL.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadConfig } from '../config.js';

/** Dakar region (Cap-Vert peninsula), lon/lat. */
export const DAKAR_BBOX = { south: 14.64, west: -17.55, north: 14.86, east: -17.12 };

export interface RefBuilding {
  sourceId: string;
  ring: [number, number][];
  heightM: number | null;
  heightSource: 'measured' | 'estimated' | 'default';
  confidence: number | null;
}

/** Height from OSM-style tags: `height` is measured, `building:levels` × 3 m is estimated. */
export function heightFromTags(tags: Record<string, unknown>): { heightM: number | null; heightSource: RefBuilding['heightSource'] } {
  const h = Number.parseFloat(String(tags.height ?? '').replace(',', '.'));
  if (Number.isFinite(h) && h > 0 && h < 400) return { heightM: h, heightSource: 'measured' };
  const lv = Number.parseFloat(String(tags['building:levels'] ?? tags.num_floors ?? ''));
  if (Number.isFinite(lv) && lv > 0 && lv < 120) return { heightM: lv * 3, heightSource: 'estimated' };
  return { heightM: null, heightSource: 'default' };
}

export function fromGeoJson(fc: { features: { id?: unknown; properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }[] }): RefBuilding[] {
  const out: RefBuilding[] = [];
  fc.features.forEach((f, i) => {
    const g = f.geometry;
    if (!g) return;
    const ring = g.type === 'Polygon' ? (g.coordinates as number[][][])[0] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][])[0]?.[0] : null;
    if (!ring || ring.length < 4) return;
    const props = f.properties ?? {};
    const est = Number(props.height ?? props.height_m ?? NaN);
    const hs = Number.isFinite(est) && est > 0 ? { heightM: est, heightSource: (props.height_source as RefBuilding['heightSource']) ?? 'estimated' } : heightFromTags(props);
    out.push({
      sourceId: String(f.id ?? props.id ?? props.full_plus_code ?? i),
      ring: ring.map((c) => [c[0]!, c[1]!]),
      ...hs,
      confidence: props.confidence !== undefined ? Number(props.confidence) : null,
    });
  });
  return out;
}

async function fromOverpass(b = DAKAR_BBOX): Promise<RefBuilding[]> {
  const q = `[out:json][timeout:180];way["building"](${b.south},${b.west},${b.north},${b.east});out geom tags;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }) });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const j = (await res.json()) as { elements: { id: number; geometry?: { lon: number; lat: number }[]; tags?: Record<string, string> }[] };
  return j.elements
    .filter((e) => e.geometry && e.geometry.length >= 4)
    .map((e) => ({ sourceId: `way/${e.id}`, ring: e.geometry!.map((p) => [p.lon, p.lat] as [number, number]), ...heightFromTags(e.tags ?? {}), confidence: null }));
}

function ewkt(ring: [number, number][]) {
  const r = [...ring];
  const f = r[0]!;
  const l = r[r.length - 1]!;
  if (f[0] !== l[0] || f[1] !== l[1]) r.push(f);
  return `SRID=4326;POLYGON((${r.map((c) => `${c[0]} ${c[1]}`).join(',')}))`;
}

export async function insertRef(pool: pg.Pool, rows: RefBuilding[], source: string, priority: number) {
  await pool.query('DELETE FROM ref_building WHERE data_source = $1', [source]);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values: unknown[] = [];
    const tuples = chunk.map((r, k) => {
      const o = k * 7;
      values.push(`rb_${source.slice(0, 6)}_${i + k}_${r.sourceId}`.slice(0, 64), ewkt(r.ring), r.heightM, r.heightSource, source, r.confidence, r.sourceId);
      return `($${o + 1}, ST_MakeValid($${o + 2}::geometry), $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, ${priority})`;
    });
    await pool.query(
      `INSERT INTO ref_building (id, geom, height_m, height_source, data_source, confidence, source_id, priority) VALUES ${tuples.join(',')} ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }
}

export async function main(argv: string[]) {
  const cfg = loadConfig();
  const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL });
  try {
    if (argv.includes('--osm')) {
      const rows = await fromOverpass();
      await insertRef(pool, rows, 'osm', 3);
      console.log(`OSM: ${rows.length} buildings`);
    }
    const gi = argv.indexOf('--geojson');
    if (gi >= 0) {
      const file = argv[gi + 1]!;
      const source = argv[argv.indexOf('--source') + 1] ?? 'geojson';
      const priority = Number(argv[argv.indexOf('--priority') + 1] ?? 2);
      const rows = fromGeoJson(JSON.parse(readFileSync(file, 'utf8')));
      await insertRef(pool, rows, source, priority);
      console.log(`${source}: ${rows.length} buildings (priority ${priority})`);
    }
  } finally {
    await pool.end();
  }
}
