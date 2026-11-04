import { useTranslation } from 'react-i18next';
import type { Param } from '@fs/recipe';
import { useDesignStore } from '../state/design-store';
import { USE_COLORS } from '../viewport/colors';
import { m2, storeys } from '../lib/format';

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
      <input
        id={id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        onChange={(e) => setParam(k, Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function ParametersPanel({ nonCompliantStudy, onToggleStudy }: { nonCompliantStudy: boolean; onToggleStudy: (v: boolean) => void }) {
  const { t } = useTranslation();
  const recipe = useDesignStore((s) => s.recipe);
  const build = useDesignStore((s) => s.build);
  const selection = useDesignStore((s) => s.selection);
  const select = useDesignStore((s) => s.select);
  const ms = useDesignStore((s) => s.lastBuildMs);
  if (!recipe) return null;
  return (
    <div className="space-y-5 p-3">
      <div className="space-y-3">
        {Object.entries(recipe.params).map(([k, p]) => (
          <Slider key={k} k={k} p={p} />
        ))}
        <p className="text-[10px] text-muted">{t('params.buildTime', { ms: ms.toFixed(1) })}</p>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted">{t('params.blocks')}</h3>
        <ul className="space-y-2">
          {build?.blocks.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => select(b.id === selection ? null : b.id)}
                className={`w-full rounded-md border p-2 text-left text-xs ${b.id === selection ? 'border-accent bg-teal-50' : 'border-line'}`}
              >
                <div className="flex justify-between font-medium">
                  <span>{b.name}</span>
                  <span>{storeys(b.floors)} · {b.heightM.toFixed(1)} m</span>
                </div>
                <div className="text-muted">{m2(b.footprintAreaM2)} × {b.floors} = {m2(b.gfaM2)}</div>
                <div className="mt-1 flex h-2 overflow-hidden rounded">
                  {b.storeys.map((s) => (
                    <span key={s.index} title={`${s.index}: ${t(`use.${s.use}`)}`} className="flex-1" style={{ background: USE_COLORS[s.use] }} />
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={nonCompliantStudy} onChange={(e) => onToggleStudy(e.target.checked)} />
        {t('params.nonCompliantStudy')}
      </label>
      <ul className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(USE_COLORS).filter(([u]) => u !== 'unassigned').map(([u, c]) => (
          <li key={u} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
            {t(`use.${u}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
