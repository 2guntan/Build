import { bbox } from '@fs/geometry';

/** Plan thumbnail of the plot (and buildable area) as SVG, north up. */
export function PlotThumbnail({ plot, buildable, blocks = [] }: { plot: [number, number][]; buildable?: [number, number][] | null; blocks?: { ring: [number, number][]; color: string }[] }) {
  if (plot.length < 3) return null;
  const b = bbox(plot);
  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08;
  const vb = `${b.minX - pad} ${-b.maxY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`;
  const pts = (r: [number, number][]) => r.map((p) => `${p[0]},${-p[1]}`).join(' ');
  return (
    <svg viewBox={vb} className="h-full w-full" role="img" aria-label="plot">
      <polygon points={pts(plot)} fill="#d9e7e3" stroke="#0f172a" strokeWidth={pad / 6} />
      {buildable && <polygon points={pts(buildable)} fill="none" stroke="#0f766e" strokeDasharray={`${pad / 3} ${pad / 5}`} strokeWidth={pad / 8} />}
      {blocks.map((bl, i) => (
        <polygon key={i} points={pts(bl.ring)} fill={bl.color} opacity={0.85} />
      ))}
    </svg>
  );
}
