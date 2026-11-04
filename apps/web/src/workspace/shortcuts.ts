import { useEffect } from 'react';
import { useDesignStore } from '../state/design-store';
import { useViewStore } from '../state/view-store';
import type { ViewPreset } from '../viewport/ViewportManager';

const VIEWS: ViewPreset[] = ['iso', 'top', 'south', 'east', 'north', 'west'];

export interface ShortcutHandlers {
  undo: () => void;
  redo: () => void;
  palette: () => void;
  help: () => void;
}

/** Workspace keyboard shortcuts. Ignored while typing in a field. */
export function useWorkspaceShortcuts(h: ShortcutHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        return h.palette();
      }
      if (typing) return;
      const d = useDesignStore.getState();
      const v = useViewStore.getState();
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? h.redo() : h.undo();
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return h.redo();
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        return d.duplicateSelected();
      }
      if (mod) return;
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          return d.deleteSelected();
        case 'Escape':
          v.set('editMode', 'select');
          return d.select(null);
        case 'v':
        case 'V':
          return v.set('editMode', 'select');
        case 'g':
        case 'G':
          return v.set('editMode', 'move');
        case 'r':
        case 'R':
          return v.set('editMode', 'rotate');
        case 'b':
        case 'B':
          return d.addBlock();
        case 'f':
        case 'F':
          return v.frame();
        case '?':
          return h.help();
        default:
          if (/^[1-6]$/.test(e.key)) v.view(VIEWS[Number(e.key) - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h]);
}

export const SHORTCUTS: [string, string][] = [
  ['V', 'shortcuts.select'],
  ['G', 'shortcuts.move'],
  ['R', 'shortcuts.rotate'],
  ['B', 'shortcuts.add'],
  ['Ctrl+D', 'shortcuts.duplicate'],
  ['Suppr', 'shortcuts.delete'],
  ['Ctrl+Z', 'shortcuts.undo'],
  ['Ctrl+Shift+Z', 'shortcuts.redo'],
  ['F', 'shortcuts.frame'],
  ['1–6', 'shortcuts.views'],
  ['Échap', 'shortcuts.deselect'],
  ['Ctrl+K', 'shortcuts.palette'],
  ['?', 'shortcuts.help'],
];
