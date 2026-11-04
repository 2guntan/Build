import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { UNIT_TYPES, USES } from '@fs/recipe';
import { api, problemMessage } from '../api/client';
import { keys, useAssumptions, useInvalidate, useProject } from '../api/hooks';
import type { Assumptions } from '../api/types';
import { AppHeader } from '../components/AppHeader';
import { Badge, Button, Card, Field, Input } from '../components/ui';

const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s));

export default function SettingsPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const project = useProject(id);
  const assumptions = useAssumptions(id);
  const invalidate = useInvalidate();
  const [a, setA] = useState<Assumptions>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (assumptions.data) setA(assumptions.data);
  }, [assumptions.data]);
  const uses = USES;
  const setMap = (k: 'salePricePerM2' | 'buildCostPerM2' | 'unitSizesM2', sub: string, v: string) => {
    const m = { ...((a[k] as Record<string, number>) ?? {}) };
    const n = numOrUndef(v);
    if (n === undefined) delete m[sub];
    else m[sub] = n;
    setA({ ...a, [k]: m });
  };
  const cur = a.currency ?? project.data?.currency ?? 'XOF';
  return (
    <div className="min-h-full">
      <AppHeader>
        <Link to={`/projects/${id}`} className="text-sm text-muted hover:text-ink">← {project.data?.name}</Link>
      </AppHeader>
      <main className="mx-auto max-w-4xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
        <Card className="space-y-4 p-4">
          <h2 className="font-semibold">{t('settings.yield')}</h2>
          <p className="text-xs text-muted">{t('yield.enterPrices')}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th />
                <th className="p-1">{t('settings.salePrice')} ({cur})</th>
                <th className="p-1">{t('settings.buildCost')} ({cur})</th>
              </tr>
            </thead>
            <tbody>
              {uses.map((u) => (
                <tr key={u}>
                  <td className="p-1 text-xs">{t(`use.${u}`)}</td>
                  <td className="p-1"><Input aria-label={`${t('settings.salePrice')} ${u}`} inputMode="numeric" value={a.salePricePerM2?.[u] ?? ''} onChange={(e) => setMap('salePricePerM2', u, e.target.value)} /></td>
                  <td className="p-1"><Input aria-label={`${t('settings.buildCost')} ${u}`} inputMode="numeric" value={a.buildCostPerM2?.[u] ?? ''} onChange={(e) => setMap('buildCostPerM2', u, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={`${t('settings.landCost')} (${cur})`}><Input inputMode="numeric" value={a.landCost ?? ''} onChange={(e) => setA({ ...a, landCost: numOrUndef(e.target.value) })} /></Field>
            <Field label={t('settings.softCost')}><Input inputMode="decimal" value={a.softCostRatio ?? ''} onChange={(e) => setA({ ...a, softCostRatio: numOrUndef(e.target.value) })} /></Field>
            <Field label={`${t('settings.parkingCost')} (${cur})`}><Input inputMode="numeric" value={a.parkingCostPerSpace ?? ''} onChange={(e) => setA({ ...a, parkingCostPerSpace: numOrUndef(e.target.value) })} /></Field>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted">{t('settings.unitSizes')}</h3>
            <div className="grid grid-cols-5 gap-2">
              {UNIT_TYPES.map((u) => (
                <Field key={u} label={u}><Input inputMode="numeric" value={a.unitSizesM2?.[u] ?? ''} onChange={(e) => setMap('unitSizesM2', u, e.target.value)} /></Field>
              ))}
            </div>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await api(`/projects/${id}/yield-assumptions`, { method: 'PUT', body: { currency: cur, salePricePerM2: {}, buildCostPerM2: {}, unitSizesM2: {}, ...a } });
                await invalidate(keys.assumptions(id));
                setMsg(t('workspace.saved'));
              } catch (e) {
                setMsg(problemMessage(e, i18n.language));
              }
            }}
          >
            {t('app.save')}
          </Button>
        </Card>
        <Card className="space-y-2 p-4 text-sm">
          <h2 className="font-semibold">{t('settings.ruleSet')}</h2>
          <p>
            {project.data?.jurisdictionId} · {project.data?.ruleSetId} {project.data?.ruleSetIsTest && <Badge tone="bad">TEST</Badge>}
          </p>
          <p className="text-xs text-muted">{t('settings.currency')} : {cur}</p>
        </Card>
      </main>
    </div>
  );
}
