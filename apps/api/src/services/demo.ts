import { eq } from 'drizzle-orm';
import { LocalFrame, type Vec2 } from '@fs/geometry';
import { findZone, RuleSet } from '@fs/rules';
import { solve } from '@fs/solver';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { contextBuilding, designOption, plot, project, ruleSet } from '../db/schema.js';
import { createOption, saveVersion } from './options.js';

/** Plot centre: Dakar Plateau. The plot is 38 × 30 m, front on the south street. */
const CENTER = { lon: -17.4415, lat: 14.6705 };
export const DEMO_SOURCE = 'demo-synthetic';

/** Deterministic 0..1 noise from integers. */
function rnd(a: number, b: number, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const rect = (x: number, y: number, w: number, d: number): Vec2[] => [
  [x, y],
  [x + w, y],
  [x + w, y + d],
  [x, y + d],
];

/**
 * Synthetic neighbourhood (clearly labelled as such): city blocks of 60 × 50 m split by 14 m streets,
 * each split into 3–5 buildings of 2–10 storeys. Only used by the demo project.
 */
export function syntheticNeighbourhood(): { ring: Vec2[]; heightM: number }[] {
  const out: { ring: Vec2[]; heightM: number }[] = [];
  const bw = 60;
  const bd = 50;
  const street = 14;
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const x0 = i * (bw + street) - bw / 2;
      const y0 = j * (bd + street) - bd / 2;
      const parts = 3 + Math.floor(rnd(i, j) * 3);
      let x = x0;
      for (let k = 0; k < parts; k++) {
        const w = k === parts - 1 ? x0 + bw - x : (bw / parts) * (0.8 + rnd(i, j, k) * 0.4);
        for (const [y, d] of [
          [y0, bd * 0.45],
          [y0 + bd * 0.55, bd * 0.45],
        ] as const) {
          if (i === 0 && j === 0) continue; // the demo plot's own city block stays free around the plot
          const storeys = 2 + Math.floor(rnd(i * 7 + k, j * 3 + y) * 9);
          const inset = 1 + rnd(k, i, j) * 2;
          out.push({ ring: rect(x + inset, y + inset, Math.max(6, w - 2 * inset), Math.max(6, d - 2 * inset)), heightM: storeys * 3.2 });
        }
        x += w;
      }
    }
  }
  // Neighbours inside the plot's own city block, leaving the plot free.
  out.push({ ring: rect(-30, -25, 9, 22), heightM: 9.6 }, { ring: rect(21, -25, 9, 22), heightM: 16 }, { ring: rect(-30, 6, 60, 19), heightM: 22.4 });
  return out;
}

export async function createDemoProject(db: Db, cfg: Config, a: { orgId: string; userId: string; locale: 'fr' | 'en' }) {
  const [rs] = await db.select().from(ruleSet).where(eq(ruleSet.jurisdictionId, 'sn-dakar'));
  const frame = new LocalFrame(CENTER);
  const toLonLat = (p: Vec2) => frame.toLonLat(p[0], p[1]) as [number, number];
  const plotLocal = rect(-19, -24, 38, 30);
  const [p] = await db
    .insert(project)
    .values({
      orgId: a.orgId,
      name: a.locale === 'en' ? 'Demo — Plateau, Dakar' : 'Démo — Plateau, Dakar',
      jurisdictionId: 'sn-dakar',
      ruleSetId: rs?.id ?? null,
      locale: a.locale,
      createdBy: a.userId,
    })
    .returning();
  const ring = plotLocal.map(toLonLat);
  const c = frame.toLonLat(0, -9);
  await db.insert(plot).values({
    projectId: p!.id,
    geom: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
    zoneId: 'test-c',
    edgeClasses: ['front', 'side', 'rear', 'side'],
    originLon: c[0],
    originLat: c[1],
    crs: 'EPSG:32628',
    source: 'drawn',
  });
  const buildings = syntheticNeighbourhood();
  for (let i = 0; i < buildings.length; i += 200) {
    await db.insert(contextBuilding).values(
      buildings.slice(i, i + 200).map((b) => {
        const r = b.ring.map(toLonLat);
        return { projectId: p!.id, geom: { type: 'Polygon' as const, coordinates: [[...r, r[0]!]] }, heightM: b.heightM, heightSource: 'default' as const, dataSource: DEMO_SOURCE };
      }),
    );
  }
  // Option A: the starter; options B and C: the solver's best two layouts.
  const optA = await createOption(db, cfg, { projectId: p!.id, name: 'Option A', ruleSetId: rs?.id ?? null, userId: a.userId });
  if (rs) {
    const zone = findZone(RuleSet.parse(rs.content), 'test-c');
    const [pl] = await db.select().from(plot).where(eq(plot.projectId, p!.id));
    const f2 = new LocalFrame({ lon: pl!.originLon, lat: pl!.originLat });
    const local = ring.map(([lon, lat]) => f2.toLocal(lon, lat));
    const res = solve({
      intent: { targetUse: 'mixed' },
      plot: local,
      edgeClasses: ['front', 'side', 'rear', 'side'],
      zone,
      base: { optionId: optA.id, origin: { lon: pl!.originLon, lat: pl!.originLat, crs: 'EPSG:32628' }, plotRef: pl!.id },
    });
    for (const [i, cand] of res.candidates.slice(0, 2).entries()) {
      const [o] = await db.insert(designOption).values({ projectId: p!.id, name: `Option ${'BC'[i]}`, ruleSetId: rs.id }).returning();
      await saveVersion(db, cfg, { optionId: o!.id, recipe: { ...cand.recipe, optionId: o!.id }, authorKind: 'user', authorId: a.userId, summary: `Solveur : ${cand.template}` });
    }
  }
  return p!;
}
