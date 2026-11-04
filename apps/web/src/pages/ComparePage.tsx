import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useOptions, useProject } from '../api/hooks';
import type { EvaluationDto } from '../api/types';
import { AppHeader } from '../components/AppHeader';
import { PlotThumbnail } from '../components/PlotThumbnail';
import { Badge, Card } from '../components/ui';
import { m2, money, num, pct, storeys } from '../lib/format';

interface Row {
  optionId: string;
  name: string;
  metrics: EvaluationDto['metrics'] | null;
  compliance: EvaluationDto['compliance'] | null;
  yield: EvaluationDto['yield'] | null;
}

export default function ComparePage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const project = useProject(id);
  const options = useOptions(id);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (options.data && !picked.length) setPicked(options.data.slice(0, 4).map((o) => o.id));
  }, [options.data, picked.length]);
  const cmp = useQuery({
    queryKey: ['compare', id, picked.join(',')],
    queryFn: () => api<Row[]>(`/projects/${id}/compare?options=${picked.join(',')}`),
    enabled: picked.length > 0,
  });
  const heads = useQuery({
    queryKey: ['compare-heads', picked.join(',')],
    queryFn: () => Promise.all(picked.map((o) => api<{ head: { recipe: { blocks: { footprint: { kind: string; vertices?: [number, number][] } }[] } } | null }>(`/options/${o}`))),
    enabled: picked.length > 0,
  });
  const cur = project.data?.currency ?? 'XOF';
  const lines: [string, (r: Row) => React.ReactNode][] = [
    [t('metrics.gfa'), (r) => m2(r.metrics?.gfaM2)],
    [t('metrics.footprint'), (r) => m2(r.metrics?.footprintAreaM2)],
    [t('metrics.coverage'), (r) => pct(r.metrics && r.metrics.plotAreaM2 ? r.metrics.footprintAreaM2 / r.metrics.plotAreaM2 : null)],
    [t('metrics.far'), (r) => num(r.metrics && r.metrics.plotAreaM2 ? r.metrics.gfaM2 / r.metrics.plotAreaM2 : null, 2)],
    [t('metrics.height'), (r) => `${num(r.metrics?.maxHeightM, 1)} m`],
    [t('metrics.floors'), (r) => (r.metrics ? storeys(r.metrics.maxFloors) : '–')],
    [t('metrics.parking'), (r) => num(r.metrics?.parkingSpaces)],
    [t('workspace.compliance'), (r) => (r.compliance ? <Badge tone={r.compliance.compliant ? 'ok' : 'bad'}>{r.compliance.compliant ? t('compliance.pass') : t('compliance.fail')}</Badge> : '–')],
    [t('yield.sellable'), (r) => m2(r.yield?.sellableM2)],
    [t('yield.revenue'), (r) => (r.yield?.complete ? money(r.yield.revenue, cur) : '–')],
    [t('yield.totalCost'), (r) => (r.yield?.complete ? money(r.yield.totalCost, cur) : '–')],
    [t('yield.margin'), (r) => (r.yield?.complete ? money(r.yield.margin, cur) : '–')],
    [t('yield.marginOnCost'), (r) => (r.yield?.complete ? pct(r.yield.marginOnCost) : '–')],
  ];
  return (
    <div className="min-h-full">
      <AppHeader>
        <Link to={`/projects/${id}`} className="text-sm text-muted hover:text-ink">← {project.data?.name}</Link>
      </AppHeader>
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t('compare.title')}</h1>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-xs text-muted">{t('compare.pick')}</legend>
          {options.data?.map((o) => (
            <label key={o.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={picked.includes(o.id)}
                disabled={!picked.includes(o.id) && picked.length >= 4}
                onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))}
              />
              {o.name}
            </label>
          ))}
        </fieldset>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="p-2 text-left text-xs text-muted">{t('compare.metric')}</th>
                {cmp.data?.map((r, i) => (
                  <th key={r.optionId} className="p-2 text-left">
                    <div className="mb-1 h-24 w-32 rounded bg-surface">
                      {project.data?.plot && (
                        <PlotThumbnail
                          plot={project.data.plot.local}
                          buildable={project.data.plot.buildable}
                          blocks={(heads.data?.[i]?.head?.recipe.blocks ?? []).filter((b) => b.footprint.vertices).map((b) => ({ ring: b.footprint.vertices!, color: '#0f766e' }))}
                        />
                      )}
                    </div>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(([label, f]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td className="p-2 text-xs text-muted">{label}</td>
                  {cmp.data?.map((r) => <td key={r.optionId} className="p-2 tabular-nums">{f(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
