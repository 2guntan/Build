import { z } from 'zod';
import { Recipe } from '@fs/recipe';
import { YieldAssumptions } from '@fs/yield';

export const API_PREFIX = '/api/v1';

/* ---------- Errors (RFC 9457 problem+json) ---------- */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'PLOT_INVALID',
  'RULESET_NOT_PUBLISHED',
  'RECIPE_SCHEMA_INVALID',
  'RECIPE_REJECTED',
  'AGENT_BUDGET_EXCEEDED',
  'AGENT_UNAVAILABLE',
  'IFC_SERVICE_UNAVAILABLE',
  'UPLOAD_TOO_LARGE',
  'CONFLICT',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.enum(ERROR_CODES),
  detail: z.string().optional(),
  message_fr: z.string(),
  message_en: z.string(),
  issues: z.array(z.unknown()).optional(),
});
export type Problem = z.infer<typeof Problem>;

/* ---------- Common ---------- */
export const EdgeClass = z.enum(['front', 'side', 'rear']);
export const GeoJsonPolygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).or(z.array(z.number()).min(2)))).min(1),
});
export type GeoJsonPolygon = z.infer<typeof GeoJsonPolygon>;

export const Role = z.enum(['owner', 'editor', 'viewer']);

export const Me = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  organizations: z.array(z.object({ id: z.string(), name: z.string(), role: Role })),
});

/* ---------- Projects & plots ---------- */
export const CreateProject = z.object({
  name: z.string().min(1).max(200),
  jurisdictionId: z.string().default('sn-dakar'),
  currency: z.string().default('XOF'),
  locale: z.enum(['fr', 'en']).default('fr'),
  orgId: z.string().optional(),
});
export const UpdateProject = z.object({ name: z.string().min(1).max(200).optional(), archived: z.boolean().optional() });

export const PlotSummary = z.object({
  id: z.string(),
  geom: GeoJsonPolygon,
  zoneId: z.string().nullable(),
  edgeClasses: z.array(EdgeClass),
  areaM2: z.number(),
  source: z.enum(['drawn', 'imported']),
  local: z.array(z.tuple([z.number(), z.number()])),
  buildable: z.array(z.tuple([z.number(), z.number()])).nullable(),
  edges: z.array(z.object({ index: z.number(), lengthM: z.number(), class: EdgeClass })),
  origin: z.object({ lon: z.number(), lat: z.number(), crs: z.string() }),
});
export type PlotSummary = z.infer<typeof PlotSummary>;

export const Project = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  jurisdictionId: z.string(),
  currency: z.string(),
  locale: z.string(),
  archived: z.boolean(),
  createdAt: z.string(),
  plot: PlotSummary.nullable().optional(),
  ruleSetId: z.string().nullable().optional(),
  bestMargin: z.number().nullable().optional(),
});
export type Project = z.infer<typeof Project>;

export const PutPlot = z.object({
  geojson: GeoJsonPolygon,
  zoneId: z.string().optional(),
  edgeClasses: z.array(EdgeClass).optional(),
  source: z.enum(['drawn', 'imported']).default('drawn'),
});
export const PatchEdges = z.object({ edgeClasses: z.array(EdgeClass), zoneId: z.string().optional() });

/* ---------- Options & versions ---------- */
export const CreateOption = z.object({
  name: z.string().min(1).max(120),
  duplicateFrom: z.string().optional(),
  ruleSetId: z.string().optional(),
});
export const SaveVersion = z.object({
  recipe: z.unknown(),
  authorKind: z.enum(['user', 'slider', 'agent']).default('user'),
  summary: z.string().max(500).optional(),
  /** Version the client edited from; used to detect concurrent edits. */
  parentId: z.string().nullable().optional(),
});
export const MoveHead = z.object({ versionId: z.string() });

export const VersionSummary = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  authorKind: z.enum(['user', 'agent', 'slider']),
  summary: z.string().nullable(),
  createdAt: z.string(),
  gfaM2: z.number().nullable(),
  compliant: z.boolean().nullable(),
});

/* ---------- Agent ---------- */
export const StartAgentRun = z.object({
  prompt: z.string().min(1).max(4000),
  image: z
    .object({ mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']), data: z.string().max(7_000_000) })
    .optional(),
  locale: z.enum(['fr', 'en']).default('fr'),
});
export const AcceptAgentRun = z.object({ candidateId: z.string().optional() });

export const AgentEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), status: z.string() }),
  z.object({ type: z.literal('step'), seq: z.number(), tool: z.string(), input: z.unknown(), output: z.unknown(), durationMs: z.number(), error: z.string().nullable() }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('candidates'), candidates: z.array(z.object({ id: z.string(), template: z.string(), recipe: Recipe, metrics: z.unknown(), compliance: z.unknown(), yield: z.unknown() })) }),
  z.object({ type: z.literal('done'), explanation: z.string(), proposedCandidateId: z.string().nullable(), tokensIn: z.number(), tokensOut: z.number(), costUsd: z.number() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEvent>;

/* ---------- Yield, exports, site data ---------- */
export const PutYieldAssumptions = YieldAssumptions;
export const CreateExport = z.object({ kind: z.enum(['ifc', 'pdf']) });
export const ExportStatus = z.object({
  id: z.string(),
  kind: z.enum(['ifc', 'pdf']),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  url: z.string().nullable(),
  error: z.string().nullable(),
});

export const ContextBuilding = z.object({
  id: z.string(),
  geom: GeoJsonPolygon,
  heightM: z.number(),
  heightSource: z.enum(['measured', 'estimated', 'default', 'user']),
  dataSource: z.string(),
  local: z.array(z.tuple([z.number(), z.number()])),
});
export const PatchContextBuilding = z.object({ heightM: z.number().min(0).max(400).optional(), deleted: z.boolean().optional() });

export const CompareQuery = z.object({ options: z.string() });

export * from './problems.js';
