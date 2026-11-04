import { useTranslation } from 'react-i18next';
import { useDesignStore } from '../state/design-store';
import { Badge } from '../components/ui';
import { m2, num, pct } from '../lib/format';

export function CompliancePanel() {
  const { t, i18n } = useTranslation();
  const ev = useDesignStore((s) => s.compliance);
  const zone = useDesignStore((s) => s.zone);
  const build = useDesignStore((s) => s.build);
  const setHighlight = useDesignStore((s) => s.setHighlight);
  const highlight = useDesignStore((s) => s.highlight);
  if (!zone) return <p className="p-3 text-sm text-muted">{t('compliance.noZone')}</p>;
  if (!ev) return null;
  const tot = build?.totals;
  const fmt = (v: number | null, unit: string) => (v === null ? '–' : unit === 'ratio' ? (v <= 1 ? pct(v) : num(v, 2)) : unit === 'm' ? `${num(v, 2)} m` : num(v));
  return (
    <div className="space-y-3 p-3">
      {tot && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><div className="text-muted">{t('metrics.gfa')}</div><div className="font-semibold">{m2(tot.gfaM2)}</div></div>
          <div><div className="text-muted">{t('metrics.coverage')}</div><div className="font-semibold">{pct(tot.plotAreaM2 ? tot.footprintAreaM2 / tot.plotAreaM2 : 0)}</div></div>
          <div><div className="text-muted">{t('metrics.far')}</div><div className="font-semibold">{num(tot.plotAreaM2 ? tot.gfaM2 / tot.plotAreaM2 : 0, 2)}</div></div>
        </div>
      )}
      <div aria-live="polite" className={`rounded-md px-2 py-1.5 text-xs font-medium ${ev.compliant ? 'bg-green-50 text-ok' : 'bg-red-50 text-bad'}`}>
        {ev.compliant ? t('compliance.allPass') : t('compliance.failures', { count: ev.blockingFailures })}
      </div>
      <ul className="space-y-1.5">
        {ev.results.map((r) => {
          const active = r.elementIds.length > 0 && r.elementIds.every((id) => highlight.includes(id));
          return (
            <li key={r.ruleId}>
              <button
                className={`w-full rounded-md border p-2 text-left text-xs ${active ? 'border-bad' : 'border-line'} hover:bg-surface`}
                onClick={() => setHighlight(active ? [] : r.elementIds)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{i18n.language === 'en' ? r.message_en : r.message_fr}</span>
                  <Badge tone={r.status === 'pass' ? 'ok' : r.status === 'warn' ? 'warn' : 'bad'}>{t(`compliance.${r.status}`)}</Badge>
                </div>
                <div className="mt-1 flex justify-between text-muted">
                  <span>{t('compliance.actual')} {fmt(r.actual, r.unit)} · {t('compliance.limit')} {fmt(r.limit, r.unit)}</span>
                  <span>{t('compliance.cite')} : {r.cite.source} {r.cite.article}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
