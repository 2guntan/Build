import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Box, Columns3, Copy, Download, FileBox, FileText, Focus, History, Keyboard, Languages, Moon, Move, MousePointer2, Plus, RotateCw, Settings, Share2, Sun, Trash2 } from 'lucide-react';
import { findZone, type Zone } from '@fs/rules';
import { api } from '../api/client';
import { keys, useAssumptions, useContext, useCreateOption, useInvalidate, useOption, useOptions, useProject, useRuleSet } from '../api/hooks';
import { AppHeader } from '../components/AppHeader';
import { CommandPalette, type PaletteAction } from '../components/CommandPalette';
import { Dialog } from '../components/Dialog';
import { Kbd, Skeleton, Tabs, TestBanner } from '../components/ui';
import { setLanguage } from '../i18n';
import { useDesignStore } from '../state/design-store';
import { flush, syncPending } from '../state/saver';
import { useViewStore } from '../state/view-store';
import { AssistantPanel } from '../workspace/AssistantPanel';
import { CompliancePanel } from '../workspace/CompliancePanel';
import { HistoryPanel } from '../workspace/HistoryPanel';
import { IfcPreview } from '../workspace/IfcPreview';
import { ParametersPanel } from '../workspace/ParametersPanel';
import { ShareDialog } from '../workspace/ShareDialog';
import { SHORTCUTS, useWorkspaceShortcuts } from '../workspace/shortcuts';
import { SunControls } from '../workspace/SunControls';
import { useSunStore } from '../workspace/sun-store';
import { TopBar } from '../workspace/TopBar';
import { Viewport } from '../workspace/Viewport';
import { YieldPanel } from '../workspace/YieldPanel';
import { useThumbnailUpload } from '../workspace/use-thumbnail';

export default function WorkspacePage() {
  const { id: projectId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const project = useProject(projectId);
  const options = useOptions(projectId);
  const [optionId, setOptionId] = useState<string | null>(null);
  const option = useOption(optionId);
  const ruleSet = useRuleSet(project.data?.ruleSetId);
  const context = useContext(projectId);
  const assumptions = useAssumptions(projectId);
  const createOption = useCreateOption(projectId);
  const invalidate = useInvalidate();
  const [left, setLeft] = useState<'assistant' | 'parameters'>('parameters');
  const [right, setRight] = useState<'compliance' | 'yield' | 'history'>('compliance');
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [share, setShare] = useState(false);
  const [redo, setRedo] = useState<string[]>([]);
  const load = useDesignStore((s) => s.load);

  useEffect(() => {
    if (!optionId && options.data?.[0]) setOptionId(options.data[0].id);
  }, [options.data, optionId]);

  const plot = project.data?.plot;
  const zone: Zone | null = useMemo(() => {
    if (!ruleSet.data || !plot?.zoneId) return null;
    try {
      return findZone(ruleSet.data.content, plot.zoneId);
    } catch {
      return null;
    }
  }, [ruleSet.data, plot?.zoneId]);

  // Load the option's head into the design store whenever the server head changes.
  const headId = option.data?.head?.id ?? null;
  useEffect(() => {
    if (!option.data || !plot || !optionId || (plot.zoneId && !ruleSet.data)) return;
    load({
      optionId,
      headId,
      recipe: option.data.head?.recipe ?? null,
      site: { plot: plot.local, edgeClasses: plot.edgeClasses, buildable: plot.buildable ?? plot.local },
      zone,
      assumptions: assumptions.data ?? {},
      origin: { lat: plot.origin.lat, lon: plot.origin.lon },
    });
    useSunStore.getState().setLocation(plot.origin.lat, plot.origin.lon);
    void syncPending(optionId).then((r) => r && useDesignStore.getState().setRecipe(r));
    // Reload only when the option, its head or the inputs' availability change.
  }, [optionId, headId, !!option.data, !!ruleSet.data, !!plot]);

  useEffect(() => {
    if (assumptions.data) useDesignStore.getState().setAssumptions(assumptions.data);
  }, [assumptions.data]);
  useEffect(() => {
    if (context.data) useDesignStore.getState().setContext(context.data.buildings.map((b) => ({ id: b.id, ring: b.local, heightM: b.heightM })), [...new Set(context.data.buildings.map((b) => b.dataSource))]);
  }, [context.data]);
  useThumbnailUpload(optionId);

  const refreshOption = useCallback(() => {
    if (optionId) void invalidate(keys.option(optionId));
    if (optionId) void invalidate(keys.versions(optionId));
  }, [optionId, invalidate]);

  const moveHead = useCallback(
    async (versionId: string) => {
      await flush();
      await api(`/options/${optionId}/head`, { method: 'POST', body: { versionId } });
      refreshOption();
    },
    [optionId, refreshOption],
  );
  const undo = useCallback(async () => {
    await flush();
    const opt = await api<{ head: { id: string; parentId: string | null } | null }>(`/options/${optionId}`);
    if (!opt.head?.parentId) return;
    setRedo((r) => [...r, opt.head!.id]);
    await moveHead(opt.head.parentId);
  }, [optionId, moveHead]);
  const redoFn = useCallback(async () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setRedo((r) => r.slice(0, -1));
    await moveHead(next);
  }, [redo, moveHead]);
  const newOption = useCallback(
    async (dup: boolean) => {
      const n = (options.data?.length ?? 0) + 1;
      const o = await createOption.mutateAsync({ name: `Option ${String.fromCharCode(64 + n)}`, ...(dup ? { duplicateFrom: optionId! } : {}) });
      setOptionId(o.id);
      toast.success(t('workspace.optionCreated', { name: o.name }));
    },
    [options.data, createOption, optionId, t],
  );

  const handlers = useMemo(() => ({ undo: () => void undo(), redo: () => void redoFn(), palette: () => setPalette(true), help: () => setHelp(true) }), [undo, redoFn]);
  useWorkspaceShortcuts(handlers);

  const v = useViewStore.getState();
  const actions: PaletteAction[] = [
    { id: 'add', group: t('palette.design'), label: t('viewport.addBlock'), icon: <Plus size={15} />, shortcut: 'B', run: () => useDesignStore.getState().addBlock() },
    { id: 'dup', group: t('palette.design'), label: t('viewport.duplicate'), icon: <Copy size={15} />, shortcut: 'Ctrl+D', run: () => useDesignStore.getState().duplicateSelected() },
    { id: 'del', group: t('palette.design'), label: t('viewport.delete'), icon: <Trash2 size={15} />, shortcut: 'Suppr', run: () => useDesignStore.getState().deleteSelected() },
    { id: 'select', group: t('palette.design'), label: t('viewport.select'), icon: <MousePointer2 size={15} />, shortcut: 'V', run: () => v.set('editMode', 'select') },
    { id: 'move', group: t('palette.design'), label: t('viewport.move'), icon: <Move size={15} />, shortcut: 'G', run: () => v.set('editMode', 'move') },
    { id: 'rotate', group: t('palette.design'), label: t('viewport.rotate'), icon: <RotateCw size={15} />, shortcut: 'R', run: () => v.set('editMode', 'rotate') },
    { id: 'newopt', group: t('workspace.options'), label: t('workspace.newOption'), icon: <Plus size={15} />, run: () => void newOption(false) },
    { id: 'dupopt', group: t('workspace.options'), label: t('workspace.duplicate'), icon: <Copy size={15} />, run: () => void newOption(true) },
    ...(options.data ?? []).map((o) => ({ id: `opt-${o.id}`, group: t('workspace.options'), label: o.name, icon: <Box size={15} />, run: () => setOptionId(o.id) })),
    { id: 'iso', group: t('viewport.views'), label: '3D', shortcut: '1', icon: <Box size={15} />, run: () => v.view('iso') },
    { id: 'top', group: t('viewport.views'), label: t('workspace.view2d'), shortcut: '2', icon: <Box size={15} />, run: () => v.view('top') },
    { id: 'frame', group: t('viewport.views'), label: t('viewport.frame'), shortcut: 'F', icon: <Focus size={15} />, run: () => v.frame() },
    { id: 'sun', group: t('viewport.views'), label: t('workspace.sun'), icon: <Sun size={15} />, run: () => useSunStore.getState().setEnabled(!useSunStore.getState().enabled) },
    { id: 'ifc', group: t('workspace.export'), label: 'IFC4', icon: <FileBox size={15} />, run: () => document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.click() },
    { id: 'pdf', group: t('workspace.export'), label: 'PDF', icon: <FileText size={15} />, run: () => document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.click() },
    { id: 'png', group: t('workspace.export'), label: t('viewport.screenshot'), icon: <Download size={15} />, run: () => v.screenshot() },
    { id: 'history', group: t('palette.go'), label: t('history.title'), icon: <History size={15} />, run: () => setRight('history') },
    { id: 'share', group: t('palette.go'), label: t('share.title'), icon: <Share2 size={15} />, run: () => setShare(true) },
    { id: 'compare', group: t('palette.go'), label: t('workspace.compare'), icon: <Columns3 size={15} />, run: () => void nav(`/projects/${projectId}/compare`) },
    { id: 'settings', group: t('palette.go'), label: t('workspace.settings'), icon: <Settings size={15} />, run: () => void nav(`/projects/${projectId}/settings`) },
    { id: 'lang', group: t('palette.prefs'), label: i18n.language === 'fr' ? 'English' : 'Français', icon: <Languages size={15} />, run: () => setLanguage(i18n.language === 'fr' ? 'en' : 'fr') },
    { id: 'theme', group: t('palette.prefs'), label: t('app.theme'), icon: <Moon size={15} />, run: () => v.set('dark', !useViewStore.getState().dark) },
    { id: 'keys', group: t('palette.prefs'), label: t('shortcuts.title'), shortcut: '?', icon: <Keyboard size={15} />, run: () => setHelp(true) },
  ];

  if (project.isLoading || options.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader />
        <div className="flex flex-1 gap-3 p-3">
          <Skeleton className="hidden w-[340px] xl:block" />
          <Skeleton className="flex-1" />
          <Skeleton className="hidden w-[320px] xl:block" />
        </div>
      </div>
    );
  }
  if (!project.data) return <p className="p-6 text-bad">{t('app.error')}</p>;
  if (!plot) return <p className="p-6 text-muted">{t('workspace.noPlot')}</p>;

  const isTest = option.data?.evaluation?.compliance.test ?? project.data.ruleSetIsTest;
  const leftPanel = (
    <div className="flex h-full flex-col">
      <Tabs value={left} onChange={setLeft} label={t('workspace.parameters')} items={[{ id: 'parameters', label: t('workspace.parameters') }, { id: 'assistant', label: t('workspace.assistant') }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {left === 'assistant' && optionId && <AssistantPanel optionId={optionId} onAccepted={refreshOption} />}
        {left === 'parameters' && (
          <ParametersPanel
            nonCompliantStudy={option.data?.option.nonCompliantStudy ?? false}
            onToggleStudy={async (val) => {
              await api(`/options/${optionId}`, { method: 'PATCH', body: { nonCompliantStudy: val } });
              refreshOption();
            }}
          />
        )}
      </div>
    </div>
  );
  const rightPanel =
    right === 'history' && optionId ? (
      <HistoryPanel optionId={optionId} onRestore={(id) => void moveHead(id).then(() => toast.success(t('history.restored')))} onClose={() => setRight('compliance')} />
    ) : (
      <div className="flex h-full flex-col">
        <Tabs value={right as 'compliance'} onChange={setRight} label={t('workspace.compliance')} items={[{ id: 'compliance', label: t('workspace.compliance') }, { id: 'yield', label: t('workspace.yield') }]} />
        <div className="min-h-0 flex-1 overflow-y-auto">{right === 'compliance' ? <CompliancePanel /> : <YieldPanel projectId={projectId} currency={project.data.currency} />}</div>
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-surface">
      <AppHeader onPalette={() => setPalette(true)} />
      {isTest && <TestBanner text={t('app.testBanner')} />}
      {optionId && (
        <TopBar
          projectId={projectId}
          projectName={project.data.name}
          options={options.data ?? []}
          optionId={optionId}
          onSelect={(id) => {
            setRedo([]);
            setOptionId(id);
          }}
          onNewOption={(dup) => void newOption(dup)}
          onRenameOption={async (id, name) => {
            await api(`/options/${id}`, { method: 'PATCH', body: { name } });
            void invalidate(keys.options(projectId));
          }}
          onUndo={() => void undo()}
          onRedo={() => void redoFn()}
          canRedo={redo.length > 0}
          onPreviewIfc={setPreview}
          onHistory={() => setRight(right === 'history' ? 'compliance' : 'history')}
          onShare={() => setShare(true)}
        />
      )}
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${drawer === 'left' ? 'absolute inset-y-0 left-0 z-20 shadow-xl' : 'hidden'} w-[340px] shrink-0 border-r border-line bg-panel xl:static xl:block xl:shadow-none`}>{leftPanel}</aside>
        <main className="relative min-w-0 flex-1">
          <Viewport />
          <div className="absolute bottom-16 right-3 flex gap-1 xl:hidden">
            <button className="rounded-md border border-line bg-panel px-2 py-1 text-xs shadow-sm" onClick={() => setDrawer(drawer === 'left' ? null : 'left')}>{t('workspace.parameters')}</button>
            <button className="rounded-md border border-line bg-panel px-2 py-1 text-xs shadow-sm" onClick={() => setDrawer(drawer === 'right' ? null : 'right')}>{t('workspace.compliance')}</button>
          </div>
        </main>
        <aside className={`${drawer === 'right' ? 'absolute inset-y-0 right-0 z-20 shadow-xl' : 'hidden'} w-[320px] shrink-0 border-l border-line bg-panel xl:static xl:block xl:shadow-none`}>{rightPanel}</aside>
      </div>
      <SunControls />
      {preview && <IfcPreview url={preview} onClose={() => setPreview(null)} />}
      <CommandPalette open={palette} onClose={() => setPalette(false)} actions={actions} />
      <ShareDialog projectId={projectId} open={share} onClose={() => setShare(false)} />
      <Dialog open={help} onClose={() => setHelp(false)} title={t('shortcuts.title')}>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-3">
              <span>{t(label)}</span>
              <Kbd>{k}</Kbd>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
