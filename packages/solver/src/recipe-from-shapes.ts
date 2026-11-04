import { roundRing, type Vec2 } from '@fs/geometry';
import { makeId, type Recipe, type UseAssignment, type Use } from '@fs/recipe';
import { DEFAULT_EFFICIENCY, type Intent } from './intent.js';

export interface RecipeBase {
  optionId: string;
  origin: { lon: number; lat: number; crs: string };
  plotRef: string;
  northAngle?: number;
}

export interface ShapeRecipeArgs {
  base: RecipeBase;
  intent: Intent;
  template: string;
  shapes: Vec2[][];
  floors: number;
  maxFloors: number;
  groundHeightM: number;
  typicalHeightM: number;
  parking: Recipe['parking'];
}

export function usesFor(intent: Intent): UseAssignment[] {
  const main: Use = intent.targetUse === 'mixed' ? 'residential' : (intent.targetUse as Use);
  const ground: Use = intent.groundFloorUse ?? (intent.targetUse === 'mixed' ? 'retail' : main);
  const mainUse: UseAssignment = { floors: [0, 'last'], use: main, efficiency: DEFAULT_EFFICIENCY[main] };
  if (main === 'residential') mainUse.unitMix = intent.unitMix ?? { T2: 0.4, T3: 0.45, T4: 0.15 };
  const out: UseAssignment[] = [mainUse];
  if (ground !== main) out.push({ floors: [0], use: ground, efficiency: DEFAULT_EFFICIENCY[ground] });
  return out;
}

export function recipeFromShapes(a: ShapeRecipeArgs): Recipe {
  const letters = 'ABCDEF';
  const params: Recipe['params'] = {
    groundFloorHeight: { value: a.groundHeightM, min: 3, max: 6, step: 0.1, unit: 'm', label: 'RDC' },
    typicalFloorHeight: { value: a.typicalHeightM, min: 2.8, max: 4, step: 0.1, unit: 'm', label: 'Étage courant' },
  };
  const blocks: Recipe['blocks'] = a.shapes.map((shape, i) => {
    const L = letters[i] ?? String(i);
    const key = `floors${L}`;
    params[key] = { value: a.floors, min: 1, max: Math.max(a.floors, a.maxFloors), step: 1, label: `Niveaux ${L}` };
    return {
      id: makeId('blk', `${a.base.optionId}:${a.template}:${i}`),
      name: `Bloc ${L}`,
      footprint: { kind: 'polygon', vertices: roundRing(shape).map((p) => [p[0], p[1]] as [number, number]) },
      floors: `$params.${key}`,
      floorHeights: { ground: '$params.groundFloorHeight', typical: '$params.typicalFloorHeight' },
      uses: usesFor(a.intent),
      roof: { kind: 'flat', accessible: false },
    };
  });
  const programme: Recipe['programme'] = { targetUse: a.intent.targetUse as Recipe['programme']['targetUse'] };
  if (a.intent.targetGfa) programme.targetGfa = a.intent.targetGfa;
  return {
    schemaVersion: 1,
    optionId: a.base.optionId,
    site: { origin: a.base.origin, plotRef: a.base.plotRef, northAngle: a.base.northAngle ?? 0 },
    programme,
    params,
    blocks,
    parking: a.parking,
    meta: { createdBy: 'solver', template: a.template },
  };
}
