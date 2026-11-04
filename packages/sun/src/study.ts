import { bbox, normalizeRing, pointInRing, type Vec2 } from '@fs/geometry';
import type { BuildResult } from '@fs/recipe';
import { sunPositionsForDay, type DayDate, type SunPosition } from './position.js';
import { makePrism, occluded, type Prism } from './raycast.js';

export type Orientation = 'N' | 'E' | 'S' | 'W';

export interface SamplePoint {
  kind: 'ground' | 'facade';
  pos: [number, number, number];
  /** Outward normal (facade points only). */
  normal?: [number, number, number];
  orientation?: Orientation;
  blockId?: string;
  /** Area represented by the point, m². */
  areaM2: number;
}

export interface ContextPrism {
  id: string;
  ring: Vec2[];
  heightM: number;
}

export interface SunStudyInput {
  build: BuildResult;
  plot: Vec2[];
  context?: ContextPrism[];
  date: DayDate;
  lat: number;
  lon: number;
  tzOffsetH?: number;
  stepMin?: number;
  groundSpacingM?: number;
  facadeSpacingM?: number;
  /** Cap on sample points (ground spacing grows to respect it). */
  maxPoints?: number;
}

export interface SunStudySummary {
  pointCount: number;
  sunPositions: number;
  avgFacadeHoursByOrientation: Partial<Record<Orientation, number>>;
  /** Share of ground samples with < 2 h of direct sun. */
  groundShareUnder2h: number;
  /** Share of façade area with > 6 h of direct sun (overheating risk). */
  facadeShareOver6h: number;
  /** Share of the unbuilt plot in shadow at 12:00 local time. */
  plotShadedAtNoon: number;
  avgFacadeHours: number;
}

export interface SunStudyResult {
  points: SamplePoint[];
  hours: Float32Array;
  summary: SunStudySummary;
}

function orientationOf(nx: number, ny: number): Orientation {
  const az = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;
  if (az >= 315 || az < 45) return 'N';
  if (az < 135) return 'E';
  if (az < 225) return 'S';
  return 'W';
}

export function samplePoints(br: BuildResult, plot: Vec2[], groundSpacing = 2, facadeSpacing = 1): SamplePoint[] {
  const pts: SamplePoint[] = [];
  const ring = normalizeRing(plot);
  const b = bbox(ring);
  for (let x = b.minX + groundSpacing / 2; x < b.maxX; x += groundSpacing) {
    for (let y = b.minY + groundSpacing / 2; y < b.maxY; y += groundSpacing) {
      const p: Vec2 = [x, y];
      if (!pointInRing(p, ring)) continue;
      if (br.blocks.some((bl) => pointInRing(p, bl.footprint))) continue;
      pts.push({ kind: 'ground', pos: [x, y, 0.05], areaM2: groundSpacing * groundSpacing });
    }
  }
  for (const bl of br.blocks) {
    const r = normalizeRing(bl.footprint);
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const c = r[(i + 1) % r.length]!;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 1e-6) continue;
      // CCW ring: outward normal is to the right of the edge direction.
      const nx = (c[1] - a[1]) / len;
      const ny = -(c[0] - a[0]) / len;
      const steps = Math.max(1, Math.round(len / facadeSpacing));
      const segLen = len / steps;
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        const x = a[0] + (c[0] - a[0]) * t + nx * 0.05;
        const y = a[1] + (c[1] - a[1]) * t + ny * 0.05;
        for (const s of bl.storeys) {
          pts.push({
            kind: 'facade',
            pos: [x, y, s.elevationM + s.heightM / 2],
            normal: [nx, ny, 0],
            orientation: orientationOf(nx, ny),
            blockId: bl.id,
            areaM2: segLen * s.heightM,
          });
        }
      }
    }
  }
  return pts;
}

export function buildPrisms(br: BuildResult, context: ContextPrism[] = []): Prism[] {
  return [
    ...br.blocks.filter((b) => b.heightM > 0).map((b) => makePrism(b.id, b.footprint, 0, b.heightM)),
    ...context.map((c) => makePrism(c.id, c.ring, 0, c.heightM)),
  ];
}

function lit(p: SamplePoint, s: SunPosition, prisms: Prism[]): boolean {
  if (p.normal) {
    const dot = p.normal[0] * s.vector[0] + p.normal[1] * s.vector[1];
    if (dot <= 0) return false;
  }
  return !occluded(p.pos, s.vector, prisms);
}

/** Direct-sun hours per sample point across one day. Pure and deterministic. */
export function runSunStudy(input: SunStudyInput): SunStudyResult {
  const step = input.stepMin ?? 15;
  const plot = normalizeRing(input.plot);
  let spacing = input.groundSpacingM ?? 2;
  let points = samplePoints(input.build, plot, spacing, input.facadeSpacingM ?? 1);
  const maxPoints = input.maxPoints ?? 4000;
  while (points.length > maxPoints && spacing < 16) {
    spacing *= 1.5;
    points = samplePoints(input.build, plot, spacing, Math.max(1, spacing / 2));
  }
  const prisms = buildPrisms(input.build, input.context);
  const positions = sunPositionsForDay(input.date, input.lat, input.lon, { stepMin: step, tzOffsetH: input.tzOffsetH ?? 0 });
  const hours = new Float32Array(points.length);
  const dt = step / 60;
  for (let i = 0; i < points.length; i++) {
    let h = 0;
    for (const s of positions) if (lit(points[i]!, s, prisms)) h += dt;
    hours[i] = h;
  }
  const noon = positions.reduce<SunPosition | null>((best, s) => (!best || Math.abs(s.hour - 12) < Math.abs(best.hour - 12) ? s : best), null);
  const ground = points.map((p, i) => ({ p, i })).filter((x) => x.p.kind === 'ground');
  const facade = points.map((p, i) => ({ p, i })).filter((x) => x.p.kind === 'facade');
  const byOri: Partial<Record<Orientation, { h: number; a: number }>> = {};
  let fArea = 0;
  let fOver6 = 0;
  let fHours = 0;
  for (const { p, i } of facade) {
    const o = p.orientation!;
    const acc = (byOri[o] ??= { h: 0, a: 0 });
    acc.h += hours[i]! * p.areaM2;
    acc.a += p.areaM2;
    fArea += p.areaM2;
    fHours += hours[i]! * p.areaM2;
    if (hours[i]! > 6) fOver6 += p.areaM2;
  }
  const avgFacadeHoursByOrientation: SunStudySummary['avgFacadeHoursByOrientation'] = {};
  for (const [o, v] of Object.entries(byOri) as [Orientation, { h: number; a: number }][]) {
    avgFacadeHoursByOrientation[o] = v.a > 0 ? v.h / v.a : 0;
  }
  const shadedNoon = noon ? ground.filter(({ p }) => !lit(p, noon, prisms)).length : ground.length;
  return {
    points,
    hours,
    summary: {
      pointCount: points.length,
      sunPositions: positions.length,
      avgFacadeHoursByOrientation,
      groundShareUnder2h: ground.length ? ground.filter(({ i }) => hours[i]! < 2).length / ground.length : 0,
      facadeShareOver6h: fArea > 0 ? fOver6 / fArea : 0,
      plotShadedAtNoon: ground.length ? shadedNoon / ground.length : 0,
      avgFacadeHours: fArea > 0 ? fHours / fArea : 0,
    },
  };
}
