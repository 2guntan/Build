import { and, eq, sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { contextBuilding, plot, siteImport, terrainTile } from '../db/schema.js';
import { ewkbHexToPolygon } from '../db/geometry.js';
import type { Storage } from './storage.js';
import { loadDemWindow } from './terrain.js';

export const DEFAULT_HEIGHT_M = 6; // 2 storeys × 3 m
export const BUFFER_M = 300;

/**
 * site.import job: copies context buildings from the regional extract (ref_building)
 * within 300 m of the plot, de-duplicates across sources (IoU > 0.5 → keep the
 * higher-priority source) and clips the DEM. Never calls a remote building API.
 */
export async function runSiteImport(db: Db, cfg: Config, storage: Storage, importId: string): Promise<void> {
  const [imp] = await db.select().from(siteImport).where(eq(siteImport.id, importId));
  if (!imp) return;
  await db.update(siteImport).set({ status: 'running' }).where(eq(siteImport.id, importId));
  try {
    const [pl] = await db.select().from(plot).where(eq(plot.projectId, imp.projectId));
    if (!pl) throw new Error('Project has no plot');
    await db.delete(contextBuilding).where(and(eq(contextBuilding.projectId, imp.projectId), sql`${contextBuilding.heightSource} <> 'user'`));
    const inserted = await db.execute(sql`
      WITH area AS (
        SELECT ST_Transform(ST_Buffer(ST_Transform(geom, 32628), ${BUFFER_M}), 4326) AS g, geom AS plot_geom
        FROM plot WHERE id = ${pl.id}
      ),
      cand AS (
        SELECT rb.* FROM ref_building rb, area
        WHERE ST_Intersects(rb.geom, area.g)
          AND NOT ST_Within(ST_Centroid(rb.geom), area.plot_geom)
      ),
      kept AS (
        SELECT c.* FROM cand c
        WHERE NOT EXISTS (
          SELECT 1 FROM cand o
          WHERE o.id <> c.id
            AND (o.priority < c.priority OR (o.priority = c.priority AND o.id < c.id))
            AND ST_Intersects(o.geom, c.geom)
            AND ST_Area(ST_Intersection(o.geom, c.geom)) / NULLIF(ST_Area(ST_Union(o.geom, c.geom)), 0) > 0.5
        )
      )
      INSERT INTO context_building (id, project_id, geom, height_m, height_source, data_source, confidence)
      SELECT 'cb_' || substr(md5(${imp.projectId} || kept.id), 1, 16), ${imp.projectId}, ST_SimplifyPreserveTopology(kept.geom, 0.000003),
             COALESCE(kept.height_m, ${DEFAULT_HEIGHT_M}), kept.height_source, kept.data_source, kept.confidence
      FROM kept
      ON CONFLICT (id) DO NOTHING
      RETURNING id`);
    let terrain: string = 'skipped';
    try {
      const [bb] = await db.execute<{ bbox: string }>(sql`
        SELECT ST_Envelope(ST_Transform(ST_Buffer(ST_Transform(geom, 32628), ${BUFFER_M}), 4326)) AS bbox FROM plot WHERE id = ${pl.id}`).then((r) => r.rows);
      const bbox = ewkbHexToPolygon(bb!.bbox);
      const dem = await loadDemWindow(cfg, bbox);
      const key = `terrain/${imp.projectId}/${importId}.json`;
      await storage.put(key, JSON.stringify(dem), 'application/json');
      await db.delete(terrainTile).where(eq(terrainTile.projectId, imp.projectId));
      await db.insert(terrainTile).values({ projectId: imp.projectId, bbox, storageKey: key, resolutionM: dem.resolutionM });
      terrain = 'loaded';
    } catch (e) {
      terrain = `unavailable: ${e instanceof Error ? e.message : String(e)}`;
    }
    await db
      .update(siteImport)
      .set({ status: 'done', stats: { buildings: inserted.rowCount ?? inserted.rows.length, terrain }, finishedAt: new Date() })
      .where(eq(siteImport.id, importId));
  } catch (e) {
    await db
      .update(siteImport)
      .set({ status: 'failed', error: e instanceof Error ? e.message : String(e), finishedAt: new Date() })
      .where(eq(siteImport.id, importId));
  }
}
