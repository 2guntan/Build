import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Building2, Maximize2 } from 'lucide-react';
import type { PlotSummary } from '@fs/api-contract';
import type { Recipe } from '@fs/recipe';
import type { Zone } from '@fs/rules';
import { api } from '../api/client';
import type { EvaluationDto } from '../api/types';
import { Badge, Stat, TestBanner } from '../components/ui';
import { m2, money, num, pct, storeys } from '../lib/format';
import { useDesignStore } from '../state/design-store';
import { Viewport } from '../workspace/Viewport';
import { useSunStore } from '../workspace/sun-store';
import { setLanguage } from '../i18n';

interface Shared {
  project: { name: string; currency: string; ruleSetIsTest: boolean };
  plot: PlotSummary | null;
  zone: Zone | null;
  context: { id: string; heightM: number; local: [number, number][]; dataSource?: string }[];
  options: { id: string; name: string; recipe: Recipe | null; evaluation: Pick<EvaluationDto, 'compliance' | 'metrics' | 'yield'> | null }[];
}

/** Public, read-only presentation of a project (share link). */
export default function SharedPage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['shared', token], queryFn: () => api<Shared>(`/shared/${token}`), retry: false });
  const [idx, setIdx] = useState(0);
  const data = q.data;
  const opt = data?.options[idx];

  useEffect(() => {
    if (!data?.plot || !opt?.recipe) return;
    useDesignStore.getState().load({
      optionId: `shared:${opt.id}`,
      headId: null,
      recipe: opt.recipe,
      site: { plot: data.plot.local, edgeClasses: data.plot.edgeClasses, buildable: data.plot.buildable ?? data.plot.local },
      zone: data.zone,
      assumptions: {},
      origin: { lat: data.plot.origin.lat, lon: data.plot.origin.lon },
    });
    useDesignStore.getState().setContext(data.context.map((b) => ({ id: b.id, ring: b.local, heightM: b.heightM })), [...new Set(data.context.map((b) => b.dataSource ?? ''))]);
    useSunStore.getState().setLocation(data.plot.origin.lat, data.plot.origin.lon);
  }, [data, opt]);

  if (q.isLoading) return <p className="p-8 text-muted">{t('app.loading')}</p>;
  if (q.isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Building2 size={32} className="text-muted" />
        <p className="font-medium">{t('shared.unavailable')}</p>
        <p className="text-sm text-muted">{t('shared.unavailableHint')}</p>
      </div>
    );
  }
  const ev = opt?.evaluation;
  const m = ev?.metrics;
  const y = ev?.yield;
  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{data.project.name}</div>
          <div className="text-[11px] text-muted">{t('shared.subtitle')}</div>
        </div>
        <div role="tablist" className="ml-4 flex gap-1 rounded-lg bg-surface p-0.5">
          {data.options.map((o, i) => (
            <button key={o.id} role="tab" aria-selected={i === idx} onClick={() => setIdx(i)} className={`rounded-md px-3 py-1 text-sm font-medium ${i === idx ? 'bg-panel shadow-sm' : 'text-muted'}`}>{o.name}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="text-xs text-muted" onClick={() => setLanguage(i18n.language === 'fr' ? 'en' : 'fr')}>{i18n.language === 'fr' ? 'EN' : 'FR'}</button>
          <button title={t('shared.fullscreen')} aria-label={t('shared.fullscreen')} className="rounded p-1.5 hover:bg-surface" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 size={16} /></button>
        </div>
      </header>
      {data.project.ruleSetIsTest && <TestBanner text={t('app.testBanner')} />}
      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1"><Viewport readOnly /></main>
        <aside className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-panel p-4 lg:block">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{opt?.name}</h2>
            {ev && <Badge tone={ev.compliance.compliant ? 'ok' : 'bad'}>{ev.compliance.compliant ? t('compliance.pass') : t('compliance.fail')}</Badge>}
          </div>
          {m && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t('metrics.gfa')} value={m2(m.gfaM2)} />
              <Stat label={t('metrics.floors')} value={storeys(m.maxFloors)} sub={`${num(m.maxHeightM, 1)} m`} />
              <Stat label={t('metrics.coverage')} value={pct(m.plotAreaM2 ? m.footprintAreaM2 / m.plotAreaM2 : null)} />
              <Stat label={t('metrics.far')} value={num(m.plotAreaM2 ? m.gfaM2 / m.plotAreaM2 : null, 2)} />
              <Stat label={t('yield.sellable')} value={m2(y?.sellableM2)} />
              <Stat label={t('metrics.parking')} value={num(m.parkingSpaces)} />
            </div>
          )}
          {y?.complete && (
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
              <Stat label={t('yield.revenue')} value={money(y.revenue, data.project.currency)} />
              <Stat label={t('yield.margin')} value={money(y.margin, data.project.currency)} sub={pct(y.marginOnCost)} />
            </div>
          )}
          {ev && (
            <ul className="space-y-1 border-t border-line pt-3 text-xs">
              {ev.compliance.results.map((r) => (
                <li key={r.ruleId} className="flex items-start justify-between gap-2">
                  <span>{i18n.language === 'en' ? r.message_en : r.message_fr}</span>
                  <Badge tone={r.status === 'pass' ? 'ok' : r.status === 'warn' ? 'warn' : 'bad'}>{t(`compliance.${r.status}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
