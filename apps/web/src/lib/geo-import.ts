/** Pure parsers for plot files. Run inside a worker (sandboxed from the page). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type LonLat = [number, number];

export class ImportError extends Error {}

function firstPolygonFromGeoJson(g: unknown): LonLat[] | null {
  if (!g || typeof g !== 'object') return null;
  const o = g as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] };
  switch (o.type) {
    case 'FeatureCollection':
      for (const f of o.features ?? []) {
        const r = firstPolygonFromGeoJson(f);
        if (r) return r;
      }
      return null;
    case 'Feature':
      return firstPolygonFromGeoJson(o.geometry);
    case 'GeometryCollection':
      for (const f of o.geometries ?? []) {
        const r = firstPolygonFromGeoJson(f);
        if (r) return r;
      }
      return null;
    case 'Polygon':
      return ((o.coordinates as number[][][])[0] ?? []).map((c) => [Number(c[0]), Number(c[1])] as LonLat);
    case 'MultiPolygon':
      return ((o.coordinates as number[][][][])[0]?.[0] ?? []).map((c) => [Number(c[0]), Number(c[1])] as LonLat);
    default:
      return null;
  }
}

/** Extracts the first polygon's outer ring from KML text without a DOM (works in workers). */
function firstPolygonFromKml(text: string): LonLat[] | null {
  const poly = /<Polygon[\s\S]*?<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(text);
  if (!poly) return null;
  return poly[1]!
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((c) => c.length >= 2 && c.every((v) => Number.isFinite(v)))
    .map((c) => [c[0]!, c[1]!] as LonLat);
}

export function parsePlotFile(name: string, text: string): LonLat[] {
  if (text.length > MAX_UPLOAD_BYTES) throw new ImportError('File too large');
  let ring: LonLat[] | null;
  if (/\.kml$/i.test(name) || /^\s*<\?xml|<kml/i.test(text)) {
    ring = firstPolygonFromKml(text);
  } else {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ImportError('Invalid JSON');
    }
    ring = firstPolygonFromGeoJson(json);
  }
  if (!ring || ring.length < 3) throw new ImportError('No polygon found');
  for (const [lon, lat] of ring) {
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) throw new ImportError('Coordinates must be WGS84 lon/lat');
  }
  const f = ring[0]!;
  const l = ring[ring.length - 1]!;
  if (f[0] === l[0] && f[1] === l[1]) ring = ring.slice(0, -1);
  if (ring.length > 200) throw new ImportError('Too many vertices (max 200)');
  return ring;
}
