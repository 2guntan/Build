import { create } from 'zustand';
import { setParams, type BuildResult, type Recipe, type SiteInput } from '@fs/recipe';
import type { Evaluation, Zone } from '@fs/rules';
import type { ContextPrism } from '@fs/sun';
import type { YieldAssumptions, YieldResult } from '@fs/yield';
import { buildWorker } from '../workers/client';
import { scheduleSave } from './saver';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'error';

export interface DesignState {
  optionId: string | null;
  headId: string | null;
  site: SiteInput | null;
  zone: Zone | null;
  assumptions: Partial<YieldAssumptions>;
  context: ContextPrism[];
  origin: { lat: number; lon: number } | null;
  recipe: Recipe | null;
  build: BuildResult | null;
  compliance: Evaluation | null;
  yield: YieldResult | null;
  lastBuildMs: number;
  selection: string | null;
  highlight: string[];
  /** Local undo stack of recipes (last 50); the server head stays the source of truth. */
  undo: Recipe[];
  redo: Recipe[];
  saveState: SaveState;
  load(a: {
    optionId: string;
    headId: string | null;
    recipe: Recipe | null;
    site: SiteInput;
    zone: Zone | null;
    assumptions: Partial<YieldAssumptions>;
    origin: { lat: number; lon: number };
  }): void;
  setContext(c: ContextPrism[]): void;
  setAssumptions(a: Partial<YieldAssumptions>): void;
  setParam(key: string, value: number): void;
  setRecipe(r: Recipe, opts?: { save?: boolean; pushUndo?: boolean }): void;
  setHead(id: string | null): void;
  setSaveState(s: SaveState): void;
  select(id: string | null): void;
  setHighlight(ids: string[]): void;
  localUndo(): Recipe | null;
  localRedo(): Recipe | null;
}

let evalSeq = 0;

export const useDesignStore = create<DesignState>((set, get) => {
  const reevaluate = async () => {
    const { recipe, site, zone, assumptions } = get();
    if (!recipe || !site) return;
    const seq = ++evalSeq;
    const out = await buildWorker().evaluate(recipe, site, zone, assumptions);
    if (seq !== evalSeq) return; // a newer edit superseded this one
    set({ build: out.build, compliance: out.compliance, yield: out.yield, lastBuildMs: out.ms });
  };

  return {
    optionId: null,
    headId: null,
    site: null,
    zone: null,
    assumptions: {},
    context: [],
    origin: null,
    recipe: null,
    build: null,
    compliance: null,
    yield: null,
    lastBuildMs: 0,
    selection: null,
    highlight: [],
    undo: [],
    redo: [],
    saveState: 'idle',

    load(a) {
      set({ ...a, build: null, compliance: null, yield: null, undo: [], redo: [], selection: null, highlight: [], saveState: 'idle' });
      void reevaluate();
    },
    setContext(c) {
      set({ context: c });
    },
    setAssumptions(a) {
      set({ assumptions: a });
      void reevaluate();
    },
    setParam(key, value) {
      const r = get().recipe;
      if (!r) return;
      const next = setParams(r, { [key]: value });
      get().setRecipe({ ...next, meta: { ...next.meta, createdBy: 'slider' } }, { save: true, pushUndo: true });
    },
    setRecipe(r, opts = {}) {
      const prev = get().recipe;
      if (opts.pushUndo && prev) set({ undo: [...get().undo.slice(-49), prev], redo: [] });
      set({ recipe: r });
      void reevaluate();
      if (opts.save) scheduleSave(r.meta.createdBy === 'slider' ? 'slider' : 'user');
    },
    setHead(id) {
      set({ headId: id });
    },
    setSaveState(s) {
      set({ saveState: s });
    },
    select(id) {
      set({ selection: id });
    },
    setHighlight(ids) {
      set({ highlight: ids });
    },
    localUndo() {
      const { undo, recipe } = get();
      const prev = undo[undo.length - 1];
      if (!prev || !recipe) return null;
      set({ undo: undo.slice(0, -1), redo: [...get().redo, recipe] });
      return prev;
    },
    localRedo() {
      const { redo, recipe } = get();
      const next = redo[redo.length - 1];
      if (!next || !recipe) return null;
      set({ redo: redo.slice(0, -1), undo: [...get().undo, recipe] });
      return next;
    },
  };
});
