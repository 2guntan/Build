import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, ExternalLink, Link2, Trash2 } from 'lucide-react';
import { api, problemMessage } from '../api/client';
import { Dialog } from '../components/Dialog';
import { Button } from '../components/ui';

interface Link {
  id: string;
  token: string;
  expiresAt: string | null;
}

export function ShareDialog({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [links, setLinks] = useState<Link[]>([]);
  const [days, setDays] = useState(30);
  const load = () => api<Link[]>(`/projects/${projectId}/share-links`).then(setLinks).catch(() => setLinks([]));
  useEffect(() => {
    if (open) void load();
  }, [open]);
  const url = (token: string) => `${window.location.origin}/s/${token}`;
  return (
    <Dialog open={open} onClose={onClose} title={t('share.title')}>
      <div className="space-y-4 p-4 text-sm">
        <p className="text-muted">{t('share.intro')}</p>
        <div className="flex items-center gap-2">
          <select aria-label={t('share.validity')} className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90].map((d) => <option key={d} value={d}>{t('share.days', { n: d })}</option>)}
          </select>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                const l = await api<Link>(`/projects/${projectId}/share-links`, { method: 'POST', body: { days } });
                await navigator.clipboard?.writeText(url(l.token)).catch(() => undefined);
                toast.success(t('share.copied'));
                void load();
              } catch (e) {
                toast.error(problemMessage(e, i18n.language));
              }
            }}
          >
            <Link2 size={15} /> {t('share.create')}
          </Button>
        </div>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-md border border-line p-2">
              <input readOnly value={url(l.token)} className="min-w-0 flex-1 bg-transparent text-xs" onFocus={(e) => e.target.select()} />
              {l.expiresAt && <span className="shrink-0 text-[11px] text-muted">{t('share.until', { date: new Date(l.expiresAt).toLocaleDateString(i18n.language) })}</span>}
              <button title={t('share.copy')} className="rounded p-1 hover:bg-surface" onClick={() => void navigator.clipboard?.writeText(url(l.token)).then(() => toast.success(t('share.copied')))}><Copy size={14} /></button>
              <a title={t('share.open')} className="rounded p-1 hover:bg-surface" href={url(l.token)} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>
              <button
                title={t('share.revoke')}
                className="rounded p-1 text-bad hover:bg-surface"
                onClick={async () => {
                  await api(`/projects/${projectId}/share-links/${l.id}`, { method: 'DELETE' });
                  void load();
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {links.length === 0 && <li className="text-xs text-muted">{t('share.none')}</li>}
        </ul>
      </div>
    </Dialog>
  );
}
