import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { polygon4326 } from './geometry.js';

const id = (prefix: string) =>
  text('id')
    .primaryKey()
    .$defaultFn(() => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/* ---------- Better Auth (camelCase columns as its adapter expects) ---------- */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/* ---------- Tenancy ---------- */
export const organization = pgTable('organization', {
  id: id('org'),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('pilot'),
  createdAt: createdAt(),
});

export const membership = pgTable(
  'membership',
  {
    id: id('mem'),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('membership_org_user').on(t.orgId, t.userId)],
);

/* ---------- Jurisdictions ---------- */
export const jurisdiction = pgTable('jurisdiction', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  defaultCrs: text('default_crs').notNull(),
});

export const ruleSet = pgTable(
  'rule_set',
  {
    id: id('rs'),
    jurisdictionId: text('jurisdiction_id')
      .notNull()
      .references(() => jurisdiction.id),
    version: text('version').notNull(),
    content: jsonb('content').notNull(),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    isTest: boolean('is_test').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('rule_set_version').on(t.jurisdictionId, t.version),
    index('rule_set_content_gin').using('gin', sql`${t.content} jsonb_path_ops`),
  ],
);

/* ---------- Projects & site ---------- */
export const project = pgTable(
  'project',
  {
    id: id('prj'),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    jurisdictionId: text('jurisdiction_id')
      .notNull()
      .references(() => jurisdiction.id),
    ruleSetId: text('rule_set_id').references(() => ruleSet.id),
    currency: text('currency').notNull().default('XOF'),
    locale: text('locale').notNull().default('fr'),
    archived: boolean('archived').notNull().default(false),
    createdBy: text('created_by').references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index('project_org').on(t.orgId)],
);

export const plot = pgTable(
  'plot',
  {
    id: id('plot'),
    projectId: text('project_id')
      .notNull()
      .unique()
      .references(() => project.id, { onDelete: 'cascade' }),
    geom: polygon4326('geom').notNull(),
    zoneId: text('zone_id'),
    edgeClasses: jsonb('edge_classes').$type<('front' | 'side' | 'rear')[]>().notNull().default([]),
    areaM2: doublePrecision('area_m2').generatedAlwaysAs(sql`ST_Area(ST_Transform(geom, 32628))`),
    originLon: doublePrecision('origin_lon').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    crs: text('crs').notNull().default('EPSG:32628'),
    source: text('source', { enum: ['drawn', 'imported'] }).notNull().default('drawn'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('plot_geom_gist').using('gist', t.geom)],
);

const buildingCols = {
  geom: polygon4326('geom').notNull(),
  heightM: real('height_m').notNull(),
  heightSource: text('height_source', { enum: ['measured', 'estimated', 'default', 'user'] }).notNull(),
  dataSource: text('data_source').notNull(),
  confidence: real('confidence'),
};

export const contextBuilding = pgTable(
  'context_building',
  {
    id: id('cb'),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    ...buildingCols,
    deleted: boolean('deleted').notNull().default(false),
  },
  (t) => [index('context_building_geom_gist').using('gist', t.geom), index('context_building_project').on(t.projectId)],
);

/** Pre-loaded regional extract (Open Buildings, Overture, OSM). No project id. */
export const refBuilding = pgTable(
  'ref_building',
  {
    id: id('rb'),
    ...buildingCols,
    sourceId: text('source_id'),
    priority: integer('priority').notNull(),
  },
  (t) => [index('ref_building_geom_gist').using('gist', t.geom)],
);

export const terrainTile = pgTable(
  'terrain_tile',
  {
    id: id('tt'),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    bbox: polygon4326('bbox').notNull(),
    storageKey: text('storage_key').notNull(),
    resolutionM: real('resolution_m').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('terrain_tile_bbox_gist').using('gist', t.bbox)],
);

export const siteImport = pgTable('site_import', {
  id: id('imp'),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  stats: jsonb('stats'),
  error: text('error'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

/* ---------- Options, versions, evaluations ---------- */
export const designOption = pgTable('design_option', {
  id: id('opt'),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ruleSetId: text('rule_set_id').references(() => ruleSet.id),
  headVersionId: text('head_version_id'),
  isArchived: boolean('is_archived').notNull().default(false),
  nonCompliantStudy: boolean('non_compliant_study').notNull().default(false),
  /** PNG snapshot of the head design (for cards, compare and PDF). */
  thumbnailKey: text('thumbnail_key'),
  createdAt: createdAt(),
});

/** Read-only public links to a project (presentation mode). */
export const shareLink = pgTable('share_link', {
  id: id('shr'),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdBy: text('created_by').references(() => user.id),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const recipeVersion = pgTable(
  'recipe_version',
  {
    id: id('ver'),
    optionId: text('option_id')
      .notNull()
      .references(() => designOption.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    schemaVersion: integer('schema_version').notNull(),
    recipe: jsonb('recipe').notNull(),
    authorKind: text('author_kind', { enum: ['user', 'agent', 'slider'] }).notNull(),
    authorId: text('author_id'),
    summary: text('summary'),
    createdAt: createdAt(),
  },
  (t) => [index('recipe_version_option').on(t.optionId), index('recipe_version_recipe_gin').using('gin', sql`${t.recipe} jsonb_path_ops`)],
);

export const evaluation = pgTable('evaluation', {
  id: id('ev'),
  recipeVersionId: text('recipe_version_id')
    .notNull()
    .unique()
    .references(() => recipeVersion.id, { onDelete: 'cascade' }),
  compliance: jsonb('compliance').notNull(),
  metrics: jsonb('metrics').notNull(),
  yield: jsonb('yield').notNull(),
  builderVersion: text('builder_version').notNull(),
  ruleSetId: text('rule_set_id'),
  createdAt: createdAt(),
});

export const yieldAssumption = pgTable('yield_assumption', {
  id: id('ya'),
  projectId: text('project_id')
    .notNull()
    .unique()
    .references(() => project.id, { onDelete: 'cascade' }),
  salePricePerM2: jsonb('sale_price_per_m2').notNull().default({}),
  buildCostPerM2: jsonb('build_cost_per_m2').notNull().default({}),
  landCost: doublePrecision('land_cost'),
  softCostRatio: doublePrecision('soft_cost_ratio'),
  parkingCostPerSpace: doublePrecision('parking_cost_per_space'),
  unitSizesM2: jsonb('unit_sizes_m2').notNull().default({}),
  currency: text('currency').notNull().default('XOF'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Agent ---------- */
export const agentRun = pgTable(
  'agent_run',
  {
    id: id('run'),
    optionId: text('option_id')
      .notNull()
      .references(() => designOption.id, { onDelete: 'cascade' }),
    orgId: text('org_id').notNull(),
    userId: text('user_id').notNull(),
    prompt: text('prompt').notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed', 'accepted'] }).notNull().default('queued'),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    explanation: text('explanation'),
    candidates: jsonb('candidates'),
    proposedCandidateId: text('proposed_candidate_id'),
    resultVersionId: text('result_version_id'),
    error: text('error'),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('agent_run_org_created').on(t.orgId, t.createdAt)],
);

export const agentStep = pgTable('agent_step', {
  id: id('stp'),
  runId: text('run_id')
    .notNull()
    .references(() => agentRun.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  tool: text('tool').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  durationMs: integer('duration_ms').notNull(),
  error: text('error'),
});

/* ---------- Exports ---------- */
export const exportJob = pgTable('export', {
  id: id('exp'),
  recipeVersionId: text('recipe_version_id')
    .notNull()
    .references(() => recipeVersion.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['ifc', 'pdf'] }).notNull(),
  storageKey: text('storage_key'),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
  error: text('error'),
  createdAt: createdAt(),
});
