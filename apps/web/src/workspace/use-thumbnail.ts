import { useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useDesignStore } from '../state/design-store';

/** After a save settles, renders a 3D snapshot of the design and stores it as the option thumbnail. */
export function useThumbnailUpload(optionId: string | null) {
  const saveState = useDesignStore((s) => s.saveState);
  const build = useDesignStore((s) => s.build);
  const last = useRef<string>('');
  useEffect(() => {
    if (!optionId || !build || (saveState !== 'saved' && saveState !== 'idle')) return;
    const key = `${optionId}:${build.hash}`;
    if (key === last.current) return;
    const t = setTimeout(async () => {
      const d = useDesignStore.getState();
      if (!d.site || !d.build) return;
      try {
        const { renderThumbnail } = await import('../viewport/thumbnail');
        const png = renderThumbnail({ build: d.build, plot: d.site.plot, buildable: d.site.buildable, context: d.context, width: 480, height: 320 });
        await api(`/options/${optionId}/thumbnail`, { method: 'PUT', body: { png } });
        last.current = key;
      } catch {
        /* thumbnails are best-effort */
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [optionId, build, saveState]);
}
