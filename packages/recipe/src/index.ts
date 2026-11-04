import { z } from 'zod';
import { Recipe } from './schema.js';

export * from './schema.js';
export * from './build-result.js';
export * from './params.js';
export * from './migrations.js';

/** JSON Schema of the recipe, used for Claude tool definitions. */
export function recipeJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(Recipe, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

/** Short id generator with an injectable source so callers stay deterministic. */
export function makeId(prefix: string, seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}_${(h >>> 0).toString(36)}`;
}
