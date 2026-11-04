import type { Recipe, SiteInput } from '@fs/recipe';

export const rectPlot = (w: number, d: number): SiteInput['plot'] => [[0, 0], [w, 0], [w, d], [0, d]];

export function site(w = 40, d = 30, inset = 0): SiteInput {
  return {
    plot: rectPlot(w, d),
    edgeClasses: ['front', 'side', 'rear', 'side'],
    buildable: [[inset, inset], [w - inset, inset], [w - inset, d - inset], [inset, d - inset]],
  };
}

export function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    schemaVersion: 1,
    optionId: 'opt_test',
    site: { origin: { lon: -17.4677, lat: 14.7167, crs: 'EPSG:32628' }, plotRef: 'plot_test', northAngle: 0 },
    programme: { targetUse: 'mixed', targetGfa: 2000 },
    params: {
      floorsA: { value: 6, min: 1, max: 12, step: 1 },
      groundFloorHeight: { value: 4.5, min: 3, max: 6, step: 0.1 },
      typicalFloorHeight: { value: 3.1, min: 2.8, max: 4, step: 0.1 },
    },
    blocks: [
      {
        id: 'blk_A',
        name: 'Block A',
        footprint: { kind: 'rect', anchor: 'buildable.front-left', width: 24, depth: 16, rotation: 0, offsetU: 0, offsetV: 0 },
        floors: '$params.floorsA',
        floorHeights: { ground: '$params.groundFloorHeight', typical: '$params.typicalFloorHeight' },
        uses: [
          { floors: [0], use: 'retail', efficiency: 0.85 },
          { floors: [1, 'last'], use: 'residential', efficiency: 0.8, unitMix: { T2: 0.4, T3: 0.45, T4: 0.15 } },
        ],
        roof: { kind: 'flat', accessible: true },
      },
    ],
    parking: { kind: 'surface', spaces: 10, area: 'auto' },
    meta: { createdBy: 'user' },
    ...overrides,
  };
}
