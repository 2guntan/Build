import { describe, expect, it, vi } from 'vitest';
import { build } from '@fs/builder';
import { evaluate, findZone, TEST_RULESET } from '@fs/rules';
import { computeYield } from '@fs/yield';

// The worker runs the shared packages; here we call them directly through a fake worker.
vi.mock('../src/workers/client', () => ({
  buildWorker: () => ({
    evaluate: async (recipe: never, site: never, zone: never, a: never) => {
      const br = build(recipe, site);
      const y = computeYield(br, a);
      return { build: br, compliance: zone ? evaluate(zone, br, { plot: (site as { plot: never }).plot, edgeClasses: (site as { edgeClasses: never }).edgeClasses }) : null, yield: y, ms: 1 };
    },
  }),
}));
vi.mock('../src/state/saver', () => ({ scheduleSave: vi.fn() }));

import { useDesignStore } from '../src/state/design-store';
import { scheduleSave } from '../src/state/saver';
import { baseRecipe, site } from '../../../packages/builder/test/helpers';

describe('design store: slider → worker → panels', () => {
  it('rebuilds on param change, keeps an undo stack and schedules a debounced save', async () => {
    const s = useDesignStore.getState();
    s.load({ optionId: 'o', headId: 'v1', recipe: baseRecipe(), site: site(40, 30, 5), zone: findZone(TEST_RULESET, 'test-r'), assumptions: {}, origin: { lat: 14.7, lon: -17.4 } });
    await vi.waitFor(() => expect(useDesignStore.getState().build).not.toBeNull());
    expect(useDesignStore.getState().build!.totals.gfaM2).toBe(2304);
    useDesignStore.getState().setParam('floorsA', 3);
    await vi.waitFor(() => expect(useDesignStore.getState().build!.totals.gfaM2).toBe(1152));
    expect(useDesignStore.getState().compliance!.results.length).toBeGreaterThan(0);
    expect(useDesignStore.getState().undo).toHaveLength(1);
    expect(scheduleSave).toHaveBeenCalledWith('slider');
    const prev = useDesignStore.getState().localUndo();
    expect(prev!.params.floorsA!.value).toBe(6);
  });
});
