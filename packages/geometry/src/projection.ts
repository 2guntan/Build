import type { Vec2 } from './polygon.js';

/**
 * WGS84 ↔ UTM (transverse Mercator, Krüger series). Accurate to well under a
 * millimetre within a zone, which is enough for plot-scale measurement.
 */
const a = 6378137;
const f = 1 / 298.257223563;
const k0 = 0.9996;
const n = f / (2 - f);
const A = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64);
const alpha = [
  n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3,
  (13 / 48) * n ** 2 - (3 / 5) * n ** 3,
  (61 / 240) * n ** 3,
];
const beta = [
  n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3,
  (1 / 48) * n ** 2 + (1 / 15) * n ** 3,
  (17 / 480) * n ** 3,
];
const delta = [
  2 * n - (2 / 3) * n ** 2 - 2 * n ** 3,
  (7 / 3) * n ** 2 - (8 / 5) * n ** 3,
  (56 / 15) * n ** 3,
];

const rad = Math.PI / 180;

export interface UtmZone {
  zone: number;
  north: boolean;
}

export function utmZoneFor(lon: number, lat: number): UtmZone {
  return { zone: Math.floor((lon + 180) / 6) + 1, north: lat >= 0 };
}

export function epsgForZone(z: UtmZone): number {
  return (z.north ? 32600 : 32700) + z.zone;
}

export function zoneFromEpsg(epsg: number): UtmZone {
  if (epsg > 32600 && epsg <= 32660) return { zone: epsg - 32600, north: true };
  if (epsg > 32700 && epsg <= 32760) return { zone: epsg - 32700, north: false };
  throw new Error(`Unsupported CRS EPSG:${epsg}`);
}

export function lonLatToUtm(lon: number, lat: number, z: UtmZone): Vec2 {
  const lon0 = ((z.zone - 1) * 6 - 180 + 3) * rad;
  const phi = lat * rad;
  const lam = lon * rad - lon0;
  const e2 = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e2 * Math.atanh(e2 * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam));
  const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let E = eta;
  let N = xi;
  for (let j = 1; j <= 3; j++) {
    const al = alpha[j - 1]!;
    E += al * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    N += al * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  const x = 500000 + k0 * A * E;
  const y = (z.north ? 0 : 10000000) + k0 * A * N;
  return [x, y];
}

export function utmToLonLat(x: number, y: number, z: UtmZone): Vec2 {
  const lon0 = ((z.zone - 1) * 6 - 180 + 3) * rad;
  const xi = (y - (z.north ? 0 : 10000000)) / (k0 * A);
  const eta = (x - 500000) / (k0 * A);
  let xp = xi;
  let ep = eta;
  for (let j = 1; j <= 3; j++) {
    const b = beta[j - 1]!;
    xp -= b * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    ep -= b * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += delta[j - 1]! * Math.sin(2 * j * chi);
  const lam = Math.atan2(Math.sinh(ep), Math.cos(xp));
  return [(lon0 + lam) / rad, phi / rad];
}

/** Converts between WGS84 and the project's local frame (metres from the origin). */
export class LocalFrame {
  readonly zone: UtmZone;
  private readonly ox: number;
  private readonly oy: number;
  constructor(
    readonly origin: { lon: number; lat: number },
    epsg?: number,
  ) {
    this.zone = epsg ? zoneFromEpsg(epsg) : utmZoneFor(origin.lon, origin.lat);
    [this.ox, this.oy] = lonLatToUtm(origin.lon, origin.lat, this.zone);
  }
  get originUtm(): Vec2 {
    return [this.ox, this.oy];
  }
  toLocal(lon: number, lat: number): Vec2 {
    const [x, y] = lonLatToUtm(lon, lat, this.zone);
    return [x - this.ox, y - this.oy];
  }
  toLonLat(x: number, y: number): Vec2 {
    return utmToLonLat(x + this.ox, y + this.oy, this.zone);
  }
}
