import { create } from 'zustand';
import type { BasemapKind } from '../viewport/TileGround';
import type { MassingStyle } from '../viewport/MassingLayer';
import type { EditMode } from '../viewport/EditControls';
import type { ViewPreset } from '../viewport/ViewportManager';

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(`view:${k}`);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(`view:${k}`, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Per-viewer display preferences (remembered locally). */
interface ViewState {
  basemap: BasemapKind;
  style: MassingStyle;
  labels: boolean;
  grid: boolean;
  dark: boolean;
  quality: 'auto' | 'high' | 'low';
  editMode: EditMode;
  /** One-shot camera command consumed by the viewport. */
  command: { kind: 'view'; preset: ViewPreset; n: number } | { kind: 'frame'; n: number } | { kind: 'screenshot'; n: number } | null;
  set<K extends 'basemap' | 'style' | 'labels' | 'grid' | 'dark' | 'quality' | 'editMode'>(k: K, v: ViewState[K]): void;
  view(preset: ViewPreset): void;
  frame(): void;
  screenshot(): void;
}

let n = 0;
export const useViewStore = create<ViewState>((set) => ({
  basemap: load('basemap', 'satellite'),
  style: load('style', 'realistic'),
  labels: load('labels', true),
  grid: load('grid', true),
  dark: load('dark', false),
  quality: load('quality', 'auto'),
  editMode: 'select',
  command: null,
  set(k, v) {
    if (k !== 'editMode') save(k, v);
    set({ [k]: v } as Partial<ViewState>);
    if (k === 'dark') document.documentElement.classList.toggle('dark', v as boolean);
  },
  view: (preset) => set({ command: { kind: 'view', preset, n: ++n } }),
  frame: () => set({ command: { kind: 'frame', n: ++n } }),
  screenshot: () => set({ command: { kind: 'screenshot', n: ++n } }),
}));

document.documentElement.classList.toggle('dark', useViewStore.getState().dark);
