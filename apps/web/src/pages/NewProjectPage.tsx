import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import * as Comlink from 'comlink';
import { dist, LocalFrame, normalizeRing, centroid } from '@fs/geometry';
import { api, problemMessage } from '../api/client';
import { useJurisdictions } from '../api/hooks';
import type { ProjectDto } from '../api/types';
import { AppHeader } from '../components/AppHeader';
import { PlotMap } from '../components/PlotMap';
import { Badge, Button, Card, Field, Input } from '../components/ui';
import { MAX_UPLOAD_BYTES, type LonLat } from '../lib/geo-import';
import type { ImportWorkerApi } from '../workers/import.worker';

type Edge = 'front' | 'side' | 'rear';
const DAKAR: LonLat = [-17.4677, 14.7167];

function edgeLengths(v: LonLat[]): number[] {
  if (v.length < 3) return [];
  const c = centroid(v);
  const f = new LocalFrame({ lon: c[0], lat: c[1] });
  const local = v.map(([lon, lat]) => f.toLocal(lon, lat));
  return local.map((p, i) => dist(p, local[(i + 1) % local.length]!));
}

async function geocode(q: string): Promise<LonLat | null> {
  // Nominatim usage policy: user-triggered, one request per search, with attribution.
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sn&q=${encodeURIComponent(q)}`);
  const j = (await r.json()) as { lon: string; lat: string }[];
  return j[0] ? [Number(j[0].lon), Number(j[0].lat)] : null;
}

export default function NewProjectPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const juris = useJurisdictions();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [flyTo, setFlyTo] = useState<LonLat | null>(null);
  const [vertices, setVertices] = useState<LonLat[]>([]);
  const [closed, setClosed] = useState(false);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hl, setHl] = useState<number | null>(null);
  const [basemap, setBasemap] = useState<'streets' | 'satellite'>('satellite');
  const [zoneId, setZoneId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lengths = useMemo(() => edgeLengths(vertices), [vertices]);
  const ruleSet = juris.data?.find((j) => j.id === 'sn-dakar')?.ruleSets[0];

  const closePlot = (v = vertices) => {
    const ring = normalizeRing(v.map((p) => [p[0], p[1]] as const)) as LonLat[];
    setVertices(ring);
    setClosed(true);
    setEdges(ring.map((_, i) => (i === 0 ? 'front' : 'side')));
  };

  const importFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError(t('wizard.tooLarge'));
    const w = new Worker(new URL('../workers/import.worker.ts', import.meta.url), { type: 'module' });
    try {
      const ring = await Comlink.wrap<ImportWorkerApi>(w).parse(file.name, await file.text());
      closePlot(ring);
      setFlyTo(centroid(ring) as LonLat);
    } catch (e) {
      setError(t('wizard.importError', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      w.terminate();
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api<ProjectDto>('/projects', { method: 'POST', body: { name: name || 'Projet', locale: i18n.language } });
      await api(`/projects/${p.id}/plot`, {
        method: 'PUT',
        body: { geojson: { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] }, edgeClasses: edges, zoneId: zoneId || undefined, source: 'drawn' },
      });
      await api(`/projects/${p.id}/options`, { method: 'POST', body: { name: 'Option A' } });
      await api(`/projects/${p.id}/site-data`, { method: 'POST', body: {} });
      void nav(`/projects/${p.id}`);
    } catch (e) {
      setError(problemMessage(e, i18n.language));
      setBusy(false);
    }
  };

  const steps = [t('wizard.step1'), t('wizard.step2'), t('wizard.step3'), t('wizard.step4'), t('wizard.step5')];
  const canNext = step === 1 ? name.trim().length > 0 : step === 2 ? closed && vertices.length >= 3 : step === 4 ? !!zoneId : true;

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <span className="text-sm text-muted">{t('wizard.title')}</span>
      </AppHeader>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full space-y-4 overflow-y-auto border-r border-line bg-panel p-4 md:w-96">
          <ol className="flex gap-1 text-xs">
            {steps.map((s, i) => (
              <li key={s} className={`flex-1 rounded px-1 py-1 text-center ${i + 1 === step ? 'bg-accent text-white' : 'bg-surface text-muted'}`}>{s}</li>
            ))}
          </ol>
          {step === 1 && (
            <div className="space-y-3">
              <Field label={t('wizard.name')}>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </Field>
              <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await geocode(query).catch(() => null); if (r) setFlyTo(r); }}>
                <Input placeholder={t('wizard.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
                <Button type="submit">⌕</Button>
              </form>
              <p className="text-xs text-muted">{t('wizard.searchHint')}</p>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm">{t('wizard.draw')}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={closed || vertices.length < 3} onClick={() => closePlot()}>{t('wizard.close')}</Button>
                <Button disabled={closed || !vertices.length} onClick={() => setVertices(vertices.slice(0, -1))}>{t('wizard.undoVertex')}</Button>
                <Button onClick={() => { setVertices([]); setClosed(false); }}>{t('wizard.clear')}</Button>
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 py-3 text-sm text-muted hover:border-accent hover:text-accent">
                <Upload size={15} /> {t('wizard.import')}
                <input type="file" accept=".geojson,.json,.kml" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} className="sr-only" />
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-2">
              <p className="text-sm">{t('wizard.edges')}</p>
              {edges.map((c, i) => (
                <div key={i} className="flex items-center gap-2" onMouseEnter={() => setHl(i)} onMouseLeave={() => setHl(null)}>
                  <span className="w-20 text-sm">{t('wizard.edge', { n: i + 1 })}</span>
                  <span className="w-16 text-xs text-muted">{t('wizard.length', { m: lengths[i]?.toFixed(1) })}</span>
                  <select className="flex-1 rounded border border-line px-2 py-1 text-sm" value={c} onFocus={() => setHl(i)} onChange={(e) => setEdges(edges.map((x, j) => (j === i ? (e.target.value as Edge) : x)))}>
                    <option value="front">{t('edge.front')}</option>
                    <option value="side">{t('edge.side')}</option>
                    <option value="rear">{t('edge.rear')}</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              {ruleSet?.isTest && <Badge tone="bad">{t('app.testBanner')}</Badge>}
              <Field label={t('wizard.zone')}>
                <select className="w-full rounded border border-line px-2 py-1.5 text-sm" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                  <option value="">—</option>
                  {ruleSet?.zones.map((z) => (
                    <option key={z.id} value={z.id}>{i18n.language === 'en' ? (z.name_en ?? z.name) : z.name}</option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-muted">{t('wizard.ruleSet')} : sn-dakar {ruleSet?.version}</p>
            </div>
          )}
          {step === 5 && (
            <Card className="space-y-1 p-3 text-sm">
              <div className="font-medium">{name}</div>
              <div className="text-muted">{t('wizard.summary', { n: vertices.length, p: lengths.reduce((a, b) => a + b, 0).toFixed(0) })}</div>
              <div className="text-muted">{t('wizard.zone')} : {zoneId}</div>
            </Card>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex justify-between">
            <Button disabled={step === 1} onClick={() => setStep(step - 1)}>{t('app.back')}</Button>
            {step < 5 ? (
              <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('app.next')}</Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={create}>{busy ? t('wizard.creating') : t('wizard.create')}</Button>
            )}
          </div>
        </aside>
        <section className="relative min-h-[50vh] flex-1">
          <PlotMap
            center={DAKAR}
            vertices={vertices}
            closed={closed}
            basemap={basemap}
            highlightEdge={hl}
            flyTo={flyTo}
            onClick={step === 2 && !closed ? (p) => setVertices([...vertices, p]) : undefined}
            onVertexMove={step === 2 ? (i, p) => setVertices((v) => v.map((x, j) => (j === i ? p : x))) : undefined}
            onInsert={
              step === 2
                ? (i, p) => {
                    setVertices((v) => [...v.slice(0, i + 1), p, ...v.slice(i + 1)]);
                    setEdges((e) => [...e.slice(0, i + 1), 'side', ...e.slice(i + 1)]);
                  }
                : undefined
            }
          />
          <div className="absolute left-3 top-3 inline-flex overflow-hidden rounded-md border border-line bg-panel text-xs shadow">
            {(['satellite', 'streets'] as const).map((b) => (
              <button key={b} aria-pressed={basemap === b} onClick={() => setBasemap(b)} className={`px-2.5 py-1.5 font-medium ${basemap === b ? 'bg-accent text-accent-ink' : ''}`}>{t(`viewport.${b}`)}</button>
            ))}
          </div>
          {step === 2 && closed && <p className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-xs text-white">{t('wizard.editHint')}</p>}
        </section>
      </div>
    </div>
  );
}
