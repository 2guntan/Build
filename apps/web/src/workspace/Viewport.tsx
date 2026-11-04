import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDesignStore } from '../state/design-store';
import type { ViewportManager } from '../viewport/ViewportManager';
import { useSunStore } from './sun-store';

export function Viewport() {
  const { t } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const vm = useRef<ViewportManager | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const site = useDesignStore((s) => s.site);
  const build = useDesignStore((s) => s.build);
  const selection = useDesignStore((s) => s.selection);
  const highlight = useDesignStore((s) => s.highlight);
  const context = useDesignStore((s) => s.context);
  const select = useDesignStore((s) => s.select);
  const sunPos = useSunStore((s) => (s.enabled ? s.position : null));
  const hoursMap = useSunStore((s) => s.map);

  useEffect(() => {
    let disposed = false;
    // That Open + Three.js are loaded on demand to keep the initial bundle small.
    void import('../viewport/ViewportManager').then(({ ViewportManager }) => {
      if (disposed || !el.current) return;
      vm.current = new ViewportManager(el.current);
      vm.current.onPick = (id) => select(id);
      setReady(true);
    });
    return () => {
      disposed = true;
      vm.current?.dispose();
      vm.current = null;
    };
  }, [select]);

  useEffect(() => {
    if (ready && site) {
      vm.current?.setSite(site.plot, site.buildable);
      vm.current?.fitTo(site.plot);
    }
  }, [ready, site]);
  useEffect(() => {
    if (ready && build) vm.current?.setBuild(build, selection, highlight);
  }, [ready, build, selection, highlight]);
  useEffect(() => {
    if (ready) vm.current?.setContext(context);
  }, [ready, context]);
  useEffect(() => {
    if (ready) vm.current?.setSun(sunPos);
  }, [ready, sunPos]);
  useEffect(() => {
    if (!ready) return;
    if (hoursMap) vm.current?.sun.showHours(hoursMap.points, hoursMap.hours);
    else vm.current?.sun.clearHours();
  }, [ready, hoursMap]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute inset-0" data-testid="viewport" />
      <div className="absolute left-3 top-3 flex overflow-hidden rounded-md border border-line bg-panel text-xs shadow-sm">
        {(['3d', '2d'] as const).map((m) => (
          <button
            key={m}
            className={`px-2.5 py-1 ${mode === m ? 'bg-accent text-white' : ''}`}
            onClick={() => {
              setMode(m);
              void vm.current?.setMode(m);
            }}
          >
            {m === '3d' ? t('workspace.view3d') : t('workspace.view2d')}
          </button>
        ))}
      </div>
      <p className="absolute bottom-1 right-2 text-[10px] text-muted">{t('workspace.attribution')}</p>
    </div>
  );
}
