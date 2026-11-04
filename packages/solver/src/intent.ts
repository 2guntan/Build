import { z } from 'zod';
import { UNIT_TYPES, USES, type Use } from '@fs/recipe';
import { TEMPLATES } from './templates.js';

export const Intent = z.object({
  targetUse: z.enum(['residential', 'office', 'retail', 'hotel', 'amenity', 'mixed']),
  targetGfa: z.number().positive().optional(),
  floors: z.number().int().min(1).max(60).optional(),
  blocks: z.number().int().min(1).max(6).optional(),
  layout: z.enum([...TEMPLATES, 'auto']).default('auto'),
  groundFloorUse: z.enum(USES).optional(),
  priority: z.enum(['max_gfa', 'target_gfa', 'max_sun', 'max_margin']).optional(),
  unitMix: z.partialRecord(z.enum(UNIT_TYPES), z.number().min(0).max(1)).optional(),
});
export type Intent = z.infer<typeof Intent>;
export type IntentInput = z.input<typeof Intent>;

export const DEFAULT_EFFICIENCY: Record<Use, number> = {
  residential: 0.8,
  office: 0.85,
  retail: 0.85,
  hotel: 0.7,
  amenity: 0.75,
  parking: 0.9,
};
