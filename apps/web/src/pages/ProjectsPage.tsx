import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../api/hooks';
import { AppHeader } from '../components/AppHeader';
import { PlotThumbnail } from '../components/PlotThumbnail';
import { Badge, Card } from '../components/ui';
import { m2, money } from '../lib/format';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const projects = useProjects();
  return (
    <div className="min-h-full">
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('projects.title')}</h1>
          <Link to="/projects/new" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
            {t('projects.new')}
          </Link>
        </div>
        {projects.isLoading && <p className="text-muted">{t('app.loading')}</p>}
        {projects.data?.length === 0 && <Card className="p-8 text-center text-muted">{t('projects.empty')}</Card>}
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data?.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block">
                <Card className="overflow-hidden transition hover:shadow-md">
                  <div className="h-36 bg-surface">{p.plot ? <PlotThumbnail plot={p.plot.local} buildable={p.plot.buildable} /> : null}</div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.ruleSetIsTest && <Badge tone="bad">TEST</Badge>}
                    </div>
                    <div className="flex justify-between text-xs text-muted">
                      <span>{t('projects.plotArea')} : {p.plot ? m2(p.plot.areaM2) : t('projects.noPlot')}</span>
                      <span>{t('projects.bestMargin')} : {money(p.bestMargin, p.currency)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
