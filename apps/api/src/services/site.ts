import { area, centroid, dist, LocalFrame, normalizeRing, signedArea, isSimple, type Vec2 } from '@fs/geometry';
import type { GeoJsonPolygon, PlotSummary } from '@fs/api-contract';
import type { EdgeClass, SiteInput } from '@fs/recipe';
import { buildableArea, type Zone } from '@fs/rules';
import { ProblemError } from '../http/problem.js';

export interface PlotRow {
  id: string;
  geom: GeoJsonPolygon;
  zoneId: string | null;
  edgeClasses: EdgeClass[];
  areaM2: number | null;
  originLon: number;
  originLat: number;
  crs: string;
  source: 'drawn' | 'imported';
}

/** Outer ring of a GeoJSON polygon, CCW in lon/lat, without closing vertex. */
export function outerRingLonLat(g: GeoJsonPolygon): Vec2[] {
  const ring = (g.coordinates[0] ?? []).map((c) => [c[0]!, c[1]!] as Vec2);
  return normalizeRing(ring);
}

export function validatePlotGeoJson(g: GeoJsonPolygon): { ring: Vec2[]; origin: { lon: number; lat: number } } {
  const ring = outerRingLonLat(g);
  if (ring.length < 3) throw new ProblemError('PLOT_INVALID', 'A plot needs at least 3 vertices');
  if (ring.length > 200) throw new ProblemError('PLOT_INVALID', 'A plot may have at most 200 vertices');
  for (const [lon, lat] of ring) {
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) {
      throw new ProblemError('PLOT_INVALID', 'Coordinates must be WGS84 lon/lat');
    }
  }
  const c = centroid(ring);
  const frame = new LocalFrame({ lon: c[0], lat: c[1] });
  const local = ring.map(([lon, lat]) => frame.toLocal(lon, lat));
  if (!isSimple(local)) throw new ProblemError('PLOT_INVALID', 'The plot boundary self-intersects');
  const a = area(local);
  if (a < 20) throw new ProblemError('PLOT_INVALID', 'The plot is smaller than 20 m²');
  if (a > 500_000) throw new ProblemError('PLOT_INVALID', 'The plot is larger than 50 ha');
  return { ring, origin: { lon: c[0], lat: c[1] } };
}

export function frameFor(p: Pick<PlotRow, 'originLon' | 'originLat' | 'crs'>): LocalFrame {
  return new LocalFrame({ lon: p.originLon, lat: p.originLat }, Number(p.crs.split(':')[1]));
}

export function localRing(p: PlotRow): Vec2[] {
  const f = frameFor(p);
  const ring = outerRingLonLat(p.geom).map(([lon, lat]) => f.toLocal(lon, lat));
  // Projection preserves orientation, but normalize defensively.
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

export function edgeClassesFor(p: PlotRow, n: number): EdgeClass[] {
  const ec = p.edgeClasses.length === n ? p.edgeClasses : [];
  return Array.from({ length: n }, (_, i) => ec[i] ?? (i === 0 ? 'front' : 'side'));
}

export function siteInput(p: PlotRow, zone: Zone | null): SiteInput {
  const plot = localRing(p);
  const edgeClasses = edgeClassesFor(p, plot.length);
  const buildable = zone ? (buildableArea(plot, edgeClasses, zone) ?? plot) : plot;
  return { plot, edgeClasses, buildable };
}

export function plotSummary(p: PlotRow, zone: Zone | null): PlotSummary {
  const s = siteInput(p, zone);
  return {
    id: p.id,
    geom: p.geom,
    zoneId: p.zoneId,
    edgeClasses: s.edgeClasses,
    areaM2: p.areaM2 ?? area(s.plot),
    source: p.source,
    local: s.plot.map((v) => [v[0], v[1]] as [number, number]),
    buildable: zone ? s.buildable.map((v) => [v[0], v[1]] as [number, number]) : null,
    edges: s.plot.map((a, i) => ({
      index: i,
      lengthM: dist(a, s.plot[(i + 1) % s.plot.length]!),
      class: s.edgeClasses[i]!,
    })),
    origin: { lon: p.originLon, lat: p.originLat, crs: p.crs },
  };
}
