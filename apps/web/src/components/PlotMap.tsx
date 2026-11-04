/// <reference types="geojson" />
import { useEffect, useRef } from 'react';
import { Map as MlMap, NavigationControl, type GeoJSONSource, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import type { LonLat } from '../lib/geo-import';

/**
 * Basemap: set VITE_BASEMAP_STYLE (MapTiler, Stadia or self-hosted style URL) in production.
 * The fallback uses OpenStreetMap raster tiles, acceptable for development only.
 */
const STYLE: string | StyleSpecification = import.meta.env.VITE_BASEMAP_STYLE ?? {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export interface PlotMapProps {
  center: LonLat;
  vertices: LonLat[];
  closed: boolean;
  highlightEdge?: number | null;
  onClick?: (p: LonLat) => void;
  flyTo?: LonLat | null;
}

function features(v: LonLat[], closed: boolean, hl: number | null | undefined): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = v.map((p, i) => ({ type: 'Feature', properties: { i }, geometry: { type: 'Point', coordinates: p } }));
  if (v.length >= 2) {
    f.push({ type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: closed ? [...v, v[0]!] : v } });
  }
  if (closed && v.length >= 3) {
    f.push({ type: 'Feature', properties: { kind: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...v, v[0]!]] } });
    if (hl !== null && hl !== undefined && v[hl]) {
      f.push({ type: 'Feature', properties: { kind: 'hl' }, geometry: { type: 'LineString', coordinates: [v[hl]!, v[(hl + 1) % v.length]!] } });
    }
  }
  return { type: 'FeatureCollection', features: f };
}

export function PlotMap({ center, vertices, closed, highlightEdge, onClick, flyTo }: PlotMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const m = new MlMap({ container: el.current!, style: STYLE, center, zoom: 18, attributionControl: { compact: true } });
    m.addControl(new NavigationControl(), 'top-right');
    m.on('load', () => {
      m.addSource('plot', { type: 'geojson', data: features([], false, null) });
      m.addLayer({ id: 'plot-fill', type: 'fill', source: 'plot', filter: ['==', ['get', 'kind'], 'fill'], paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.25 } });
      m.addLayer({ id: 'plot-line', type: 'line', source: 'plot', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#0f172a', 'line-width': 2 } });
      m.addLayer({ id: 'plot-hl', type: 'line', source: 'plot', filter: ['==', ['get', 'kind'], 'hl'], paint: { 'line-color': '#f59e0b', 'line-width': 5 } });
      m.addLayer({ id: 'plot-pts', type: 'circle', source: 'plot', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2 } });
    });
    m.on('click', (e: MapMouseEvent) => clickRef.current?.([e.lngLat.lng, e.lngLat.lat]));
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => (m.getSource('plot') as GeoJSONSource | undefined)?.setData(features(vertices, closed, highlightEdge));
    if (m.isStyleLoaded() && m.getSource('plot')) apply();
    else m.once('load', apply);
  }, [vertices, closed, highlightEdge]);

  useEffect(() => {
    if (flyTo) map.current?.flyTo({ center: flyTo, zoom: 18 });
  }, [flyTo]);

  return <div ref={el} className="h-full w-full" data-testid="plot-map" />;
}
