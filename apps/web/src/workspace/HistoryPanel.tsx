import { useTranslation } from 'react-i18next';
import { Bot, Hand, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useVersions } from '../api/hooks';
import { Badge, Skeleton } from '../components/ui';
import { m2 } from '../lib/format';
import { useDesignStore } from '../state/design-store';

interface Row {
  id: string;
  parentId: string | null;
  authorKind: string;
  summary: string | null;
  createdAt: string;
  gfaM2?: number | null;
  compliant?: boolean | null;
}

const ICON = { agent: Bot, slider: SlidersHorizontal, user: Hand } as const;

function ago(iso: string, lang: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (s < 60) return rtf.format(-Math.round(s), 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

/** Timeline of immutable versions; restoring moves the head (nothing is deleted). */
export function HistoryPanel({ optionId, onRestore, onClose }: { optionId: string; onRestore: (versionId: string) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const versions = useVersions(optionId);
  const head = useDesignStore((s) => s.headId);
  const rows = (versions.data ?? []) as Row[];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="text-sm font-semibold">{t('history.title')}</h3>
        <button aria-label={t('app.cancel')} onClick={onClose} className="rounded p-1 text-muted hover:bg-surface"><X size={15} /></button>
      </div>
      <ol className="flex-1 space-y-0 overflow-y-auto p-3">
        {versions.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="mb-3 h-12" />)}
        {rows.map((v, i) => {
          const Icon = ICON[v.authorKind as keyof typeof ICON] ?? Hand;
          const isHead = v.id === head;
          return (
            <li key={v.id} className="relative pb-4 pl-7">
              {i < rows.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-line" />}
              <span className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${isHead ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel text-muted'}`}>
                <Icon size={12} />
              </span>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{v.summary ?? t(`history.kind.${v.authorKind}`)}</div>
                  <div className="text-[11px] text-muted">{ago(v.createdAt, i18n.language)} · {t(`history.kind.${v.authorKind}`)}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                    {v.gfaM2 != null && <span className="tabular-nums">{m2(v.gfaM2)}</span>}
                    {v.compliant != null && <Badge tone={v.compliant ? 'ok' : 'bad'}>{v.compliant ? t('compliance.pass') : t('compliance.fail')}</Badge>}
                    {isHead && <Badge tone="accent">{t('history.current')}</Badge>}
                  </div>
                </div>
                {!isHead && (
                  <button className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-accent hover:bg-accent/10" onClick={() => onRestore(v.id)}>
                    <RotateCcw size={12} /> {t('history.restore')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
