import SunCalc from 'suncalc';

export interface SunPosition {
  /** Local clock time at the site, decimal hours. */
  hour: number;
  /** Degrees clockwise from north. */
  azimuthDeg: number;
  altitudeDeg: number;
  /** Unit vector towards the sun in the local frame (x east, y north, z up). */
  vector: [number, number, number];
}

export interface DayDate {
  year: number;
  month: number;
  day: number;
}

/** Sun position for a local clock time. `tzOffsetH` is the site's UTC offset (Africa/Dakar = 0). */
export function sunPosition(
  date: DayDate,
  hour: number,
  lat: number,
  lon: number,
  tzOffsetH = 0,
  northAngleDeg = 0,
): SunPosition {
  const ms = Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0) + (hour - tzOffsetH) * 3600_000;
  const p = SunCalc.getPosition(new Date(ms), lat, lon);
  // suncalc: azimuth from south, positive towards west.
  let az = (p.azimuth * 180) / Math.PI + 180 - northAngleDeg;
  az = ((az % 360) + 360) % 360;
  const alt = (p.altitude * 180) / Math.PI;
  const azr = (az * Math.PI) / 180;
  const altr = p.altitude;
  return {
    hour,
    azimuthDeg: az,
    altitudeDeg: alt,
    vector: [Math.sin(azr) * Math.cos(altr), Math.cos(azr) * Math.cos(altr), Math.sin(altr)],
  };
}

export function sunPositionsForDay(
  date: DayDate,
  lat: number,
  lon: number,
  opts: { stepMin?: number; minAltitudeDeg?: number; tzOffsetH?: number; northAngleDeg?: number } = {},
): SunPosition[] {
  const step = opts.stepMin ?? 15;
  const minAlt = opts.minAltitudeDeg ?? 5;
  const out: SunPosition[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    const p = sunPosition(date, m / 60, lat, lon, opts.tzOffsetH ?? 0, opts.northAngleDeg ?? 0);
    if (p.altitudeDeg > minAlt) out.push(p);
  }
  return out;
}

export const SUN_PRESETS: DayDate[] = [
  { year: 2026, month: 3, day: 21 },
  { year: 2026, month: 6, day: 21 },
  { year: 2026, month: 9, day: 21 },
  { year: 2026, month: 12, day: 21 },
];
