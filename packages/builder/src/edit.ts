import { centroid, rotate, roundRing, type Ring, type Vec2 } from '@fs/geometry';
import { missingParams, PARAM_REF, resolveNum, type Block, type NumOrRef, type Recipe, type SiteInput, type UseAssignment } from '@fs/recipe';
import { resolveFootprint } from './footprint.js';
import { siteFrame, toFrame } from './frame.js';

/**
 * Pure recipe edits behind the direct-manipulation tools. They return a new recipe;
 * geometry is never edited directly.
 */
const clone = <T>(v: T): T => structuredClone(v);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function setNum(recipe: Recipe, current: NumOrRef, value: number): NumOrRef {
  if (typeof current === 'string' && PARAM_REF.test(current)) {
    const key = current.slice(8);
    const p = recipe.params[key];
    if (p) {
      recipe.params[key] = { ...p, value: r3(value), min: Math.min(p.min, value), max: Math.max(p.max, value) };
      return current;
    }
  }
  return r3(value);
}

function findBlock(recipe: Recipe, id: string): Block {
  const b = recipe.blocks.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown block ${id}`);
  return b;
}

/** Replaces a block's footprint by explicit vertices (used when a rect is rotated or resized). */
function toPolygon(recipe: Recipe, b: Block, site: SiteInput): Ring {
  const ring = resolveFootprint(b.footprint, recipe.params, site);
  if (!ring) throw new Error(`Block ${b.id}: empty footprint`);
  return ring;
}

function setPolygon(b: Block, ring: Ring) {
  b.footprint = { kind: 'polygon', vertices: roundRing(ring).map((p) => [p[0], p[1]] as [number, number]) };
}

/** Drops params no block references anymore. */
function pruneParams(recipe: Recipe) {
  const used = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'string' && PARAM_REF.test(v)) used.add(v.slice(8));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(recipe.blocks);
  visit(recipe.parking);
  for (const k of Object.keys(recipe.params)) if (!used.has(k)) delete recipe.params[k];
}

export function moveBlock(input: Recipe, site: SiteInput, id: string, dx: number, dy: number): Recipe {
  const recipe = clone(input);
  const b = findBlock(recipe, id);
  const fp = b.footprint;
  if (fp.kind === 'rect') {
    const f = siteFrame(site);
    const du = dx * f.u[0] + dy * f.u[1];
    const dv = dx * f.v[0] + dy * f.v[1];
    fp.offsetU = setNum(recipe, fp.offsetU, resolveNum(fp.offsetU, recipe.params) + du);
    fp.offsetV = setNum(recipe, fp.offsetV, resolveNum(fp.offsetV, recipe.params) + dv);
  } else {
    const ring = toPolygon(recipe, b, site).map((p) => [p[0] + dx, p[1] + dy] as Vec2);
    setPolygon(b, ring);
  }
  recipe.meta = { ...recipe.meta, createdBy: 'user' };
  return recipe;
}

export function rotateBlock(input: Recipe, site: SiteInput, id: string, deg: number, about?: Vec2): Recipe {
  const recipe = clone(input);
  const b = findBlock(recipe, id);
  const ring = toPolygon(recipe, b, site);
  const c = about ?? centroid(ring);
  setPolygon(b, ring.map((p) => rotate(p, (deg * Math.PI) / 180, c)));
  pruneParams(recipe);
  recipe.meta = { ...recipe.meta, createdBy: 'user' };
  return recipe;
}

/**
 * Stretches a footprint along `axis`: points at projection `fixed` stay, the side at `from`
 * moves to `to`. Works for any polygon (rects are converted first).
 */
export function resizeBlock(input: Recipe, site: SiteInput, id: string, axis: Vec2, fixed: number, from: number, to: number): Recipe {
  const recipe = clone(input);
  const b = findBlock(recipe, id);
  const ring = toPolygon(recipe, b, site);
  const k = (to - fixed) / (from - fixed || 1);
  setPolygon(
    b,
    ring.map((p) => {
      const s = p[0] * axis[0] + p[1] * axis[1];
      const ns = fixed + (s - fixed) * k;
      return [p[0] + axis[0] * (ns - s), p[1] + axis[1] * (ns - s)] as Vec2;
    }),
  );
  pruneParams(recipe);
  recipe.meta = { ...recipe.meta, createdBy: 'user' };
  return recipe;
}

export function setBlockFloors(input: Recipe, id: string, floors: number): Recipe {
  const recipe = clone(input);
  const b = findBlock(recipe, id);
  b.floors = setNum(recipe, b.floors, Math.max(1, Math.round(floors)));
  return recipe;
}

export function setBlockUses(input: Recipe, id: string, uses: UseAssignment[]): Recipe {
  const recipe = clone(input);
  findBlock(recipe, id).uses = uses;
  return recipe;
}

export function setBlockStepBacks(input: Recipe, id: string, stepBacks: { fromFloor: number; inset: number }[]): Recipe {
  const recipe = clone(input);
  const b = findBlock(recipe, id);
  if (stepBacks.length) b.stepBacks = stepBacks;
  else delete b.stepBacks;
  return recipe;
}

export function renameBlock(input: Recipe, id: string, name: string): Recipe {
  const recipe = clone(input);
  findBlock(recipe, id).name = name.slice(0, 60) || findBlock(recipe, id).name;
  return recipe;
}

function nextLetter(recipe: Recipe): string {
  const used = new Set(recipe.blocks.map((b) => b.name.replace(/^(Bloc|Block)\s+/, '')));
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(l)) return l;
  return String(recipe.blocks.length + 1);
}

function uniqueId(recipe: Recipe, base: string): string {
  let i = recipe.blocks.length + 1;
  let id = `${base}${i}`;
  while (recipe.blocks.some((b) => b.id === id)) id = `${base}${++i}`;
  return id;
}

const DEFAULT_USES: UseAssignment[] = [
  { floors: [0, 'last'], use: 'residential', efficiency: 0.8, unitMix: { T2: 0.4, T3: 0.45, T4: 0.15 } },
  { floors: [0], use: 'retail', efficiency: 0.85 },
];

/** Adds a 16 × 12 m block, 4 floors, centred in the buildable area and aligned with the front edge. */
export function addBlock(input: Recipe, site: SiteInput): { recipe: Recipe; id: string } {
  const recipe = clone(input);
  const f = siteFrame(site);
  const c = toFrame(f, centroid(site.buildable));
  const w = 16;
  const d = 12;
  const corners: Vec2[] = [
    [c[0] - w / 2, c[1] - d / 2],
    [c[0] + w / 2, c[1] - d / 2],
    [c[0] + w / 2, c[1] + d / 2],
    [c[0] - w / 2, c[1] + d / 2],
  ];
  const ring = corners.map(([u, v]) => [f.origin[0] + u * f.u[0] + v * f.v[0], f.origin[1] + u * f.u[1] + v * f.v[1]] as Vec2);
  const L = nextLetter(recipe);
  const key = `floors${L}`;
  recipe.params[key] = { value: 4, min: 1, max: 20, step: 1, label: `Niveaux ${L}` };
  recipe.params.groundFloorHeight ??= { value: 4.5, min: 3, max: 6, step: 0.1, unit: 'm', label: 'Hauteur RDC' };
  recipe.params.typicalFloorHeight ??= { value: 3.1, min: 2.8, max: 4, step: 0.1, unit: 'm', label: 'Hauteur étage courant' };
  const id = uniqueId(recipe, 'blk_');
  const template = recipe.blocks[0];
  recipe.blocks.push({
    id,
    name: `Bloc ${L}`,
    footprint: { kind: 'polygon', vertices: roundRing(ring).map((p) => [p[0], p[1]] as [number, number]) },
    floors: `$params.${key}`,
    floorHeights: { ground: '$params.groundFloorHeight', typical: '$params.typicalFloorHeight' },
    uses: clone(template?.uses ?? DEFAULT_USES),
    roof: { kind: 'flat', accessible: false },
  });
  return { recipe, id };
}

export function duplicateBlock(input: Recipe, site: SiteInput, srcId: string, offset: Vec2 = [6, 6]): { recipe: Recipe; id: string } {
  const recipe = clone(input);
  const src = findBlock(recipe, srcId);
  const ring = toPolygon(recipe, src, site).map((p) => [p[0] + offset[0], p[1] + offset[1]] as Vec2);
  const L = nextLetter(recipe);
  const key = `floors${L}`;
  recipe.params[key] = { value: resolveNum(src.floors, recipe.params), min: 1, max: 20, step: 1, label: `Niveaux ${L}` };
  const id = uniqueId(recipe, 'blk_');
  const copy: Block = { ...clone(src), id, name: `Bloc ${L}`, floors: `$params.${key}` };
  setPolygon(copy, ring);
  recipe.blocks.push(copy);
  return { recipe, id };
}

export function deleteBlock(input: Recipe, id: string): Recipe {
  const recipe = clone(input);
  recipe.blocks = recipe.blocks.filter((b) => b.id !== id);
  pruneParams(recipe);
  if (missingParams(recipe).length) throw new Error('Inconsistent params after delete');
  return recipe;
}
