import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Clock, Layers, Loader2, MapPin, Plus, Search, Sparkles } from 'lucide-react';
import { api, problemMessage } from '../api/client';
import { useProjects } from '../api/hooks';
import type { ProjectDto } from '../api/types';
import { AppHeader } from '../components/AppHeader';
import { PlotThumbnail } from '../components/PlotThumbnail';
import { Badge, Card, Skeleton } from '../components/ui';
import { m2, money } from '../lib/format';

type Card = ProjectDto & { thumbnailUrl?: string | null; optionCount?: number };

function ProjectCard({ p }: { p: Card }) {
  const { t, i18n } = useTranslation();
  return (
    <Link to={`/projects/${p.id}`} className="group block">
      <Card className="overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
        <div className="relative h-44 bg-gradient-to-b from-sky-50 to-stone-100 dark:from-slate-800 dark:to-slate-900">
          {p.thumbnailUrl ? (
            <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : p.plot ? (
            <div className="h-full p-6"><PlotThumbnail plot={p.plot.local} buildable={p.plot.buildable} /></div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted"><MapPin size={28} /></div>
          )}
          {p.ruleSetIsTest && <span className="absolute left-2 top-2"><Badge tone="bad">TEST</Badge></span>}
        </div>
        <div className="space-y-1.5 p-3">
          <div className="truncate font-medium">{p.name}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1"><MapPin size={12} /> {p.plot ? m2(p.plot.areaM2) : t('projects.noPlot')}</span>
            <span className="flex items-center gap-1"><Layers size={12} /> {t('projects.options', { count: p.optionCount ?? 0 })}</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {new Date(p.createdAt).toLocaleDateString(i18n.language)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-1.5 text-xs">
            <span className="text-muted">{t('projects.bestMargin')}</span>
            <span className="font-semibold tabular-nums">{p.bestMargin === null ? <span className="font-normal text-muted">{t('projects.noYield')}</span> : money(p.bestMargin, p.currency)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const projects = useProjects();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const list = ((projects.data ?? []) as Card[]).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const demo = async () => {
    setBusy(true);
    try {
      const p = await api<ProjectDto>('/projects/demo', { method: 'POST', body: { locale: i18n.language } });
      void nav(`/projects/${p.id}`);
    } catch (e) {
      toast.error(problemMessage(e, i18n.language));
      setBusy(false);
    }
  };
  return (
    <div className="min-h-full bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('projects.title')}</h1>
            <p className="text-sm text-muted">{t('projects.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input aria-label={t('projects.search')} placeholder={t('projects.search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-56 rounded-md border border-line bg-panel py-1.5 pl-8 pr-2 text-sm outline-none focus:border-accent" />
            </div>
            <button onClick={demo} disabled={busy} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-medium hover:bg-surface">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} className="text-accent" />} {t('projects.demo')}
            </button>
            <Link to="/projects/new" className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:brightness-110">
              <Plus size={15} /> {t('projects.new')}
            </Link>
          </div>
        </div>
        {projects.isLoading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}
          </div>
        )}
        {projects.data?.length === 0 && (
          <Card className="mx-auto max-w-2xl p-10 text-center">
            <Building2 size={36} className="mx-auto mb-3 text-accent" />
            <h2 className="text-lg font-semibold">{t('projects.emptyTitle')}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('projects.empty')}</p>
            <ol className="mx-auto mt-5 grid max-w-lg grid-cols-1 gap-2 text-left text-sm sm:grid-cols-3">
              {[t('projects.step1'), t('projects.step2'), t('projects.step3')].map((s, i) => (
                <li key={s} className="rounded-lg bg-surface p-3"><span className="mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">{i + 1}</span>{s}</li>
              ))}
            </ol>
            <div className="mt-6 flex justify-center gap-2">
              <button onClick={demo} disabled={busy} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-surface"><Sparkles size={15} className="text-accent" /> {t('projects.demo')}</button>
              <Link to="/projects/new" className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink"><Plus size={15} /> {t('projects.new')}</Link>
            </div>
          </Card>
        )}
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => <li key={p.id}><ProjectCard p={p} /></li>)}
        </ul>
      </main>
    </div>
  );
}
