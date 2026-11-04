import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { OptionDto } from '../api/types';
import { Button } from '../components/ui';
import { flush } from '../state/saver';
import { useDesignStore } from '../state/design-store';

interface Props {
  projectId: string;
  projectName: string;
  options: OptionDto[];
  optionId: string;
  onSelect: (id: string) => void;
  onNewOption: (duplicate: boolean) => void;
  onHeadMoved: () => void;
  onPreviewIfc: (url: string) => void;
}

async function pollExport(id: string): Promise<{ status: string; url: string | null; error: string | null }> {
  for (let i = 0; i < 60; i++) {
    const s = await api<{ status: string; url: string | null; error: string | null }>(`/exports/${id}`);
    if (s.status === 'done' || s.status === 'failed') return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { status: 'failed', url: null, error: 'timeout' };
}

export function TopBar(p: Props) {
  const { t } = useTranslation();
  const saveState = useDesignStore((s) => s.saveState);
  const headId = useDesignStore((s) => s.headId);
  const [redo, setRedo] = useState<string[]>([]);
  const [exportState, setExportState] = useState<{ kind: string; status: string; url: string | null; error: string | null } | null>(null);

  const undo = async () => {
    await flush();
    const opt = await api<{ head: { id: string; parentId: string | null } | null }>(`/options/${p.optionId}`);
    if (!opt.head?.parentId) return;
    await api(`/options/${p.optionId}/head`, { method: 'POST', body: { versionId: opt.head.parentId } });
    setRedo([...redo, opt.head.id]);
    p.onHeadMoved();
  };
  const doRedo = async () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    await api(`/options/${p.optionId}/head`, { method: 'POST', body: { versionId: next } });
    setRedo(redo.slice(0, -1));
    p.onHeadMoved();
  };
  const exportAs = async (kind: 'ifc' | 'pdf') => {
    await flush();
    const head = useDesignStore.getState().headId;
    if (!head) return;
    setExportState({ kind, status: 'running', url: null, error: null });
    const { exportId } = await api<{ exportId: string }>(`/versions/${head}/exports`, { method: 'POST', body: { kind } });
    setExportState({ kind, ...(await pollExport(exportId)) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
      <span className="mr-2 truncate font-semibold">{p.projectName}</span>
      <div role="tablist" aria-label={t('workspace.options')} className="flex gap-1">
        {p.options.map((o) => (
          <button key={o.id} role="tab" aria-selected={o.id === p.optionId} onClick={() => p.onSelect(o.id)} className={`rounded px-2 py-1 text-xs ${o.id === p.optionId ? 'bg-accent text-white' : 'hover:bg-surface'}`}>
            {o.name}
          </button>
        ))}
        <Button variant="ghost" className="text-xs" onClick={() => p.onNewOption(false)} title={t('workspace.newOption')}>＋</Button>
        <Button variant="ghost" className="text-xs" onClick={() => p.onNewOption(true)}>{t('workspace.duplicate')}</Button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 text-xs text-muted" aria-live="polite">
          {saveState === 'saving' || saveState === 'pending' ? t('workspace.saving') : saveState === 'offline' ? t('workspace.offline') : saveState === 'saved' ? t('workspace.saved') : ''}
        </span>
        <Button variant="ghost" onClick={undo} disabled={!headId} aria-label={t('workspace.undo')}>↶</Button>
        <Button variant="ghost" onClick={doRedo} disabled={!redo.length} aria-label={t('workspace.redo')}>↷</Button>
        <Button onClick={() => void exportAs('ifc')}>{t('workspace.exportIfc')}</Button>
        <Button onClick={() => void exportAs('pdf')}>{t('workspace.exportPdf')}</Button>
        <Link className="rounded px-2 py-1 text-sm hover:bg-surface" to={`/projects/${p.projectId}/compare`}>{t('workspace.compare')}</Link>
        <Link className="rounded px-2 py-1 text-sm hover:bg-surface" to={`/projects/${p.projectId}/settings`}>{t('workspace.settings')}</Link>
      </div>
      {exportState && (
        <div className="flex w-full items-center justify-end gap-2 text-xs">
          {exportState.status === 'running' && <span>{t('workspace.exporting')}</span>}
          {exportState.status === 'done' && exportState.url && (
            <>
              <a className="text-accent underline" href={exportState.url}>{t('workspace.download')} ({exportState.kind.toUpperCase()})</a>
              {exportState.kind === 'ifc' && <button className="underline" onClick={() => p.onPreviewIfc(exportState.url!)}>{t('workspace.preview')}</button>}
            </>
          )}
          {exportState.status === 'failed' && <span className="text-bad">{exportState.error}</span>}
        </div>
      )}
    </div>
  );
}
