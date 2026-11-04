import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Camera,
  Copy,
  Eye,
  Focus,
  Grid3x3,
  Layers,
  Map as MapIcon,
  Move,
  MousePointer2,
  Plus,
  Ruler,
  RotateCw,
  Satellite,
  Trash2,
} from 'lucide-react';
import { useDesignStore } from '../state/design-store';
import { useViewStore } from '../state/view-store';
import { TILE_ATTRIBUTION } from '../viewport/TileGround';
import type { ViewportManager, ViewPreset } from '../viewport/ViewportManager';
import { IconButton, Segmented } from '../components/ui';
import { useSunStore } from './sun-store';

export function Viewport({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const vm = useRef<ViewportManager | null>(null);
  const [ready, setReady] = useState(false);
  const [azimuth, setAzimuth] = useState(0);
  const [layersOpen, setLayersOpen] = useState(false);
  const [tiles, setTiles] = useState<{ loaded: number; failed: number; total: number } | null>(null);
  const d = useDesignStore();
  const v = useViewStore();
  const sunPos = useSunStore((s) => (s.enabled ? s.position : null));
  const hoursMap = useSunStore((s) => s.map);

  useEffect(() => {
    let disposed = false;
    // That Open + Three.js are loaded on demand to keep the initial bundle small.
    void import('../viewport/ViewportManager').then(({ ViewportManager }) => {
      if (disposed || !el.current) return;
      const m = new ViewportManager(el.current);
      m.onPick = (id) => useDesignStore.getState().select(id);
      m.onCamera = (deg) => setAzimuth(deg);
      m.onEdit = (e) => useDesignStore.getState().applyEdit(e);
      m.ground.onStatus = setTiles;
      vm.current = m;
      if (import.meta.env.DEV) (window as unknown as { __vm: unknown }).__vm = m;
      setReady(true);
    });
    return () => {
      disposed = true;
      vm.current?.dispose();
      vm.current = null;
    };
  }, []);

  const site = d.site;
  const origin = d.origin;
  useEffect(() => {
    if (!ready || !site) return;
    vm.current!.setSite(site.plot, site.buildable, site.edgeClasses);
    void vm.current!.view('iso', false);
  }, [ready, site]);
  useEffect(() => {
    if (ready && origin) vm.current!.setOrigin({ lon: origin.lon, lat: origin.lat }, v.basemap);
  }, [ready, origin, v.basemap]);
  useEffect(() => {
    if (!ready || !d.build || !site) return;
    vm.current!.setStyle(v.style);
    vm.current!.setBuild(d.build, readOnly ? null : d.selection, d.highlight, d.compliance, site.edgeClasses);
  }, [ready, d.build, d.selection, d.highlight, d.compliance, v.style, site, readOnly]);
  useEffect(() => {
    if (ready) vm.current!.setGhost(d.ghost);
  }, [ready, d.ghost]);
  useEffect(() => {
    if (ready) vm.current!.setContext(d.context);
  }, [ready, d.context]);
  useEffect(() => {
    if (ready) vm.current!.setSun(sunPos);
  }, [ready, sunPos]);
  useEffect(() => {
    if (ready) vm.current!.showHours(hoursMap?.cells ?? null, hoursMap?.hours);
  }, [ready, hoursMap]);
  useEffect(() => {
    if (!ready) return;
    vm.current!.labels.setVisible(v.labels);
    vm.current!.ground.setGridVisible(v.grid);
    vm.current!.setDark(v.dark);
    vm.current!.setQuality(v.quality);
    vm.current!.edit.setMode(readOnly ? 'select' : v.editMode);
    if (d.build && site) vm.current!.setBuild(d.build, readOnly ? null : d.selection, d.highlight, d.compliance, site.edgeClasses);
  }, [ready, v.labels, v.grid, v.dark, v.quality, v.editMode, readOnly]);
  useEffect(() => {
    const c = v.command;
    if (!ready || !c) return;
    if (c.kind === 'view') void vm.current!.view(c.preset);
    if (c.kind === 'frame') vm.current!.frameSelection(useDesignStore.getState().selection);
    if (c.kind === 'screenshot') {
      const a = document.createElement('a');
      a.href = vm.current!.screenshot();
      a.download = 'feasibility-3d.png';
      a.click();
    }
  }, [ready, v.command]);

  const presets: { id: ViewPreset; label: string }[] = [
    { id: 'iso', label: '3D' },
    { id: 'top', label: t('workspace.view2d') },
    { id: 'south', label: 'S' },
    { id: 'east', label: 'E' },
    { id: 'north', label: 'N' },
    { id: 'west', label: 'O' },
  ];
  const sel = d.selection && d.build?.blocks.find((b) => b.id === d.selection);

  return (
    <div className="relative h-full w-full overflow-hidden" data-dark={v.dark || undefined}>
      <div ref={el} className="absolute inset-0" data-testid="viewport" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-sky-100 to-stone-100 dark:from-slate-800 dark:to-slate-900" />}

      <div className="vp-toolbar absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <Segmented label={t('viewport.views')} value={null} onChange={(p) => v.view(p as ViewPreset)} items={presets.map((p) => ({ id: p.id, label: p.label }))} />
        <IconButton label={t('viewport.frame')} onClick={() => v.frame()}><Focus size={16} /></IconButton>
        <IconButton label={t('viewport.screenshot')} onClick={() => v.screenshot()}><Camera size={16} /></IconButton>
      </div>

      {!readOnly && (
        <div className="vp-toolbar absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1">
          <Segmented
            label={t('viewport.tools')}
            value={v.editMode}
            onChange={(m) => v.set('editMode', m as 'select')}
            items={[
              { id: 'select', label: <MousePointer2 size={15} />, title: `${t('viewport.select')} (V)` },
              { id: 'move', label: <Move size={15} />, title: `${t('viewport.move')} (G)` },
              { id: 'rotate', label: <RotateCw size={15} />, title: `${t('viewport.rotate')} (R)` },
            ]}
          />
          <span className="mx-1 h-5 w-px bg-line" />
          <IconButton label={`${t('viewport.addBlock')} (B)`} onClick={() => d.addBlock()}><Plus size={16} /></IconButton>
          <IconButton label={`${t('viewport.duplicate')} (Ctrl+D)`} disabled={!sel} onClick={() => d.duplicateSelected()}><Copy size={16} /></IconButton>
          <IconButton label={`${t('viewport.delete')} (Suppr)`} disabled={!sel || (d.recipe?.blocks.length ?? 0) <= 1} onClick={() => d.deleteSelected()}><Trash2 size={16} /></IconButton>
        </div>
      )}

      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <IconButton label={t('viewport.layers')} active={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><Layers size={16} /></IconButton>
        {layersOpen && (
          <div className="w-60 space-y-3 rounded-lg border border-line bg-panel/95 p-3 text-xs shadow-lg backdrop-blur">
            <div>
              <div className="mb-1 font-medium text-muted">{t('viewport.basemap')}</div>
              <Segmented
                label={t('viewport.basemap')}
                value={v.basemap}
                onChange={(b) => v.set('basemap', b as 'satellite')}
                items={[
                  { id: 'satellite', label: <span className="flex items-center gap-1"><Satellite size={13} />{t('viewport.satellite')}</span> },
                  { id: 'streets', label: <span className="flex items-center gap-1"><MapIcon size={13} />{t('viewport.streets')}</span> },
                  { id: 'none', label: t('viewport.none') },
                ]}
              />
            </div>
            <div>
              <div className="mb-1 font-medium text-muted">{t('viewport.style')}</div>
              <Segmented
                label={t('viewport.style')}
                value={v.style}
                onChange={(s) => v.set('style', s as 'realistic')}
                items={[
                  { id: 'realistic', label: <span className="flex items-center gap-1"><Eye size={13} />{t('viewport.realistic')}</span> },
                  { id: 'uses', label: <span className="flex items-center gap-1"><Box size={13} />{t('viewport.byUse')}</span> },
                ]}
              />
            </div>
            <div>
              <div className="mb-1 font-medium text-muted">{t('viewport.quality')}</div>
              <Segmented
                label={t('viewport.quality')}
                value={v.quality}
                onChange={(q) => v.set('quality', q as 'auto')}
                items={[
                  { id: 'auto', label: t('viewport.qAuto') },
                  { id: 'high', label: t('viewport.qHigh') },
                  { id: 'low', label: t('viewport.qLow') },
                ]}
              />
            </div>
            <label className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Ruler size={13} />{t('viewport.dimensions')}</span><input type="checkbox" checked={v.labels} onChange={(e) => v.set('labels', e.target.checked)} /></label>
            <label className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Grid3x3 size={13} />{t('viewport.grid')}</span><input type="checkbox" checked={v.grid} onChange={(e) => v.set('grid', e.target.checked)} /></label>
          </div>
        )}
      </div>

      {/* Compass: needle points to north as the camera orbits. */}
      <div className="absolute bottom-16 left-3 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel/90 shadow-sm" title={t('viewport.north')}>
        <svg viewBox="-20 -20 40 40" className="h-10 w-10" style={{ transform: `rotate(${-azimuth}deg)` }} aria-hidden>
          <polygon points="0,-15 5,2 0,-2 -5,2" fill="#dc2626" />
          <polygon points="0,15 5,2 0,-2 -5,2" fill="#94a3b8" />
          <text x="0" y="-16" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">N</text>
        </svg>
      </div>

      {hoursMap && (
        <div className="absolute bottom-8 right-3 rounded-md border border-line bg-panel/90 px-2 py-1.5 text-[11px] shadow-sm">
          <div className="mb-1 font-medium">{t('sun.hours')}</div>
          <div className="flex items-center gap-1">0 h<span className="h-2 w-28 rounded" style={{ background: 'linear-gradient(90deg,#1f2973,#268c99,#f2cc33,#fa731a)' }} />12 h</div>
        </div>
      )}

      {sel && !readOnly && v.editMode === 'select' && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-[11px] text-white">{t('viewport.handlesHint')}</p>
      )}

      <p className="absolute bottom-1 right-2 max-w-[70%] truncate text-[10px] text-muted">
        {v.basemap !== 'none' && (tiles && tiles.failed === tiles.total && tiles.total > 0 ? t('viewport.tilesUnavailable') : TILE_ATTRIBUTION[v.basemap])} ·{' '}
        {d.contextSources.includes('demo-synthetic') ? <b className="text-warn">{t('viewport.demoContext')}</b> : t('workspace.attribution')}
      </p>
    </div>
  );
}
