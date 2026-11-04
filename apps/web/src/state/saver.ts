import { del, get as idbGet, set as idbSet } from 'idb-keyval';
import type { Recipe } from '@fs/recipe';
import { api, ApiError } from '../api/client';
import { useDesignStore } from './design-store';

export const SAVE_DEBOUNCE_MS = 800;

let timer: ReturnType<typeof setTimeout> | null = null;
let kind: 'slider' | 'user' = 'user';
let inflight: Promise<void> | null = null;

interface Pending {
  optionId: string;
  recipe: Recipe;
  authorKind: 'slider' | 'user';
  parentId: string | null;
}

const key = (optionId: string) => `pending:${optionId}`;

/**
 * Debounced save. Consecutive slider moves within the debounce window are squashed
 * into a single version on the client; the server always appends a new version.
 */
export function scheduleSave(k: 'slider' | 'user') {
  kind = k;
  useDesignStore.getState().setSaveState('pending');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
}

async function persistPending(p: Pending) {
  try {
    await idbSet(key(p.optionId), p);
  } catch {
    /* IndexedDB unavailable (private mode): keep in memory only */
  }
}

export async function flush(): Promise<void> {
  if (inflight) await inflight;
  const s = useDesignStore.getState();
  if (!s.optionId || !s.recipe) return;
  const p: Pending = { optionId: s.optionId, recipe: s.recipe, authorKind: kind, parentId: s.headId };
  await persistPending(p);
  inflight = send(p).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function send(p: Pending) {
  const st = useDesignStore.getState();
  st.setSaveState('saving');
  try {
    const res = await api<{ version: { id: string } }>(`/options/${p.optionId}/versions`, {
      method: 'POST',
      body: { recipe: p.recipe, authorKind: p.authorKind, parentId: p.parentId },
    });
    if (useDesignStore.getState().optionId === p.optionId) useDesignStore.getState().setHead(res.version.id);
    await del(key(p.optionId)).catch(() => undefined);
    useDesignStore.getState().setSaveState('saved');
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      // Someone moved the head: save on top of the latest head instead of failing.
      const latest = await api<{ option: { headVersionId: string | null } }>(`/options/${p.optionId}`);
      return send({ ...p, parentId: latest.option.headVersionId });
    }
    useDesignStore.getState().setSaveState(e instanceof ApiError ? 'error' : 'offline');
  }
}

/** Re-sends edits stored while offline. Called on load and when the browser goes back online. */
export async function syncPending(optionId: string): Promise<Recipe | null> {
  try {
    const p = (await idbGet(key(optionId))) as Pending | undefined;
    if (!p) return null;
    await send(p);
    return p.recipe;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const id = useDesignStore.getState().optionId;
    if (id) void syncPending(id);
  });
}
