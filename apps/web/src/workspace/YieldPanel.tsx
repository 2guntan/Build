import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDesignStore } from '../state/design-store';
import { USE_COLORS } from '../viewport/colors';
import { m2, money, num, pct } from '../lib/format';

export function YieldPanel({ projectId, currency }: { projectId: string; currency: string }) {
  const { t } = useTranslation();
  const y = useDesignStore((s) => s.yield);
  if (!y) return null;
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between py-1 text-xs ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
  const totalGfa = Object.values(y.gfaByUse).reduce((a, b) => a + (b ?? 0), 0) || 1;
  return (
    <div className="space-y-3 p-3">
      <div>
        <div className="mb-1 flex h-3 overflow-hidden rounded">
          {Object.entries(y.gfaByUse).map(([u, v]) => (
            <span key={u} style={{ width: `${(100 * (v ?? 0)) / totalGfa}%`, background: USE_COLORS[u] }} title={t(`use.${u}`)} />
          ))}
        </div>
        {Object.entries(y.gfaByUse).map(([u, v]) => row(`${t('yield.gfa')} ${t(`use.${u}`)}`, m2(v)))}
        {row(t('yield.sellable'), m2(y.sellableM2), true)}
        {row(t('yield.units'), y.unitCount === null ? '–' : num(y.unitCount))}
      </div>
      {!y.complete && (
        <div className="rounded-md bg-amber-50 p-2 text-xs text-warn">
          <p>{t('yield.enterPrices')}</p>
          <p className="mt-1">{t('yield.missing', { list: y.missing.join(', ') })}</p>
          <Link to={`/projects/${projectId}/settings`} className="mt-1 inline-block underline">{t('workspace.settings')}</Link>
        </div>
      )}
      <div className="divide-y divide-line">
        {row(t('yield.revenue'), money(y.revenue, currency))}
        {row(t('yield.hardCost'), money(y.hardCost, currency))}
        {row(t('yield.softCost'), money(y.softCost, currency))}
        {row(t('yield.land'), money(y.landCost, currency))}
        {row(t('yield.parking'), money(y.parkingCost, currency))}
        {row(t('yield.totalCost'), money(y.totalCost, currency), true)}
        {row(t('yield.margin'), money(y.margin, currency), true)}
        {row(t('yield.marginOnCost'), pct(y.marginOnCost))}
        {row(t('yield.costPerM2'), money(y.costPerSellableM2, currency))}
      </div>
    </div>
  );
}
