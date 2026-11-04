import { describe, expect, it } from 'vitest';
import { area } from '@fs/geometry';
import { addBlock, build, deleteBlock, duplicateBlock, moveBlock, resizeBlock, rotateBlock, setBlockFloors } from '../src/index.js';
import { baseRecipe, site } from './helpers.js';

const s = site(40, 30, 5);

describe('direct-edit recipe operations', () => {
  it('moves a rect block through its offsets (keeps it a rect)', () => {
    const r = moveBlock(baseRecipe(), s, 'blk_A', 2, 1.5);
    expect(r.blocks[0]!.footprint.kind).toBe('rect');
    expect(build(r, s).blocks[0]!.footprint[0]).toEqual([7, 6.5]);
  });
  it('rotates around the centroid without changing area', () => {
    const r = rotateBlock(baseRecipe(), s, 'blk_A', 90);
    const b = build(r, s).blocks[0]!;
    expect(r.blocks[0]!.footprint.kind).toBe('polygon');
    expect(b.footprintAreaM2).toBeCloseTo(384, 1);
  });
  it('stretches along an axis keeping the opposite side', () => {
    // Rect from x=5 to 29: drag the east side from 29 to 33.
    const r = resizeBlock(baseRecipe(), s, 'blk_A', [1, 0], 5, 29, 33);
    const b = build(r, s).blocks[0]!;
    expect(b.footprintAreaM2).toBeCloseTo(28 * 16, 1);
    expect(Math.min(...b.footprint.map((p) => p[0]))).toBeCloseTo(5, 3);
  });
  it('sets floors through the param and widens its bounds', () => {
    const r = setBlockFloors(baseRecipe(), 'blk_A', 15);
    expect(r.params.floorsA!.value).toBe(15);
    expect(r.params.floorsA!.max).toBe(15);
  });
  it('adds, duplicates and deletes blocks with their params', () => {
    const a = addBlock(baseRecipe(), s);
    expect(a.recipe.blocks).toHaveLength(2);
    expect(a.recipe.params.floorsB).toBeDefined();
    const d = duplicateBlock(a.recipe, s, a.id);
    expect(d.recipe.blocks).toHaveLength(3);
    expect(area(build(d.recipe, s).blocks[2]!.footprint)).toBeCloseTo(192, 1);
    const del = deleteBlock(d.recipe, a.id);
    expect(del.blocks).toHaveLength(2);
    expect(del.params.floorsB).toBeUndefined();
  });
});
