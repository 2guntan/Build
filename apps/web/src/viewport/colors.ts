/** One colour per use, shared by the 3D view, charts and legends. */
export const USE_COLORS: Record<string, string> = {
  retail: '#f59e0b',
  residential: '#0f766e',
  office: '#2563eb',
  hotel: '#9333ea',
  amenity: '#db2777',
  parking: '#64748b',
  unassigned: '#a3a3a3',
};

export const CONTEXT_COLOR = '#b8b8b8';
export const PLOT_COLOR = '#0f172a';
export const BUILDABLE_COLOR = '#0f766e';
export const SELECT_COLOR = '#facc15';

/** Sun-hours ramp: 0 h → dark blue, 12 h → yellow. */
export function sunRamp(hours: number, max = 12): [number, number, number] {
  const t = Math.max(0, Math.min(1, hours / max));
  const stops: [number, number, number][] = [
    [0.12, 0.16, 0.45],
    [0.15, 0.55, 0.6],
    [0.95, 0.8, 0.2],
    [0.98, 0.45, 0.1],
  ];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
