import { useTranslation } from 'react-i18next';
import { Copy, Layers2, Plus, Trash2, X } from 'lucide-react';
import { renameBlock, setBlockStepBacks, setBlockUses } from '@fs/builder';
import { USES, resolveNum, type Block, type UseAssignment } from '@fs/recipe';
import { useDesignStore } from '../state/design-store';
import { USE_COLORS } from '../viewport/colors';
import { IconButton } from '../components/ui';
import { m2, storeys } from '../lib/format';

function floorIndex(v: number | 'last', n: number) {
  return v === 'last' ? n - 1 : v;
}

/** Uses per floor, step-backs and name of the selected block. */
export function BlockEditor({ block }: { block: Block }) {
  const { t } = useTranslation();
  const recipe = useDesignStore((s) => s.recipe)!;
  const built = useDesignStore((s) => s.build?.blocks.find((b) => b.id === block.id));
  const edit = useDesignStore((s) => s.editRecipe);
  const n = Math.max(1, Math.round(resolveNum(block.floors, recipe.params)));
  const uses = block.uses;
  const setUses = (u: UseAssignment[]) => edit((r) => setBlockUses(r, block.id, u));
  const steps = (block.stepBacks ?? []).map((s) => ({ fromFloor: s.fromFloor, inset: typeof s.inset === 'number' ? s.inset : resolveNum(s.inset, recipe.params) }));

  return (
    <div className="space-y-3 rounded-lg border border-accent/40 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center gap-2">
        <input
          aria-label={t('block.name')}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-line focus:border-accent focus:outline-none"
          defaultValue={block.name}
          key={block.id + block.name}
          onBlur={(e) => e.target.value !== block.name && edit((r) => renameBlock(r, block.id, e.target.value))}
        />
        <IconButton label={t('viewport.duplicate')} onClick={() => useDesignStore.getState().duplicateSelected()}><Copy size={14} /></IconButton>
        <IconButton label={t('viewport.delete')} disabled={recipe.blocks.length <= 1} onClick={() => useDesignStore.getState().deleteSelected()}><Trash2 size={14} /></IconButton>
        <IconButton label={t('app.cancel')} onClick={() => useDesignStore.getState().select(null)}><X size={14} /></IconButton>
      </div>
      {built && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><div className="text-muted">{t('metrics.floors')}</div><div className="font-semibold">{storeys(built.floors)}</div></div>
          <div><div className="text-muted">{t('metrics.height')}</div><div className="font-semibold">{built.heightM.toFixed(1)} m</div></div>
          <div><div className="text-muted">{t('metrics.gfa')}</div><div className="font-semibold">{m2(built.gfaM2)}</div></div>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase text-muted">{t('params.uses')}</h4>
          <button
            className="flex items-center gap-1 text-xs text-accent hover:underline"
            onClick={() => setUses([...uses, { floors: [Math.min(n - 1, 1), 'last'], use: 'office', efficiency: 0.85 }])}
          >
            <Plus size={12} /> {t('block.addUse')}
          </button>
        </div>
        <p className="mb-1.5 text-[11px] text-muted">{t('block.usesHint')}</p>
        <ul className="space-y-1.5">
          {uses.map((u, i) => {
            const from = floorIndex(u.floors[0]!, n);
            const to = u.floors.length > 1 ? floorIndex(u.floors[1]!, n) : from;
            const setRow = (patch: Partial<UseAssignment>) => setUses(uses.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const floorOpts = Array.from({ length: n }, (_, k) => k);
            return (
              <li key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-1 text-xs">
                <span className="h-3 w-3 rounded-sm" style={{ background: USE_COLORS[u.use] }} />
                <select aria-label={t('block.use')} className="rounded border border-line bg-panel px-1 py-0.5" value={u.use} onChange={(e) => setRow({ use: e.target.value as UseAssignment['use'], ...(e.target.value === 'residential' ? { unitMix: u.unitMix ?? { T2: 0.4, T3: 0.45, T4: 0.15 } } : {}) })}>
                  {USES.map((x) => <option key={x} value={x}>{t(`use.${x}`)}</option>)}
                </select>
                <select aria-label={t('block.from')} className="rounded border border-line bg-panel px-1 py-0.5" value={from} onChange={(e) => setRow({ floors: [Number(e.target.value), u.floors[1] === 'last' ? 'last' : Math.max(Number(e.target.value), to)] })}>
                  {floorOpts.map((k) => <option key={k} value={k}>{k === 0 ? 'RDC' : `R+${k}`}</option>)}
                </select>
                <select
                  aria-label={t('block.to')}
                  className="rounded border border-line bg-panel px-1 py-0.5"
                  value={u.floors[1] === 'last' ? 'last' : to}
                  onChange={(e) => setRow({ floors: [from, e.target.value === 'last' ? 'last' : Math.max(from, Number(e.target.value))] })}
                >
                  {floorOpts.map((k) => <option key={k} value={k}>{k === 0 ? 'RDC' : `R+${k}`}</option>)}
                  <option value="last">{t('block.top')}</option>
                </select>
                <button aria-label={t('viewport.delete')} disabled={uses.length <= 1} className="text-muted hover:text-bad disabled:opacity-30" onClick={() => setUses(uses.filter((_, j) => j !== i))}><X size={13} /></button>
                <label className="col-span-5 flex items-center gap-2 pl-4 text-[11px] text-muted">
                  {t('block.efficiency')}
                  <input type="range" min={0.5} max={0.95} step={0.01} value={u.efficiency} onChange={(e) => setRow({ efficiency: Number(e.target.value) })} className="flex-1" />
                  <span className="w-8 tabular-nums">{Math.round(u.efficiency * 100)} %</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted"><Layers2 size={12} /> {t('block.stepBacks')}</h4>
          <button
            className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-40"
            disabled={n < 3 || steps.length >= 3}
            onClick={() => edit((r) => setBlockStepBacks(r, block.id, [...steps, { fromFloor: Math.min(n - 1, (steps.at(-1)?.fromFloor ?? 1) + 2), inset: (steps.at(-1)?.inset ?? 0) + 3 }]))}
          >
            <Plus size={12} /> {t('block.addStepBack')}
          </button>
        </div>
        {steps.length === 0 && <p className="text-[11px] text-muted">{t('block.stepBacksHint')}</p>}
        <ul className="space-y-1">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span>{t('block.fromFloor')}</span>
              <select className="rounded border border-line bg-panel px-1 py-0.5" value={s.fromFloor} onChange={(e) => edit((r) => setBlockStepBacks(r, block.id, steps.map((x, j) => (j === i ? { ...x, fromFloor: Number(e.target.value) } : x))))}>
                {Array.from({ length: Math.max(1, n - 1) }, (_, k) => k + 1).map((k) => <option key={k} value={k}>R+{k}</option>)}
              </select>
              <span>{t('block.inset')}</span>
              <input type="number" min={0.5} max={20} step={0.5} className="w-16 rounded border border-line bg-panel px-1 py-0.5" value={s.inset} onChange={(e) => edit((r) => setBlockStepBacks(r, block.id, steps.map((x, j) => (j === i ? { ...x, inset: Number(e.target.value) } : x))))} />
              <span>m</span>
              <button aria-label={t('viewport.delete')} className="ml-auto text-muted hover:text-bad" onClick={() => edit((r) => setBlockStepBacks(r, block.id, steps.filter((_, j) => j !== i)))}><X size={13} /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
