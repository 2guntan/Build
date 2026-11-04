import { fromUrl } from 'geotiff';
import type { GeoJsonPolygon } from '@fs/api-contract';
import type { Config } from '../config.js';

export interface Heightmap {
  /** WGS84 bounds of the grid. */
  bounds: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  /** Row-major elevations in metres, north row first. */
  elevations: number[];
  resolutionM: number;
  source: string;
}

/** Copernicus DEM GLO-30 tile name for the 1°×1° cell containing (lon, lat). */
export function copernicusTileName(lon: number, lat: number): string {
  const la = Math.floor(lat);
  const lo = Math.floor(lon);
  const ns = la >= 0 ? `N${String(la).padStart(2, '0')}` : `S${String(-la).padStart(2, '0')}`;
  const ew = lo >= 0 ? `E${String(lo).padStart(3, '0')}` : `W${String(-lo).padStart(3, '0')}`;
  return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
}

/** Reads the DEM window covering the bbox from the public Cloud-Optimized GeoTIFF. */
export async function loadDemWindow(cfg: Config, bbox: GeoJsonPolygon): Promise<Heightmap> {
  const ring = bbox.coordinates[0]!;
  const xs = ring.map((c) => c[0]!);
  const ys = ring.map((c) => c[1]!);
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);
  const name = copernicusTileName((west + east) / 2, (south + north) / 2);
  const url = cfg.DEM_URL_TEMPLATE.replaceAll('{name}', name);
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin() as [number, number];
  const [rx, ry] = image.getResolution() as [number, number];
  const x0 = Math.max(0, Math.floor((west - ox) / rx));
  const x1 = Math.min(image.getWidth(), Math.ceil((east - ox) / rx));
  const y0 = Math.max(0, Math.floor((north - oy) / ry));
  const y1 = Math.min(image.getHeight(), Math.ceil((south - oy) / ry));
  const rasters = await image.readRasters({ window: [x0, y0, x1, y1] });
  const band = rasters[0] as unknown as ArrayLike<number>;
  return {
    bounds: { west: ox + x0 * rx, north: oy + y0 * ry, east: ox + x1 * rx, south: oy + y1 * ry },
    width: x1 - x0,
    height: y1 - y0,
    elevations: Array.from(band, (v) => Math.round(v * 10) / 10),
    resolutionM: 30,
    source: 'Copernicus DEM GLO-30',
  };
}
