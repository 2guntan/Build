import { z } from 'zod';
import { USES } from '@fs/recipe';
import { checkFormula } from './formula.js';

const Formula = z.union([z.number(), z.string().refine((s) => checkFormula(s) === null, 'Invalid formula')]);

const Cite = z.object({ source: z.string(), article: z.string() });
const Base = {
  id: z.string().min(1),
  severity: z.enum(['blocking', 'warning']),
  cite: Cite,
  note: z.string().optional(),
};

export const Rule = z.discriminatedUnion('type', [
  z.object({ ...Base, type: z.literal('max_coverage'), max: z.number().min(0).max(1) }),
  z.object({ ...Base, type: z.literal('max_far'), max: z.number().min(0) }),
  z
    .object({
      ...Base,
      type: z.literal('max_height'),
      maxMetres: z.number().positive().optional(),
      maxStoreys: z.number().int().positive().optional(),
    })
    .refine((r) => r.maxMetres !== undefined || r.maxStoreys !== undefined, 'maxMetres or maxStoreys'),
  z.object({ ...Base, type: z.literal('setback'), edge: z.enum(['front', 'side', 'rear']), min: Formula }),
  z.object({ ...Base, type: z.literal('min_separation'), min: Formula }),
  z.object({
    ...Base,
    type: z.literal('parking_ratio'),
    perUse: z.partialRecord(
      z.enum(USES),
      z.object({
        per100m2: z.number().min(0).optional(),
        perUnit: z.number().min(0).optional(),
      }),
    ),
  }),
  z.object({ ...Base, type: z.literal('min_open_space'), min: z.number().min(0).max(1) }),
]);
export type Rule = z.infer<typeof Rule>;
export type RuleType = Rule['type'];

export const Zone = z.object({
  id: z.string(),
  name: z.string(),
  name_en: z.string().optional(),
  rules: z.array(Rule),
});
export type Zone = z.infer<typeof Zone>;

export const RuleSet = z.object({
  jurisdiction: z.object({
    id: z.string(),
    name: z.string().optional(),
    country: z.string().optional(),
    version: z.string(),
    effective: z.string(),
  }),
  /** True for fixtures that are not transcribed from official documents. */
  test: z.boolean().optional(),
  disclaimer: z.string().optional(),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string(), article: z.string().optional() })),
  zones: z.array(Zone).min(1),
});
export type RuleSet = z.infer<typeof RuleSet>;

export function findZone(rs: RuleSet, zoneId: string): Zone {
  const z = rs.zones.find((x) => x.id === zoneId);
  if (!z) throw new Error(`Zone ${zoneId} not found in ${rs.jurisdiction.id}`);
  return z;
}
