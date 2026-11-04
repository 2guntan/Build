import { describe, expect, it } from 'vitest';
import { build } from '@fs/builder';
import { makePrism, occluded, runSunStudy, sunPosition } from '../src/index.js';
import { baseRecipe, site } from './helpers.js';

const DAKAR = { lat: 14.7167, lon: -17.4677 };
const june21 = { year: 2026, month: 6, day: 21 };

describe('sun position for Dakar (UTC+0)', () => {
  // Reference values from pysolar 0.13 for Dakar (14.7167 N, 17.4677 W), 2026-06-21, UTC = local time.
  it('21 June 12:00 local matches the reference (az 60.0°, alt 71.0°)', () => {
    const p = sunPosition(june21, 12, DAKAR.lat, DAKAR.lon);
    expect(Math.abs(p.azimuthDeg - 60.0)).toBeLessThan(1);
    expect(Math.abs(p.altitudeDeg - 71.0)).toBeLessThan(1);
  });
  it('21 June 17:00 local matches the reference (az 288.5°, alt 35.7°): shadows point ESE', () => {
    const p = sunPosition(june21, 17, DAKAR.lat, DAKAR.lon);
    expect(Math.abs(p.azimuthDeg - 288.5)).toBeLessThan(1);
    expect(Math.abs(p.altitudeDeg - 35.7)).toBeLessThan(1);
    // Shadow direction = opposite of the horizontal sun vector: towards east-south-east.
    const shadowAz = (p.azimuthDeg + 180) % 360;
    expect(shadowAz).toBeGreaterThan(100);
    expect(shadowAz).toBeLessThan(115);
  });
});

describe('ray casting', () => {
  it('a tall prism to the east blocks a low eastern sun', () => {
    const wall = makePrism('w', [[5, -5], [6, -5], [6, 5], [5, 5]], 0, 20);
    expect(occluded([0, 0, 1], [1, 0, 0.2], [wall])).toBe(true);
    expect(occluded([0, 0, 1], [-1, 0, 0.2], [wall])).toBe(false);
    expect(occluded([0, 0, 1], [1, 0, 10], [wall])).toBe(false); // passes over
  });
});

describe('sun-hours study', () => {
  it('runs 2,000+ points in under 3 s with sensible results', () => {
    const br = build(baseRecipe(), site(60, 50, 5));
    const t0 = performance.now();
    const r = runSunStudy({ build: br, plot: site(60, 50).plot, date: june21, ...DAKAR, groundSpacingM: 1.2, context: [{ id: 'c', ring: [[62, 0], [80, 0], [80, 50], [62, 50]], heightM: 30 }] });
    const ms = performance.now() - t0;
    expect(r.summary.pointCount).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThan(3000);
    expect(r.summary.sunPositions).toBeGreaterThan(40);
    expect(r.summary.avgFacadeHours).toBeGreaterThan(0);
    // In June at 14.7°N the sun is north at noon: north façades get more sun than south ones.
    expect(r.summary.avgFacadeHoursByOrientation.N!).toBeGreaterThan(r.summary.avgFacadeHoursByOrientation.S!);
  });
  it('is deterministic', () => {
    const br = build(baseRecipe(), site(40, 30, 5));
    const a = runSunStudy({ build: br, plot: site().plot, date: june21, ...DAKAR });
    const b = runSunStudy({ build: br, plot: site().plot, date: june21, ...DAKAR });
    expect(Array.from(a.hours)).toEqual(Array.from(b.hours));
  });
});
