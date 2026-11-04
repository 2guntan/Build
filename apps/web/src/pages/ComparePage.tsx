import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trophy } from 'lucide-react';
import { api } from '../api/client';
import { useContext, useOptions, useProject } from '../api/hooks';
import { build } from '@fs/builder';
import type { Recipe } from '@fs/recipe';
import type { EvaluationDto, OptionDto } from '../api/types';
import { AppHeader } from '../components/AppHeader';
import { PlotThumbnail } from '../components/PlotThumbnail';
import { Badge, Card, Skeleton } from '../components/ui';
import { m2, money, num, pct, storeys } from '../lib/format';

interface Row {
  optionId: string;
  name: string;
  metrics: EvaluationDto['metrics'] | null;
  compliance: EvaluationDto['compliance'] | null;
  yield: EvaluationDto['yield'] | null;
}

/** Client-side 3D snapshot for options that have no stored thumbnail yet. */
function LiveThumb({ optionId, plot, context }: { optionId: string; plot: NonNullable<ReturnType<typeof useProject>['data']>['plot']; context: { id: string; ring: [number, number][]; heightM: number }[] }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!plot) return;
      const o = await api<{ head: { recipe: Recipe } | null }>(`/options/${optionId}`);
      if (!o.head) return;
      const br = build(o.head.recipe, { plot: plot.local, edgeClasses: plot.edgeClasses, buildable: plot.buildable ?? plot.local }, { mesh: false });
      const { renderThumbnail } = await import('../viewport/thumbnail');
      const png = renderThumbnail({ build: br, plot: plot.local, buildable: plot.buildable, context, width: 480, height: 320 });
      if (alive) setSrc(png);
    })();
    return () => {
      alive = false;
    };
  }, [optionId, plot, context]);
  return src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-line/50" />;
}

type Line = { label: string; value: (r: Row) => number | null; show: (r: Row) => ReactNode; better?: 'high' | 'low' };

export default function ComparePage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const project = useProject(id);
  const options = useOptions(id);
  const ctxQ = useContext(id);
  const ctxPrisms = useMemo(() => (ctxQ.data?.buildings ?? []).map((b) => ({ id: b.id, ring: b.local, heightM: b.heightM })), [ctxQ.data]);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (options.data && !picked.length) setPicked(options.data.slice(0, 4).map((o) => o.id));
  }, [options.data, picked.length]);
  const cmp = useQuery({
    queryKey: ['compare', id, picked.join(',')],
    queryFn: () => api<Row[]>(`/projects/${id}/compare?options=${picked.join(',')}`),
    enabled: picked.length > 0,
  });
  const cur = project.data?.currency ?? 'XOF';
  const ratio = (a?: number, b?: number) => (a !== undefined && b ? a / b : null);
  const lines: Line[] = [
    { label: t('metrics.gfa'), value: (r) => r.metrics?.gfaM2 ?? null, show: (r) => m2(r.metrics?.gfaM2), better: 'high' },
    { label: t('yield.sellable'), value: (r) => r.yield?.sellableM2 ?? null, show: (r) => m2(r.yield?.sellableM2), better: 'high' },
    { label: t('metrics.footprint'), value: (r) => r.metrics?.footprintAreaM2 ?? null, show: (r) => m2(r.metrics?.footprintAreaM2) },
    { label: t('metrics.coverage'), value: (r) => ratio(r.metrics?.footprintAreaM2, r.metrics?.plotAreaM2), show: (r) => pct(ratio(r.metrics?.footprintAreaM2, r.metrics?.plotAreaM2)) },
    { label: t('metrics.far'), value: (r) => ratio(r.metrics?.gfaM2, r.metrics?.plotAreaM2), show: (r) => num(ratio(r.metrics?.gfaM2, r.metrics?.plotAreaM2), 2), better: 'high' },
    { label: t('metrics.height'), value: (r) => r.metrics?.maxHeightM ?? null, show: (r) => `${num(r.metrics?.maxHeightM, 1)} m` },
    { label: t('metrics.floors'), value: (r) => r.metrics?.maxFloors ?? null, show: (r) => (r.metrics ? storeys(r.metrics.maxFloors) : '–') },
    { label: t('yield.units'), value: (r) => r.yield?.unitCount ?? null, show: (r) => num(r.yield?.unitCount), better: 'high' },
    { label: t('metrics.parking'), value: (r) => r.metrics?.parkingSpaces ?? null, show: (r) => num(r.metrics?.parkingSpaces) },
    { label: t('yield.revenue'), value: (r) => (r.yield?.complete ? r.yield.revenue : null), show: (r) => (r.yield?.complete ? money(r.yield.revenue, cur) : '–'), better: 'high' },
    { label: t('yield.totalCost'), value: (r) => (r.yield?.complete ? r.yield.totalCost : null), show: (r) => (r.yield?.complete ? money(r.yield.totalCost, cur) : '–'), better: 'low' },
    { label: t('yield.margin'), value: (r) => (r.yield?.complete ? r.yield.margin : null), show: (r) => (r.yield?.complete ? money(r.yield.margin, cur) : '–'), better: 'high' },
    { label: t('yield.marginOnCost'), value: (r) => (r.yield?.complete ? r.yield.marginOnCost : null), show: (r) => (r.yield?.complete ? pct(r.yield.marginOnCost) : '–'), better: 'high' },
  ];
  const rows = cmp.data ?? [];
  const optById = new Map((options.data ?? []).map((o) => [o.id, o as OptionDto & { thumbnailUrl?: string | null }]));
  return (
    <div className="min-h-full bg-surface">
      <AppHeader>
        <Link to={`/projects/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> {project.data?.name}</Link>
      </AppHeader>
      <main className="mx-auto max-w-7xl space-y-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('compare.title')}</h1>
          <fieldset className="flex flex-wrap gap-2 text-sm">
            <legend className="sr-only">{t('compare.pick')}</legend>
            {options.data?.map((o) => {
              const on = picked.includes(o.id);
              return (
                <button
                  key={o.id}
                  aria-pressed={on}
                  disabled={!on && picked.length >= 4}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== o.id) : [...picked, o.id])}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel hover:border-accent'}`}
                >
                  {o.name}
                </button>
              );
            })}
          </fieldset>
        </div>
        {cmp.isLoading && <Skeleton className="h-96" />}
        {rows.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="w-48 p-3 text-left align-bottom text-xs font-medium text-muted">{t('compare.metric')}</th>
                  {rows.map((r) => {
                    const thumb = optById.get(r.optionId)?.thumbnailUrl;
                    return (
                      <th key={r.optionId} className="min-w-52 p-3 text-left align-bottom">
                        <div className="mb-2 h-36 overflow-hidden rounded-lg bg-gradient-to-b from-sky-50 to-stone-100 dark:from-slate-800 dark:to-slate-900">
                          {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : project.data?.plot && ctxQ.data ? <LiveThumb optionId={r.optionId} plot={project.data.plot} context={ctxPrisms} /> : project.data?.plot && <div className="h-full p-4"><PlotThumbnail plot={project.data.plot.local} buildable={project.data.plot.buildable} /></div>}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{r.name}</span>
                          {r.compliance && <Badge tone={r.compliance.compliant ? 'ok' : 'bad'}>{r.compliance.compliant ? t('compliance.pass') : t('compliance.fail')}</Badge>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const vals = rows.map((r) => l.value(r));
                  const nums = vals.filter((v): v is number => v !== null);
                  const max = Math.max(...nums.map(Math.abs), 1e-9);
                  const best = l.better && nums.length > 1 ? (l.better === 'high' ? Math.max(...nums) : Math.min(...nums)) : null;
                  return (
                    <tr key={l.label} className="border-b border-line last:border-0">
                      <td className="p-3 text-xs text-muted">{l.label}</td>
                      {rows.map((r, i) => {
                        const v = vals[i];
                        const isBest = best !== null && v === best;
                        return (
                          <td key={r.optionId} className="p-3">
                            <div className={`flex items-center gap-1.5 tabular-nums ${isBest ? 'font-semibold text-accent' : ''}`}>
                              {l.show(r)} {isBest && <Trophy size={12} />}
                            </div>
                            {v !== null && v !== undefined && (
                              <div className="mt-1 h-1 rounded-full bg-line">
                                <div className={`h-1 rounded-full ${isBest ? 'bg-accent' : 'bg-muted/40'}`} style={{ width: `${Math.max(3, (100 * Math.abs(v)) / max)}%` }} />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
