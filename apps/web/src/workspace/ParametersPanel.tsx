import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PARAM_REF, type Param, type Recipe } from '@fs/recipe';
import { useDesignStore } from '../state/design-store';
import { USE_COLORS } from '../viewport/colors';
import { m2, storeys } from '../lib/format';
import { BlockEditor } from './BlockEditor';

function Slider({ k, p }: { k: string; p: Param }) {
  const setParam = useDesignStore((s) => s.setParam);
  const id = `param-${k}`;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <label htmlFor={id} className="font-medium">{p.label ?? k}</label>
        <span className="tabular-nums text-muted">
          {p.value}
          {p.unit ? ` ${p.unit}` : ''}
        </span>
      </div>
      <input id={id} type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => setParam(k, Number(e.target.value))} className="w-full" />
    </div>
  );
}

/** Params referenced by one block (for grouping sliders under it). */
function paramsOf(recipe: Recipe, blockId: string): Set<string> {
  const out = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'string' && PARAM_REF.test(v)) out.add(v.slice(8));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(recipe.blocks.find((b) => b.id === blockId));
  return out;
}

export function ParametersPanel({ nonCompliantStudy, onToggleStudy }: { nonCompliantStudy: boolean; onToggleStudy: (v: boolean) => void }) {
  const { t } = useTranslation();
  const recipe = useDesignStore((s) => s.recipe);
  const build = useDesignStore((s) => s.build);
  const selection = useDesignStore((s) => s.selection);
  const select = useDesignStore((s) => s.select);
  const ms = useDesignStore((s) => s.lastBuildMs);
  if (!recipe) return null;
  // Params used by several blocks, or not tied to one block by name (e.g. floor heights), are shown as shared.
  const blockSpecific = (k: string) => /[A-Z]$/.test(k) && recipe.blocks.filter((b) => paramsOf(recipe, b.id).has(k)).length === 1;
  const shared = new Set(Object.keys(recipe.params).filter((k) => !blockSpecific(k)));
  const selBlock = recipe.blocks.find((b) => b.id === selection);
  return (
    <div className="space-y-5 p-3">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase text-muted">{t('params.global')}</h3>
        {[...shared].map((k) => <Slider key={k} k={k} p={recipe.params[k]!} />)}
        <p className="text-[10px] text-muted">{t('params.buildTime', { ms: ms.toFixed(1) })}</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase text-muted">{t('params.blocks')}</h3>
          <button className="flex items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => useDesignStore.getState().addBlock()}>
            <Plus size={13} /> {t('viewport.addBlock')}
          </button>
        </div>
        <ul className="space-y-2">
          {build?.blocks.map((b) => {
            const own = [...paramsOf(recipe, b.id)].filter((k) => !shared.has(k) && recipe.params[k]);
            const active = b.id === selection;
            return (
              <li key={b.id} className="space-y-2">
                <button
                  onClick={() => select(active ? null : b.id)}
                  aria-pressed={active}
                  className={`w-full rounded-md border p-2 text-left text-xs transition ${active ? 'border-accent shadow-sm' : 'border-line hover:border-accent/50'}`}
                >
                  <div className="flex justify-between font-medium">
                    <span>{b.name}</span>
                    <span>{storeys(b.floors)} · {b.heightM.toFixed(1)} m</span>
                  </div>
                  <div className="text-muted">{m2(b.footprintAreaM2)} · {t('metrics.gfa')} {m2(b.gfaM2)}</div>
                  <div className="mt-1 flex h-2 overflow-hidden rounded">
                    {b.storeys.map((s) => (
                      <span key={s.index} title={`${s.index === 0 ? 'RDC' : `R+${s.index}`} : ${t(`use.${s.use}`)}`} className="flex-1 border-r border-white/60 last:border-0" style={{ background: USE_COLORS[s.use] }} />
                    ))}
                  </div>
                </button>
                {own.length > 0 && (
                  <div className="space-y-2 pl-2">
                    {own.map((k) => <Slider key={k} k={k} p={recipe.params[k]!} />)}
                  </div>
                )}
                {active && selBlock && <BlockEditor block={selBlock} />}
              </li>
            );
          })}
        </ul>
      </section>

      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={nonCompliantStudy} onChange={(e) => onToggleStudy(e.target.checked)} />
        {t('params.nonCompliantStudy')}
      </label>
      <ul className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(USE_COLORS)
          .filter(([u]) => u !== 'unassigned')
          .map(([u, c]) => (
            <li key={u} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
              {t(`use.${u}`)}
            </li>
          ))}
      </ul>
    </div>
  );
}
