/// <reference types="geojson" />
import { useEffect, useRef } from 'react';
import { Map as MlMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
// Let Vite bundle MapLibre's module worker; its default relative URL breaks with pre-bundled deps.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { dist, LocalFrame } from '@fs/geometry';
import type { LonLat } from '../lib/geo-import';
import { TILE_ATTRIBUTION, TILE_TEMPLATES } from '../viewport/TileGround';

setWorkerUrl(maplibreWorkerUrl);

/**
 * Basemap: set VITE_BASEMAP_STYLE (vector style) or the VITE_*_TILES raster templates in production.
 * The defaults (OSM tiles, Esri imagery) are fine for development only.
 */
function style(kind: 'streets' | 'satellite'): string | StyleSpecification {
  if (kind === 'streets' && import.meta.env.VITE_BASEMAP_STYLE) return import.meta.env.VITE_BASEMAP_STYLE;
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: [TILE_TEMPLATES[kind]], tileSize: 256, maxzoom: 19, attribution: TILE_ATTRIBUTION[kind] },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#e8eae4' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}

export interface PlotMapProps {
  center: LonLat;
  vertices: LonLat[];
  closed: boolean;
  basemap: 'streets' | 'satellite';
  highlightEdge?: number | null;
  onClick?: (p: LonLat) => void;
  onVertexMove?: (i: number, p: LonLat) => void;
  onInsert?: (afterIndex: number, p: LonLat) => void;
  flyTo?: LonLat | null;
}

function features(v: LonLat[], closed: boolean, hl: number | null | undefined): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = v.map((p, i) => ({ type: 'Feature', properties: { i, kind: 'vertex' }, geometry: { type: 'Point', coordinates: p } }));
  if (v.length >= 2) f.push({ type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: closed ? [...v, v[0]!] : v } });
  if (closed && v.length >= 3) {
    f.push({ type: 'Feature', properties: { kind: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...v, v[0]!]] } });
    v.forEach((p, i) => {
      const q = v[(i + 1) % v.length]!;
      f.push({ type: 'Feature', properties: { i, kind: 'mid' }, geometry: { type: 'Point', coordinates: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] } });
    });
    if (hl !== null && hl !== undefined && v[hl]) f.push({ type: 'Feature', properties: { kind: 'hl' }, geometry: { type: 'LineString', coordinates: [v[hl]!, v[(hl + 1) % v.length]!] } });
  }
  return { type: 'FeatureCollection', features: f };
}

export function PlotMap({ center, vertices, closed, basemap, highlightEdge, onClick, onVertexMove, onInsert, flyTo }: PlotMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const labels = useRef<Marker[]>([]);
  const cb = useRef({ onClick, onVertexMove, onInsert });
  cb.current = { onClick, onVertexMove, onInsert };
  const drag = useRef<{ kind: 'vertex' | 'mid'; i: number; inserted: boolean } | null>(null);
  const data = useRef({ vertices, closed, highlightEdge });
  data.current = { vertices, closed, highlightEdge };

  const addLayers = (m: MlMap) => {
    // isStyleLoaded() stays false while raster tiles are failing, so rely on the style.load / load events.
    if (m.getSource('plot')) return;
    m.addSource('plot', { type: 'geojson', data: features(data.current.vertices, data.current.closed, data.current.highlightEdge) });
    m.addLayer({ id: 'plot-fill', type: 'fill', source: 'plot', filter: ['==', ['get', 'kind'], 'fill'], paint: { 'fill-color': '#14b8a6', 'fill-opacity': 0.22 } });
    m.addLayer({ id: 'plot-line', type: 'line', source: 'plot', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#f59e0b', 'line-width': 2.5 } });
    m.addLayer({ id: 'plot-hl', type: 'line', source: 'plot', filter: ['==', ['get', 'kind'], 'hl'], paint: { 'line-color': '#dc2626', 'line-width': 6 } });
    m.addLayer({ id: 'plot-mid', type: 'circle', source: 'plot', filter: ['==', ['get', 'kind'], 'mid'], paint: { 'circle-radius': 4, 'circle-color': '#f59e0b', 'circle-opacity': 0.7 } });
    m.addLayer({ id: 'plot-pts', type: 'circle', source: 'plot', filter: ['==', ['get', 'kind'], 'vertex'], paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#f59e0b', 'circle-stroke-width': 2.5 } });
  };

  useEffect(() => {
    const m = new MlMap({ container: el.current!, style: style(basemap), center, zoom: 18, maxZoom: 20, attributionControl: { compact: true } });
    m.addControl(new NavigationControl(), 'top-right');
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    // Custom layers are re-added after every style (basemap) change.
    m.on('style.load', () => addLayers(m));
    m.on('load', () => addLayers(m));
    m.on('click', (e: MapMouseEvent) => {
      if (drag.current) return;
      cb.current.onClick?.([e.lngLat.lng, e.lngLat.lat]);
    });
    const startDrag = (kind: 'vertex' | 'mid') => (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      if (!data.current.closed || !e.features?.[0]) return;
      e.preventDefault();
      drag.current = { kind, i: Number(e.features[0].properties?.i), inserted: false };
      m.dragPan.disable();
      m.getCanvas().style.cursor = 'grabbing';
    };
    m.on('mousedown', 'plot-pts', startDrag('vertex'));
    m.on('mousedown', 'plot-mid', startDrag('mid'));
    for (const l of ['plot-pts', 'plot-mid']) {
      m.on('mouseenter', l, () => data.current.closed && (m.getCanvas().style.cursor = 'grab'));
      m.on('mouseleave', l, () => (m.getCanvas().style.cursor = ''));
    }
    m.on('mousemove', (e: MapMouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const p: LonLat = [e.lngLat.lng, e.lngLat.lat];
      if (d.kind === 'mid' && !d.inserted) {
        cb.current.onInsert?.(d.i, p);
        drag.current = { kind: 'vertex', i: d.i + 1, inserted: true };
      } else cb.current.onVertexMove?.(d.i, p);
    });
    m.on('mouseup', () => {
      if (!drag.current) return;
      setTimeout(() => (drag.current = null), 0);
      m.dragPan.enable();
      m.getCanvas().style.cursor = '';
    });
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = m;
    return () => m.remove();
  }, []);

  const shownBasemap = useRef(basemap);
  useEffect(() => {
    if (!map.current || shownBasemap.current === basemap) return;
    shownBasemap.current = basemap;
    map.current.setStyle(style(basemap));
  }, [basemap]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    (m.getSource('plot') as GeoJSONSource | undefined)?.setData(features(vertices, closed, highlightEdge));
    // Edge length labels (HTML markers: no glyph server needed).
    for (const l of labels.current) l.remove();
    labels.current = [];
    if (vertices.length >= 2) {
      const f = new LocalFrame({ lon: vertices[0]![0], lat: vertices[0]![1] });
      const n = closed ? vertices.length : vertices.length - 1;
      for (let i = 0; i < n; i++) {
        const a = vertices[i]!;
        const b = vertices[(i + 1) % vertices.length]!;
        const len = dist(f.toLocal(a[0], a[1]), f.toLocal(b[0], b[1]));
        const div = document.createElement('div');
        div.className = 'vp-label vp-edge';
        div.textContent = `${len.toFixed(1)} m`;
        labels.current.push(new Marker({ element: div, offset: [0, -14] }).setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]).addTo(m));
      }
    }
  }, [vertices, closed, highlightEdge]);

  useEffect(() => {
    if (flyTo) map.current?.flyTo({ center: flyTo, zoom: 18 });
  }, [flyTo]);

  return <div ref={el} className="h-full w-full" data-testid="plot-map" />;
}
