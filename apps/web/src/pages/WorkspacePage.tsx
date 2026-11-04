import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { findZone, type Zone } from '@fs/rules';
import { api } from '../api/client';
import { useAssumptions, useContext, useCreateOption, useInvalidate, useOption, useOptions, useProject, useRuleSet, keys } from '../api/hooks';
import { AppHeader } from '../components/AppHeader';
import { Tabs, TestBanner } from '../components/ui';
import { useDesignStore } from '../state/design-store';
import { syncPending } from '../state/saver';
import { AssistantPanel } from '../workspace/AssistantPanel';
import { CompliancePanel } from '../workspace/CompliancePanel';
import { IfcPreview } from '../workspace/IfcPreview';
import { ParametersPanel } from '../workspace/ParametersPanel';
import { SunControls } from '../workspace/SunControls';
import { useSunStore } from '../workspace/sun-store';
import { TopBar } from '../workspace/TopBar';
import { Viewport } from '../workspace/Viewport';
import { YieldPanel } from '../workspace/YieldPanel';

export default function WorkspacePage() {
  const { id: projectId = '' } = useParams();
  const { t } = useTranslation();
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
  const [right, setRight] = useState<'compliance' | 'yield'>('compliance');
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const load = useDesignStore((s) => s.load);

  useEffect(() => {
    if (!optionId && options.data?.[0]) setOptionId(options.data[0].id);
  }, [options.data, optionId]);

  const plot = project.data?.plot;
  let zone: Zone | null = null;
  if (ruleSet.data && plot?.zoneId) {
    try {
      zone = findZone(ruleSet.data.content, plot.zoneId);
    } catch {
      zone = null;
    }
  }

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
    if (context.data) useDesignStore.getState().setContext(context.data.buildings.map((b) => ({ id: b.id, ring: b.local, heightM: b.heightM })));
  }, [context.data]);

  const refreshOption = useCallback(() => {
    if (optionId) void invalidate(keys.option(optionId));
  }, [optionId, invalidate]);

  if (project.isLoading || options.isLoading) return <p className="p-6 text-muted">{t('app.loading')}</p>;
  if (!project.data) return <p className="p-6 text-bad">{t('app.error')}</p>;
  if (!plot) return <p className="p-6 text-muted">{t('workspace.noPlot')}</p>;

  const isTest = option.data?.evaluation?.compliance.test ?? project.data.ruleSetIsTest;
  const leftPanel = (
    <div className="flex h-full flex-col">
      <Tabs value={left} onChange={setLeft} label={t('workspace.parameters')} items={[{ id: 'assistant', label: t('workspace.assistant') }, { id: 'parameters', label: t('workspace.parameters') }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {left === 'assistant' && optionId && <AssistantPanel optionId={optionId} onAccepted={refreshOption} />}
        {left === 'parameters' && (
          <ParametersPanel
            nonCompliantStudy={option.data?.option.nonCompliantStudy ?? false}
            onToggleStudy={async (v) => {
              await api(`/options/${optionId}`, { method: 'PATCH', body: { nonCompliantStudy: v } });
              refreshOption();
            }}
          />
        )}
      </div>
    </div>
  );
  const rightPanel = (
    <div className="flex h-full flex-col">
      <Tabs value={right} onChange={setRight} label={t('workspace.compliance')} items={[{ id: 'compliance', label: t('workspace.compliance') }, { id: 'yield', label: t('workspace.yield') }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {right === 'compliance' ? <CompliancePanel /> : <YieldPanel projectId={projectId} currency={project.data.currency} />}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      {isTest && <TestBanner text={t('app.testBanner')} />}
      {optionId && (
        <TopBar
          projectId={projectId}
          projectName={project.data.name}
          options={options.data ?? []}
          optionId={optionId}
          onSelect={setOptionId}
          onNewOption={async (dup) => {
            const n = (options.data?.length ?? 0) + 1;
            const o = await createOption.mutateAsync({ name: `Option ${String.fromCharCode(64 + n)}`, ...(dup ? { duplicateFrom: optionId } : {}) });
            setOptionId(o.id);
          }}
          onHeadMoved={refreshOption}
          onPreviewIfc={setPreview}
        />
      )}
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${drawer === 'left' ? 'absolute inset-y-0 left-0 z-20 shadow-xl' : 'hidden'} w-[360px] shrink-0 border-r border-line bg-panel xl:static xl:block xl:shadow-none`}>{leftPanel}</aside>
        <main className="relative min-w-0 flex-1">
          <Viewport />
          <div className="absolute right-3 top-3 flex gap-1 xl:hidden">
            <button className="rounded border border-line bg-panel px-2 py-1 text-xs" onClick={() => setDrawer(drawer === 'left' ? null : 'left')}>{t('workspace.parameters')}</button>
            <button className="rounded border border-line bg-panel px-2 py-1 text-xs" onClick={() => setDrawer(drawer === 'right' ? null : 'right')}>{t('workspace.compliance')}</button>
          </div>
        </main>
        <aside className={`${drawer === 'right' ? 'absolute inset-y-0 right-0 z-20 shadow-xl' : 'hidden'} w-[320px] shrink-0 border-l border-line bg-panel xl:static xl:block xl:shadow-none`}>{rightPanel}</aside>
      </div>
      <SunControls />
      {preview && <IfcPreview url={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
