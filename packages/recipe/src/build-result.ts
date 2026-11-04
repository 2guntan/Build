import type { Use, UnitType } from './schema.js';

export type Vec2 = readonly [number, number];
export type EdgeClass = 'front' | 'side' | 'rear';

/** Everything the builder needs besides the recipe. All coordinates are local metres. */
export interface SiteInput {
  /** Plot boundary, counter-clockwise, no closing vertex. */
  plot: Vec2[];
  /** Class of edge i (from vertex i to i+1). */
  edgeClasses: EdgeClass[];
  /** Buildable area computed by the rules engine for the plot's zone. */
  buildable: Vec2[];
}

export interface StoreyResult {
  index: number;
  elevationM: number;
  heightM: number;
  areaM2: number;
  use: Use | 'unassigned';
  efficiency: number;
  unitMix?: Partial<Record<UnitType, number>>;
}

export interface BlockMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface BlockResult {
  id: string;
  name: string;
  footprint: Vec2[];
  footprintAreaM2: number;
  storeys: StoreyResult[];
  floors: number;
  heightM: number;
  gfaM2: number;
  mesh?: BlockMesh;
}

export interface BuildTotals {
  plotAreaM2: number;
  footprintAreaM2: number;
  gfaM2: number;
  gfaByUse: Partial<Record<Use | 'unassigned', number>>;
  maxHeightM: number;
  maxFloors: number;
  parkingSpaces: number;
  parkingSurfaceAreaM2: number;
}

export interface BuildResult {
  builderVersion: string;
  /** Hash of the inputs (recipe, plot, buildable area). */
  inputHash: string;
  /** Hash of the rounded geometric output. */
  hash: string;
  blocks: BlockResult[];
  totals: BuildTotals;
  errors: string[];
}
