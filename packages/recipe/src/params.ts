import { PARAM_REF, type NumOrRef, type Recipe } from './schema.js';

export class ParamResolutionError extends Error {}

export function resolveNum(v: NumOrRef, params: Recipe['params']): number {
  if (typeof v === 'number') return v;
  if (!PARAM_REF.test(v)) throw new ParamResolutionError(`Invalid reference ${v}`);
  const key = v.slice('$params.'.length);
  const p = params[key];
  if (!p) throw new ParamResolutionError(`Unknown param ${key}`);
  return p.value;
}

/** Returns a copy of the recipe with param values replaced; values are clamped to bounds. */
export function setParams(recipe: Recipe, values: Record<string, number>): Recipe {
  const params = { ...recipe.params };
  for (const [k, v] of Object.entries(values)) {
    const p = params[k];
    if (!p) throw new ParamResolutionError(`Unknown param ${k}`);
    const clamped = Math.min(p.max, Math.max(p.min, v));
    const stepped = p.min + Math.round((clamped - p.min) / p.step) * p.step;
    params[k] = { ...p, value: Number(Math.min(p.max, stepped).toFixed(6)) };
  }
  return { ...recipe, params };
}

/** Lists params that are referenced but undefined. */
export function missingParams(recipe: Recipe): string[] {
  const refs = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'string' && PARAM_REF.test(v)) refs.add(v.slice(8));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(recipe.blocks);
  visit(recipe.parking);
  return [...refs].filter((k) => !recipe.params[k]).sort();
}
