import { normalizeRing, ringDistance, ringSegmentDistance, roundTo } from '@fs/geometry';
import type { BuildResult, EdgeClass, Vec2, Use } from '@fs/recipe';
import { evaluateFormula } from './formula.js';
import type { Rule, Zone } from './schema.js';

export type RuleStatus = 'pass' | 'warn' | 'fail';

export interface RuleResult {
  ruleId: string;
  type: Rule['type'];
  severity: Rule['severity'];
  status: RuleStatus;
  actual: number | null;
  limit: number | null;
  /** Positive = headroom, negative = violation, in the rule's unit. */
  margin: number | null;
  unit: 'ratio' | 'm' | 'storeys' | 'spaces';
  elementIds: string[];
  message_fr: string;
  message_en: string;
  cite: Rule['cite'];
}

export interface EvalContext {
  plot: Vec2[];
  edgeClasses: EdgeClass[];
  /** Provided parking spaces (from the recipe). */
  parkingSpaces?: number;
  /** Unit counts by use, if known (from the yield model). */
  unitsByUse?: Partial<Record<Use, number>>;
}

export interface Evaluation {
  results: RuleResult[];
  blockingFailures: number;
  warnings: number;
  compliant: boolean;
}

const r3 = (v: number) => roundTo(v, 0.001);
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

function status(ok: boolean, rule: Rule): RuleStatus {
  if (ok) return 'pass';
  return rule.severity === 'blocking' ? 'fail' : 'warn';
}

const EDGE_FR: Record<EdgeClass, string> = { front: 'avant', side: 'latéral', rear: 'arrière' };

function evalRule(rule: Rule, br: BuildResult, ctx: EvalContext): RuleResult {
  const A = br.totals.plotAreaM2;
  const base = { ruleId: rule.id, type: rule.type, severity: rule.severity, cite: rule.cite };
  const tol = 1e-6;
  switch (rule.type) {
    case 'max_coverage': {
      const actual = A > 0 ? br.totals.footprintAreaM2 / A : 0;
      const ok = actual <= rule.max + tol;
      return {
        ...base,
        status: status(ok, rule),
        actual: r3(actual),
        limit: rule.max,
        margin: r3(rule.max - actual),
        unit: 'ratio',
        elementIds: ok ? [] : br.blocks.map((b) => b.id),
        message_fr: `Emprise au sol ${pct(actual)} (max ${pct(rule.max)})`,
        message_en: `Site coverage ${pct(actual)} (max ${pct(rule.max)})`,
      };
    }
    case 'max_far': {
      const actual = A > 0 ? br.totals.gfaM2 / A : 0;
      const ok = actual <= rule.max + tol;
      return {
        ...base,
        status: status(ok, rule),
        actual: r3(actual),
        limit: rule.max,
        margin: r3(rule.max - actual),
        unit: 'ratio',
        elementIds: ok ? [] : br.blocks.map((b) => b.id),
        message_fr: `COS ${actual.toFixed(2)} (max ${rule.max.toFixed(2)})`,
        message_en: `Floor-area ratio ${actual.toFixed(2)} (max ${rule.max.toFixed(2)})`,
      };
    }
    case 'max_height': {
      const failing: string[] = [];
      let worstMargin = Infinity;
      let actual = 0;
      let limit = 0;
      let unit: RuleResult['unit'] = 'm';
      for (const b of br.blocks) {
        if (rule.maxMetres !== undefined) {
          const m = rule.maxMetres - b.heightM;
          if (m < worstMargin) {
            worstMargin = m;
            actual = b.heightM;
            limit = rule.maxMetres;
            unit = 'm';
          }
          if (m < -tol) failing.push(b.id);
        }
        if (rule.maxStoreys !== undefined) {
          const m = rule.maxStoreys - b.floors;
          if (m < -tol && !failing.includes(b.id)) failing.push(b.id);
          if (rule.maxMetres === undefined && m < worstMargin) {
            worstMargin = m;
            actual = b.floors;
            limit = rule.maxStoreys;
            unit = 'storeys';
          }
        }
      }
      const ok = failing.length === 0;
      const lim = [
        rule.maxMetres !== undefined ? `${rule.maxMetres} m` : null,
        rule.maxStoreys !== undefined ? `R+${rule.maxStoreys - 1}` : null,
      ]
        .filter(Boolean)
        .join(' / ');
      return {
        ...base,
        status: status(ok, rule),
        actual: br.blocks.length ? r3(actual) : 0,
        limit: br.blocks.length ? limit : (rule.maxMetres ?? rule.maxStoreys ?? null),
        margin: br.blocks.length ? r3(worstMargin) : null,
        unit,
        elementIds: failing,
        message_fr: `Hauteur max ${br.totals.maxHeightM.toFixed(1)} m, R+${Math.max(0, br.totals.maxFloors - 1)} (limite ${lim})`,
        message_en: `Max height ${br.totals.maxHeightM.toFixed(1)} m, G+${Math.max(0, br.totals.maxFloors - 1)} (limit ${lim})`,
      };
    }
    case 'setback': {
      const plot = normalizeRing(ctx.plot);
      let worst: { margin: number; actual: number; limit: number } | null = null;
      const failing: string[] = [];
      for (const b of br.blocks) {
        const limit = evaluateFormula(rule.min, { H: b.heightM, n: b.floors, A });
        for (let i = 0; i < plot.length; i++) {
          if (ctx.edgeClasses[i] !== rule.edge) continue;
          const d = ringSegmentDistance(b.footprint, plot[i]!, plot[(i + 1) % plot.length]!);
          const margin = d - limit;
          if (!worst || margin < worst.margin) worst = { margin, actual: d, limit };
          if (margin < -1e-3 && !failing.includes(b.id)) failing.push(b.id);
        }
      }
      const ok = failing.length === 0;
      const lim = worst ? worst.limit.toFixed(2) : String(rule.min);
      return {
        ...base,
        status: status(ok, rule),
        actual: worst ? r3(worst.actual) : null,
        limit: worst ? r3(worst.limit) : null,
        margin: worst ? r3(worst.margin) : null,
        unit: 'm',
        elementIds: failing,
        message_fr: `Recul ${EDGE_FR[rule.edge]} ${worst ? worst.actual.toFixed(2) : '–'} m (min ${lim} m)`,
        message_en: `${rule.edge[0]!.toUpperCase()}${rule.edge.slice(1)} setback ${worst ? worst.actual.toFixed(2) : '–'} m (min ${lim} m)`,
      };
    }
    case 'min_separation': {
      let worst: { margin: number; actual: number; limit: number } | null = null;
      const failing: string[] = [];
      for (let i = 0; i < br.blocks.length; i++) {
        for (let j = i + 1; j < br.blocks.length; j++) {
          const a = br.blocks[i]!;
          const b = br.blocks[j]!;
          const H = Math.max(a.heightM, b.heightM);
          const n = Math.max(a.floors, b.floors);
          const limit = evaluateFormula(rule.min, { H, n, A });
          const d = ringDistance(a.footprint, b.footprint);
          const margin = d - limit;
          if (!worst || margin < worst.margin) worst = { margin, actual: d, limit };
          if (margin < -1e-3) failing.push(a.id, b.id);
        }
      }
      const ok = failing.length === 0;
      return {
        ...base,
        status: status(ok, rule),
        actual: worst ? r3(worst.actual) : null,
        limit: worst ? r3(worst.limit) : null,
        margin: worst ? r3(worst.margin) : null,
        unit: 'm',
        elementIds: [...new Set(failing)],
        message_fr: worst
          ? `Distance entre bâtiments ${worst.actual.toFixed(2)} m (min ${worst.limit.toFixed(2)} m)`
          : 'Un seul bâtiment : sans objet',
        message_en: worst
          ? `Distance between blocks ${worst.actual.toFixed(2)} m (min ${worst.limit.toFixed(2)} m)`
          : 'Single block: not applicable',
      };
    }
    case 'parking_ratio': {
      let required = 0;
      let unknown = false;
      for (const [use, req] of Object.entries(rule.perUse) as [Use, { per100m2?: number; perUnit?: number }][]) {
        const gfa = br.totals.gfaByUse[use] ?? 0;
        if (req.per100m2 !== undefined) required += (gfa / 100) * req.per100m2;
        if (req.perUnit !== undefined) {
          const units = ctx.unitsByUse?.[use];
          if (units === undefined) {
            if (gfa > 0) unknown = true;
          } else required += units * req.perUnit;
        }
      }
      required = Math.ceil(required - 1e-9);
      const provided = ctx.parkingSpaces ?? br.totals.parkingSpaces;
      const ok = provided >= required;
      const st: RuleStatus = unknown && ok ? 'warn' : status(ok, rule);
      return {
        ...base,
        status: st,
        actual: provided,
        limit: required,
        margin: provided - required,
        unit: 'spaces',
        elementIds: [],
        message_fr: `Stationnement ${provided} places (requis ${required}${unknown ? ', estimation incomplète' : ''})`,
        message_en: `Parking ${provided} spaces (required ${required}${unknown ? ', incomplete estimate' : ''})`,
      };
    }
    case 'min_open_space': {
      const unbuilt = A > 0 ? (A - br.totals.footprintAreaM2 - br.totals.parkingSurfaceAreaM2) / A : 0;
      const ok = unbuilt >= rule.min - tol;
      return {
        ...base,
        status: status(ok, rule),
        actual: r3(unbuilt),
        limit: rule.min,
        margin: r3(unbuilt - rule.min),
        unit: 'ratio',
        elementIds: [],
        message_fr: `Espace libre ${pct(unbuilt)} (min ${pct(rule.min)})`,
        message_en: `Open space ${pct(unbuilt)} (min ${pct(rule.min)})`,
      };
    }
  }
}

/** Checks a BuildResult against a zone's rules. Pure. */
export function evaluate(zone: Zone, br: BuildResult, ctx: EvalContext): Evaluation {
  const results = zone.rules.map((r) => evalRule(r, br, ctx));
  const blockingFailures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  return { results, blockingFailures, warnings, compliant: blockingFailures === 0 };
}
