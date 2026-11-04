import { z } from 'zod';

export const RECIPE_SCHEMA_VERSION = 1 as const;

export const PARAM_REF = /^\$params\.[A-Za-z][A-Za-z0-9_]*$/;
export const ParamRef = z.string().regex(PARAM_REF, 'Expected $params.<key>');
export const NumOrRef = z.union([z.number(), ParamRef]);
export type NumOrRef = z.infer<typeof NumOrRef>;

export const USES = ['retail', 'residential', 'office', 'hotel', 'amenity', 'parking'] as const;
export const Use = z.enum(USES);
export type Use = z.infer<typeof Use>;

export const UNIT_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;
export const UnitType = z.enum(UNIT_TYPES);
export type UnitType = z.infer<typeof UnitType>;

export const ANCHORS = [
  'buildable.front-left',
  'buildable.front-right',
  'buildable.rear-left',
  'buildable.rear-right',
  'buildable.centroid',
] as const;
export const Anchor = z.enum(ANCHORS);
export type Anchor = z.infer<typeof Anchor>;

export const Param = z
  .object({
    value: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    label: z.string().optional(),
    unit: z.string().optional(),
  })
  .refine((p) => p.min <= p.max, { message: 'min must be ≤ max' });
export type Param = z.infer<typeof Param>;

const Vertex = z.tuple([z.number(), z.number()]);

export const RectFootprint = z.object({
  kind: z.literal('rect'),
  anchor: Anchor.default('buildable.front-left'),
  width: NumOrRef,
  depth: NumOrRef,
  rotation: NumOrRef.default(0),
  /** Shift along the front edge (u) and inwards (v), in metres. */
  offsetU: NumOrRef.default(0),
  offsetV: NumOrRef.default(0),
});

export const PolygonFootprint = z.object({
  kind: z.literal('polygon'),
  vertices: z.array(Vertex).min(3),
});

export const OffsetFootprint = z.object({
  kind: z.literal('offset'),
  /** Extra inset from the buildable area, in metres. */
  distance: NumOrRef,
});

export const Footprint = z.discriminatedUnion('kind', [RectFootprint, PolygonFootprint, OffsetFootprint]);
export type Footprint = z.infer<typeof Footprint>;

/** One element = that floor; two elements = inclusive range. Floor 0 is the ground floor. */
export const FloorSelector = z
  .array(z.union([z.number().int().min(0), z.literal('last')]))
  .min(1)
  .max(2);
export type FloorSelector = z.infer<typeof FloorSelector>;

export const UseAssignment = z.object({
  floors: FloorSelector,
  use: Use,
  efficiency: z.number().min(0).max(1),
  unitMix: z.partialRecord(UnitType, z.number().min(0).max(1)).optional(),
});
export type UseAssignment = z.infer<typeof UseAssignment>;

export const Block = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  footprint: Footprint,
  floors: NumOrRef,
  floorHeights: z.object({ ground: NumOrRef, typical: NumOrRef }),
  uses: z.array(UseAssignment).min(1),
  roof: z.object({ kind: z.literal('flat'), accessible: z.boolean().default(false) }).default({
    kind: 'flat',
    accessible: false,
  }),
});
export type Block = z.infer<typeof Block>;

export const Parking = z.object({
  kind: z.enum(['none', 'surface', 'underground']),
  spaces: NumOrRef,
  area: z.union([z.number().min(0), z.literal('auto')]).default('auto'),
});
export type Parking = z.infer<typeof Parking>;

export const Recipe = z.object({
  schemaVersion: z.literal(RECIPE_SCHEMA_VERSION),
  optionId: z.string().min(1),
  site: z.object({
    origin: z.object({ lon: z.number(), lat: z.number(), crs: z.string().regex(/^EPSG:\d+$/) }),
    plotRef: z.string().min(1),
    northAngle: z.number().default(0),
  }),
  programme: z.object({
    targetUse: z.enum([...USES, 'mixed']),
    targetGfa: z.number().positive().optional(),
  }),
  params: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), Param).default({}),
  blocks: z.array(Block),
  parking: Parking.default({ kind: 'none', spaces: 0, area: 'auto' }),
  meta: z
    .object({
      createdBy: z.enum(['user', 'agent', 'solver', 'slider']),
      intent: z.string().optional(),
      template: z.string().optional(),
      /** Option is explicitly a non-compliant study: validator allows blocking failures. */
      nonCompliantStudy: z.boolean().optional(),
    })
    .default({ createdBy: 'user' }),
});
export type Recipe = z.infer<typeof Recipe>;
export type RecipeInput = z.input<typeof Recipe>;
