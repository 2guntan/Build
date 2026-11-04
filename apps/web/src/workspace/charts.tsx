import { useTranslation } from 'react-i18next';
import { USE_COLORS } from '../viewport/colors';
import { money, num, pct } from '../lib/format';

/** Revenue → costs → margin waterfall (SVG, no chart library). */
export function Waterfall({ items, currency }: { items: { label: string; value: number; kind: 'total' | 'minus' | 'result' }[]; currency: string }) {
  const W = 290;
  const rowH = 22;
  const labelW = 92;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)), items.reduce((a, i) => (i.kind === 'total' ? a + i.value : a), 0));
  const scale = (W - labelW - 8) / max;
  let run = 0;
  return (
    <svg viewBox={`0 0 ${W} ${items.length * rowH + 4}`} className="w-full" role="img" aria-label="waterfall">
      {items.map((it, i) => {
        let x0: number;
        let x1: number;
        if (it.kind === 'total') {
          x0 = 0;
          x1 = it.value;
          run = it.value;
        } else if (it.kind === 'minus') {
          x0 = run - it.value;
          x1 = run;
          run -= it.value;
        } else {
          x0 = Math.min(0, it.value);
          x1 = Math.max(0, it.value);
        }
        const color = it.kind === 'total' ? '#0f766e' : it.kind === 'minus' ? '#f59e0b' : it.value >= 0 ? '#15803d' : '#b91c1c';
        const y = i * rowH + 2;
        return (
          <g key={it.label}>
            <text x={0} y={y + 14} fontSize="10" fill="currentColor" opacity={0.75}>{it.label}</text>
            <rect x={labelW + Math.max(0, x0) * scale} y={y + 3} width={Math.max(1.5, (x1 - x0) * scale)} height={rowH - 8} rx={2} fill={color} />
            <title>{money(it.value, currency)}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut of GFA by use. */
export function Donut({ parts }: { parts: { use: string; value: number }[] }) {
  const { t } = useTranslation();
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let a0 = -Math.PI / 2;
  const r = 34;
  const arcs = parts.map((p) => {
    const a1 = a0 + (2 * Math.PI * p.value) / total;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${Math.cos(a0) * r} ${Math.sin(a0) * r} A ${r} ${r} 0 ${large} 1 ${Math.cos(a1 - 1e-6) * r} ${Math.sin(a1 - 1e-6) * r}`;
    a0 = a1;
    return { ...p, d };
  });
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="-45 -45 90 90" className="h-24 w-24 shrink-0" role="img" aria-label="GFA by use">
        {arcs.map((a) => <path key={a.use} d={a.d} fill="none" stroke={USE_COLORS[a.use]} strokeWidth={14} />)}
        <text textAnchor="middle" y={4} fontSize="11" fontWeight="600" fill="currentColor">{num(total)} m²</text>
      </svg>
      <ul className="space-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.use} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: USE_COLORS[p.use] }} />
            <span>{t(`use.${p.use}`)}</span>
            <span className="tabular-nums text-muted">{pct(p.value / total, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Margin under ±10 % sale price and construction cost (land and parking fixed). */
export function Sensitivity({ revenue, buildCosts, fixed, currency }: { revenue: number; buildCosts: number; fixed: number; currency: string }) {
  const { t } = useTranslation();
  const steps = [-0.1, 0, 0.1];
  const base = revenue - buildCosts - fixed;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-muted">
          <th className="p-1 text-left font-normal">{t('yield.priceVsCost')}</th>
          {steps.map((c) => <th key={c} className="p-1 text-right font-normal">{c === 0 ? t('yield.costBase') : `${c > 0 ? '+' : ''}${c * 100} %`}</th>)}
        </tr>
      </thead>
      <tbody>
        {steps.map((p) => (
          <tr key={p}>
            <td className="p-1 text-muted">{p === 0 ? t('yield.priceBase') : `${p > 0 ? '+' : ''}${p * 100} %`}</td>
            {steps.map((c) => {
              const m = revenue * (1 + p) - buildCosts * (1 + c) - fixed;
              const tone = m < 0 ? 'text-bad' : m < base ? 'text-warn' : 'text-ok';
              return (
                <td key={c} className={`p-1 text-right tabular-nums ${p === 0 && c === 0 ? 'font-semibold' : ''} ${tone}`} title={money(m, currency)}>
                  {money(m, currency).replace(/\s?XOF|F\s?CFA/, '')}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
