import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { useDesignStore } from '../state/design-store';
import { m2, money, num, pct } from '../lib/format';
import { Stat } from '../components/ui';
import { Donut, Sensitivity, Waterfall } from './charts';

export function YieldPanel({ projectId, currency }: { projectId: string; currency: string }) {
  const { t } = useTranslation();
  const y = useDesignStore((s) => s.yield);
  if (!y) return null;
  const row = (label: string, v: string, strong = false) => (
    <div key={label} className={`flex justify-between py-1 text-xs ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
  const cash = (v: number | null) => (y.complete ? money(v, currency) : '–');
  const parts = Object.entries(y.gfaByUse)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([use, value]) => ({ use, value: value ?? 0 }));
  return (
    <div className="space-y-4 p-3">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted">{t('yield.areas')}</h3>
        <Donut parts={parts} />
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t('yield.sellable')} value={m2(y.sellableM2)} />
          <Stat label={t('yield.units')} value={y.unitCount === null ? '–' : num(y.unitCount)} />
        </div>
      </section>

      {!y.complete ? (
        <div className="space-y-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs">
          <p className="font-medium text-warn">{t('yield.enterPrices')}</p>
          <p className="text-muted">{t('yield.missing', { list: y.missing.map((m) => t(`yield.key.${m.split('.')[0]}`, { defaultValue: m })).filter((v, i, a) => a.indexOf(v) === i).join(', ') })}</p>
          <Link to={`/projects/${projectId}/settings`} className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-medium text-accent-ink"><Settings2 size={13} /> {t('yield.enterNow')}</Link>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('yield.margin')} value={<span className={y.margin < 0 ? 'text-bad' : 'text-ok'}>{money(y.margin, currency)}</span>} />
              <Stat label={t('yield.marginOnCost')} value={pct(y.marginOnCost)} />
            </div>
            <Waterfall
              currency={currency}
              items={[
                { label: t('yield.revenue'), value: y.revenue, kind: 'total' },
                { label: t('yield.hardCost'), value: y.hardCost, kind: 'minus' },
                { label: t('yield.softCost'), value: y.softCost, kind: 'minus' },
                { label: t('yield.land'), value: y.landCost, kind: 'minus' },
                { label: t('yield.parking'), value: y.parkingCost, kind: 'minus' },
                { label: t('yield.margin'), value: y.margin, kind: 'result' },
              ]}
            />
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{t('yield.sensitivity')}</h3>
            <Sensitivity revenue={y.revenue} buildCosts={y.hardCost + y.softCost} fixed={y.landCost + y.parkingCost} currency={currency} />
          </section>
        </>
      )}

      <section className="divide-y divide-line">
        {Object.entries(y.gfaByUse).map(([u, v]) => row(`${t('yield.gfa')} ${t(`use.${u}`)}`, m2(v)))}
        {row(t('yield.revenue'), cash(y.revenue))}
        {row(t('yield.hardCost'), cash(y.hardCost))}
        {row(t('yield.softCost'), cash(y.softCost))}
        {row(t('yield.land'), cash(y.landCost))}
        {row(t('yield.parking'), cash(y.parkingCost))}
        {row(t('yield.totalCost'), cash(y.totalCost), true)}
        {row(t('yield.margin'), cash(y.margin), true)}
        {row(t('yield.costPerM2'), cash(y.costPerSellableM2))}
      </section>
    </div>
  );
}
