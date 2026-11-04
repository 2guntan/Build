import { area, extrudeRing, hashValue, normalizeRing, roundRing, roundTo } from '@fs/geometry';
import {
  resolveNum,
  type Block,
  type BlockResult,
  type BuildResult,
  type FloorSelector,
  type Recipe,
  type SiteInput,
  type StoreyResult,
  type Use,
} from '@fs/recipe';
import { resolveFootprint } from './footprint.js';

export const BUILDER_VERSION = '1.0.0';
/** Area of one surface parking space including circulation, m². */
export const SURFACE_PARKING_M2_PER_SPACE = 25;

export interface BuildOptions {
  /** Skip mesh generation (used by the solver for speed). */
  mesh?: boolean;
}

function matches(sel: FloorSelector, i: number, n: number): boolean {
  const idx = sel.map((s) => (s === 'last' ? n - 1 : s));
  if (idx.length === 1) return idx[0] === i;
  return i >= idx[0]! && i <= idx[1]!;
}

function buildBlock(block: Block, recipe: Recipe, site: SiteInput, withMesh: boolean): BlockResult {
  const fp = resolveFootprint(block.footprint, recipe.params, site);
  if (!fp || fp.length < 3) throw new Error(`Block ${block.id}: empty footprint`);
  const footprint = roundRing(fp);
  const fpArea = area(footprint);
  const floors = Math.max(0, Math.round(resolveNum(block.floors, recipe.params)));
  const gh = resolveNum(block.floorHeights.ground, recipe.params);
  const th = resolveNum(block.floorHeights.typical, recipe.params);
  const storeys: StoreyResult[] = [];
  let z = 0;
  for (let i = 0; i < floors; i++) {
    const h = i === 0 ? gh : th;
    let use: Use | 'unassigned' = 'unassigned';
    let efficiency = 0;
    let unitMix: StoreyResult['unitMix'];
    for (const u of block.uses) {
      if (matches(u.floors, i, floors)) {
        use = u.use;
        efficiency = u.efficiency;
        unitMix = u.unitMix;
      }
    }
    const s: StoreyResult = {
      index: i,
      elevationM: roundTo(z),
      heightM: roundTo(h),
      areaM2: roundTo(fpArea, 0.01),
      use,
      efficiency,
    };
    if (unitMix) s.unitMix = unitMix;
    storeys.push(s);
    z += h;
  }
  const heightM = roundTo(z);
  const gfaM2 = roundTo(
    storeys.filter((s) => s.use !== 'parking').reduce((a, s) => a + s.areaM2, 0),
    0.01,
  );
  const res: BlockResult = {
    id: block.id,
    name: block.name,
    footprint,
    footprintAreaM2: roundTo(fpArea, 0.01),
    storeys,
    floors,
    heightM,
    gfaM2,
  };
  if (withMesh && heightM > 0) res.mesh = extrudeRing(footprint, 0, heightM);
  return res;
}

/** Recipe + site → geometry. Pure and deterministic. */
export function build(recipe: Recipe, site: SiteInput, opts: BuildOptions = {}): BuildResult {
  const withMesh = opts.mesh ?? true;
  const errors: string[] = [];
  const blocks: BlockResult[] = [];
  for (const b of recipe.blocks) {
    try {
      blocks.push(buildBlock(b, recipe, site, withMesh));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  const gfaByUse: BuildResult['totals']['gfaByUse'] = {};
  for (const b of blocks) {
    for (const s of b.storeys) gfaByUse[s.use] = roundTo((gfaByUse[s.use] ?? 0) + s.areaM2, 0.01);
  }
  let spaces = 0;
  try {
    spaces = Math.max(0, Math.round(resolveNum(recipe.parking.spaces, recipe.params)));
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  const surface =
    recipe.parking.kind === 'surface'
      ? recipe.parking.area === 'auto'
        ? spaces * SURFACE_PARKING_M2_PER_SPACE
        : recipe.parking.area
      : 0;
  const totals = {
    plotAreaM2: roundTo(area(normalizeRing(site.plot)), 0.01),
    footprintAreaM2: roundTo(
      blocks.reduce((a, b) => a + b.footprintAreaM2, 0),
      0.01,
    ),
    gfaM2: roundTo(
      blocks.reduce((a, b) => a + b.gfaM2, 0),
      0.01,
    ),
    gfaByUse,
    maxHeightM: blocks.reduce((m, b) => Math.max(m, b.heightM), 0),
    maxFloors: blocks.reduce((m, b) => Math.max(m, b.floors), 0),
    parkingSpaces: recipe.parking.kind === 'none' ? 0 : spaces,
    parkingSurfaceAreaM2: roundTo(surface, 0.01),
  };
  const inputHash = hashValue({ v: BUILDER_VERSION, recipe, site });
  const hash = hashValue({
    v: BUILDER_VERSION,
    blocks: blocks.map((b) => ({ ...b, mesh: undefined })),
    totals,
  });
  return { builderVersion: BUILDER_VERSION, inputHash, hash, blocks, totals, errors };
}
