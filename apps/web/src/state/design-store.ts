import { create } from 'zustand';
import { setParams, type BuildResult, type Recipe, type SiteInput } from '@fs/recipe';
import { addBlock, deleteBlock, duplicateBlock, moveBlock, resizeBlock, rotateBlock, setBlockFloors } from '@fs/builder';
import type { EditEvent } from '../viewport/EditControls';
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
  /** Data sources of the context buildings (for attribution). */
  contextSources: string[];
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
  /** Candidate shown as a translucent preview (agent proposals). */
  ghost: BuildResult | null;
  ghostId: string | null;
  setGhost(id: string | null, recipe: Recipe | null): void;
  applyEdit(e: EditEvent): void;
  addBlock(): void;
  duplicateSelected(): void;
  deleteSelected(): void;
  editRecipe(f: (r: Recipe) => Recipe): void;
  load(a: {
    optionId: string;
    headId: string | null;
    recipe: Recipe | null;
    site: SiteInput;
    zone: Zone | null;
    assumptions: Partial<YieldAssumptions>;
    origin: { lat: number; lon: number };
  }): void;
  setContext(c: ContextPrism[], sources?: string[]): void;
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
    contextSources: [],
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
    ghost: null,
    ghostId: null,

    async setGhost(id, recipe) {
      const site = get().site;
      if (!id || !recipe || !site) return set({ ghost: null, ghostId: null });
      set({ ghostId: id });
      const br = await buildWorker().build(recipe, site);
      if (get().ghostId === id) set({ ghost: br });
    },
    editRecipe(f) {
      const r = get().recipe;
      if (!r) return;
      try {
        const next = f(r);
        get().setRecipe({ ...next, meta: { ...next.meta, createdBy: 'user' } }, { save: true, pushUndo: true });
      } catch (err) {
        console.warn('edit rejected', err);
      }
    },
    applyEdit(e) {
      const site = get().site;
      if (!site) return;
      get().editRecipe((r) => {
        switch (e.type) {
          case 'move':
            return moveBlock(r, site, e.blockId, e.dx, e.dy);
          case 'rotate':
            return rotateBlock(r, site, e.blockId, e.deg, e.about);
          case 'resize':
            return resizeBlock(r, site, e.blockId, e.axis, e.fixed, e.from, e.to);
          case 'floors':
            return setBlockFloors(r, e.blockId, e.floors);
        }
      });
    },
    addBlock() {
      const { recipe, site } = get();
      if (!recipe || !site) return;
      const res = addBlock(recipe, site);
      get().setRecipe(res.recipe, { save: true, pushUndo: true });
      set({ selection: res.id });
    },
    duplicateSelected() {
      const { recipe, site, selection } = get();
      if (!recipe || !site || !selection) return;
      const res = duplicateBlock(recipe, site, selection);
      get().setRecipe(res.recipe, { save: true, pushUndo: true });
      set({ selection: res.id });
    },
    deleteSelected() {
      const { recipe, selection } = get();
      if (!recipe || !selection || recipe.blocks.length <= 1) return;
      get().setRecipe(deleteBlock(recipe, selection), { save: true, pushUndo: true });
      set({ selection: null });
    },

    load(a) {
      set({ ...a, build: null, compliance: null, yield: null, undo: [], redo: [], selection: null, highlight: [], saveState: 'idle' });
      void reevaluate();
    },
    setContext(c, sources = []) {
      set({ context: c, contextSources: sources });
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
