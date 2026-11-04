import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ChevronDown, CloudOff, Columns3, Copy, Download, FileBox, FileText, History, Image, Loader2, Plus, Redo2, Settings, Share2, Undo2 } from 'lucide-react';
import { api, problemMessage } from '../api/client';
import type { OptionDto } from '../api/types';
import { Button } from '../components/ui';
import { flush } from '../state/saver';
import { useDesignStore } from '../state/design-store';
import { useViewStore } from '../state/view-store';

interface Props {
  projectId: string;
  projectName: string;
  options: OptionDto[];
  optionId: string;
  onSelect: (id: string) => void;
  onNewOption: (duplicate: boolean) => void;
  onRenameOption: (id: string, name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canRedo: boolean;
  onPreviewIfc: (url: string) => void;
  onHistory: () => void;
  onShare: () => void;
}

async function pollExport(id: string): Promise<{ status: string; url: string | null; error: string | null }> {
  for (let i = 0; i < 90; i++) {
    const s = await api<{ status: string; url: string | null; error: string | null }>(`/exports/${id}`);
    if (s.status === 'done' || s.status === 'failed') return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { status: 'failed', url: null, error: 'timeout' };
}

function SaveIndicator() {
  const { t } = useTranslation();
  const s = useDesignStore((x) => x.saveState);
  const map = {
    idle: null,
    pending: [<Loader2 key="i" size={13} className="animate-spin" />, t('workspace.saving')],
    saving: [<Loader2 key="i" size={13} className="animate-spin" />, t('workspace.saving')],
    saved: [<Check key="i" size={13} className="text-ok" />, t('workspace.saved')],
    offline: [<CloudOff key="i" size={13} className="text-warn" />, t('workspace.offline')],
    error: [<CloudOff key="i" size={13} className="text-bad" />, t('app.error')],
  } as const;
  const v = map[s];
  return (
    <span className="flex items-center gap-1 text-xs text-muted" aria-live="polite">
      {v?.[0]} <span className="hidden lg:inline">{v?.[1]}</span>
    </span>
  );
}

export function TopBar(p: Props) {
  const { t, i18n } = useTranslation();
  const headId = useDesignStore((s) => s.headId);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const exportAs = async (kind: 'ifc' | 'pdf') => {
    setMenu(false);
    await flush();
    const head = useDesignStore.getState().headId;
    if (!head) return;
    const id = toast.loading(t('workspace.exporting'));
    try {
      const { exportId } = await api<{ exportId: string }>(`/versions/${head}/exports`, { method: 'POST', body: { kind } });
      const r = await pollExport(exportId);
      if (r.status !== 'done' || !r.url) throw new Error(r.error ?? 'export failed');
      toast.success(kind === 'ifc' ? t('export.ifcReady') : t('export.pdfReady'), {
        id,
        duration: 15000,
        action: { label: t('workspace.download'), onClick: () => window.open(r.url!, '_blank') },
        ...(kind === 'ifc' ? { cancel: { label: t('workspace.preview'), onClick: () => p.onPreviewIfc(r.url!) } } : {}),
      });
    } catch (e) {
      toast.error(problemMessage(e, i18n.language), { id });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
      <span className="mr-1 max-w-[16rem] truncate font-semibold" title={p.projectName}>{p.projectName}</span>
      <div role="tablist" aria-label={t('workspace.options')} className="flex items-center gap-0.5 rounded-lg bg-surface p-0.5">
        {p.options.map((o) =>
          editing === o.id ? (
            <input
              key={o.id}
              autoFocus
              defaultValue={o.name}
              className="w-28 rounded px-2 py-1 text-xs"
              onBlur={(e) => {
                setEditing(null);
                if (e.target.value.trim() && e.target.value !== o.name) p.onRenameOption(o.id, e.target.value.trim());
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button
              key={o.id}
              role="tab"
              aria-selected={o.id === p.optionId}
              title={t('workspace.renameHint')}
              onClick={() => p.onSelect(o.id)}
              onDoubleClick={() => setEditing(o.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${o.id === p.optionId ? 'bg-panel shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {o.name}
            </button>
          ),
        )}
        <button className="rounded-md p-1 text-muted hover:bg-panel hover:text-ink" onClick={() => p.onNewOption(false)} title={t('workspace.newOption')} aria-label={t('workspace.newOption')}><Plus size={14} /></button>
        <button className="rounded-md p-1 text-muted hover:bg-panel hover:text-ink" onClick={() => p.onNewOption(true)} title={t('workspace.duplicate')} aria-label={t('workspace.duplicate')}><Copy size={14} /></button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <SaveIndicator />
        <span className="mx-1 h-5 w-px bg-line" />
        <Button variant="ghost" onClick={p.onUndo} disabled={!headId} aria-label={t('workspace.undo')} title={`${t('workspace.undo')} (Ctrl+Z)`}><Undo2 size={16} /></Button>
        <Button variant="ghost" onClick={p.onRedo} disabled={!p.canRedo} aria-label={t('workspace.redo')} title={`${t('workspace.redo')} (Ctrl+Shift+Z)`}><Redo2 size={16} /></Button>
        <Button variant="ghost" onClick={p.onHistory} title={t('history.title')}><History size={16} /><span className="hidden xl:inline">{t('history.title')}</span></Button>
        <Button variant="ghost" onClick={p.onShare} title={t('share.title')}><Share2 size={16} /><span className="hidden xl:inline">{t('share.title')}</span></Button>
        <div className="relative" ref={menuRef}>
          <Button variant="primary" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
            <Download size={15} /> {t('workspace.export')} <ChevronDown size={14} />
          </Button>
          {menu && (
            <div role="menu" className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-xl">
              <button role="menuitem" className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => void exportAs('ifc')}>
                <FileBox size={16} className="mt-0.5 text-accent" /><span><span className="block font-medium">IFC4</span><span className="text-xs text-muted">{t('export.ifcHint')}</span></span>
              </button>
              <button role="menuitem" className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => void exportAs('pdf')}>
                <FileText size={16} className="mt-0.5 text-accent" /><span><span className="block font-medium">PDF</span><span className="text-xs text-muted">{t('export.pdfHint')}</span></span>
              </button>
              <button role="menuitem" className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => { setMenu(false); useViewStore.getState().screenshot(); }}>
                <Image size={16} className="mt-0.5 text-accent" /><span><span className="block font-medium">PNG</span><span className="text-xs text-muted">{t('export.pngHint')}</span></span>
              </button>
            </div>
          )}
        </div>
        <Link className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-surface" to={`/projects/${p.projectId}/compare`} title={t('workspace.compare')}><Columns3 size={16} /><span className="hidden xl:inline">{t('workspace.compare')}</span></Link>
        <Link className="rounded-md p-1.5 hover:bg-surface" to={`/projects/${p.projectId}/settings`} title={t('workspace.settings')} aria-label={t('workspace.settings')}><Settings size={16} /></Link>
      </div>
    </div>
  );
}
