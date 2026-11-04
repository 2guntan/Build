import { Recipe, RECIPE_SCHEMA_VERSION, type Recipe as RecipeT } from './schema.js';

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a document from version n to n+1. */
const migrations: Record<number, Migration> = {
  // v0 (pre-release drafts without schemaVersion) → v1
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
};

export class RecipeSchemaError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Upgrades any known recipe version to the current one and validates it. */
export function migrateRecipe(input: unknown): RecipeT {
  if (!input || typeof input !== 'object') throw new RecipeSchemaError('Recipe must be an object', []);
  let doc = input as Record<string, unknown>;
  let v = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (v > RECIPE_SCHEMA_VERSION) {
    throw new RecipeSchemaError(`Recipe schemaVersion ${v} is newer than supported`, []);
  }
  while (v < RECIPE_SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new RecipeSchemaError(`No migration from schemaVersion ${v}`, []);
    doc = m(doc);
    v += 1;
  }
  return parseRecipe(doc);
}

export function parseRecipe(input: unknown): RecipeT {
  const r = Recipe.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new RecipeSchemaError('Recipe does not match schema', issues);
  }
  return r.data;
}
