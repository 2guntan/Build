import fastJsonPatch, { type Operation } from 'fast-json-patch';
import { z } from 'zod';
import { area, dist, normalizeRing } from '@fs/geometry';
import { setParams, type Recipe } from '@fs/recipe';
import { describeRule, heightEnvelope } from '@fs/rules';
import { Intent, solve, validate } from '@fs/solver';
import { runSunStudy } from '@fs/sun';
import { evaluate } from '@fs/rules';
import { build } from '@fs/builder';
import { computeYield } from '@fs/yield';
import type { AgentCandidate, AgentWorkspace } from './workspace.js';

export interface ToolDef {
  name: string;
  description: string;
  input: z.ZodType;
  run: (ws: AgentWorkspace, input: never) => unknown;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function summarizeCandidate(c: AgentCandidate) {
  return {
    id: c.id,
    template: c.template,
    blocks: c.recipe.blocks.length,
    gfaM2: r1(c.metrics.gfaM2),
    floorsMax: c.metrics.maxFloors,
    heightM: r1(c.metrics.maxHeightM),
    coverage: c.metrics.plotAreaM2 ? r1((100 * c.metrics.footprintAreaM2) / c.metrics.plotAreaM2) / 100 : null,
    far: c.metrics.plotAreaM2 ? Math.round((100 * c.metrics.gfaM2) / c.metrics.plotAreaM2) / 100 : null,
    parkingSpaces: c.metrics.parkingSpaces,
    compliant: c.compliance.compliant,
    failures: c.compliance.results.filter((r) => r.status !== 'pass').map((r) => ({ rule: r.ruleId, status: r.status, message: r.message_en, cite: r.cite })),
    margin: c.yield.complete ? Math.round(c.yield.margin) : null,
    yieldMissing: c.yield.missing,
    params: Object.fromEntries(Object.entries(c.recipe.params).map(([k, p]) => [k, { value: p.value, min: p.min, max: p.max }])),
  };
}

function evaluateRecipe(ws: AgentWorkspace, recipe: Recipe) {
  const br = build(recipe, ws.site, { mesh: false });
  const y = computeYield(br, ws.assumptions);
  const ev = evaluate(ws.zone, br, { plot: ws.site.plot, edgeClasses: ws.site.edgeClasses, unitsByUse: y.unitsByUse });
  return { br, y, ev };
}

function addCandidate(ws: AgentWorkspace, c: AgentCandidate) {
  ws.candidates.set(c.id, c);
  ws.lastCandidateId = c.id;
}

function baseRecipe(ws: AgentWorkspace, from?: string): Recipe {
  if (from && from !== 'current') {
    const c = ws.candidates.get(from);
    if (!c) throw new Error(`Unknown candidate ${from}. Known: ${[...ws.candidates.keys()].join(', ') || 'none'}`);
    return structuredClone(c.recipe);
  }
  if (ws.lastCandidateId && from === undefined) return structuredClone(ws.candidates.get(ws.lastCandidateId)!.recipe);
  if (!ws.recipe) throw new Error('The option has no recipe yet; call propose_massing first');
  return structuredClone(ws.recipe);
}

function validated(ws: AgentWorkspace, recipe: Recipe, template: string) {
  const v = validate(recipe, { plot: ws.site.plot, edgeClasses: ws.site.edgeClasses, zone: ws.zone, assumptions: ws.assumptions });
  if (!v.ok || !v.recipe || !v.build || !v.evaluation || !v.yield) {
    return { ok: false as const, errors: v.issues };
  }
  ws.editCounter += 1;
  const c: AgentCandidate = {
    id: `edit-${ws.editCounter}`,
    template,
    recipe: v.recipe,
    metrics: v.build.totals,
    compliance: v.evaluation,
    yield: v.yield,
  };
  addCandidate(ws, c);
  return { ok: true as const, candidate: summarizeCandidate(c), tolerated: v.tolerated };
}

const JsonPatchOp = z.object({
  op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

export const TOOLS: ToolDef[] = [
  {
    name: 'get_site_summary',
    description:
      'Plot area, edge lengths and classes (front/side/rear), buildable area after setbacks, orientation, and neighbouring building heights. Coordinates are local metres (x east, y north). Call before proposing.',
    input: z.object({}),
    run: (ws) => {
      const plot = normalizeRing(ws.site.plot);
      return {
        plotAreaM2: r1(area(plot)),
        edges: plot.map((a, i) => {
          const b = plot[(i + 1) % plot.length]!;
          // CCW ring: outward normal is (dy, -dx); azimuth from north, clockwise.
          const nx = b[1] - a[1];
          const ny = -(b[0] - a[0]);
          const normalAz = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;
          return { index: i, lengthM: r1(dist(a, b)), class: ws.site.edgeClasses[i], facing: ['N', 'E', 'S', 'W'][Math.round(normalAz / 90) % 4] };
        }),
        buildableAreaM2: r1(area(ws.site.buildable)),
        heightEnvelope: heightEnvelope(ws.zone),
        neighbours: ws.context.slice(0, 40).map((c) => ({ id: c.id, heightM: c.heightM })),
        location: { lat: ws.lat, lon: ws.lon },
      };
    },
  },
  {
    name: 'get_rules',
    description: 'Planning rules that apply to this plot\'s zone, in plain language and as data, each with its citation.',
    input: z.object({}),
    run: (ws) => ({
      jurisdiction: ws.ruleSet.jurisdiction,
      zone: { id: ws.zone.id, name: ws.zone.name },
      testRuleSet: ws.isTest,
      warning: ws.isTest ? 'TEST rule set, not official. Say so to the user.' : undefined,
      rules: ws.zone.rules.map((r) => ({ text: describeRule(r, 'en'), data: r })),
    }),
  },
  {
    name: 'get_current_option',
    description: 'The option\'s current recipe with its metrics, compliance and yield.',
    input: z.object({}),
    run: (ws) => {
      if (!ws.recipe) return { recipe: null };
      const { br, y, ev } = evaluateRecipe(ws, ws.recipe);
      return {
        recipe: ws.recipe,
        summary: summarizeCandidate({ id: 'current', template: ws.recipe.meta.template ?? 'custom', recipe: ws.recipe, metrics: br.totals, compliance: ev, yield: y }),
      };
    },
  },
  {
    name: 'propose_massing',
    description:
      'Generate new compliant layouts from a design intent with the deterministic solver. Returns up to 3 candidates with metrics, compliance and yield. Prefer this for new layouts.',
    input: Intent,
    run: (ws, input: z.infer<typeof Intent>) => {
      const res = solve({ intent: input, plot: ws.site.plot, edgeClasses: ws.site.edgeClasses, zone: ws.zone, base: ws.base, assumptions: ws.assumptions });
      for (const c of res.candidates) {
        addCandidate(ws, { id: c.id, template: c.template, recipe: c.recipe, metrics: c.metrics, compliance: c.compliance, yield: c.yield });
      }
      if (res.candidates[0]) ws.lastCandidateId = res.candidates[0].id;
      return { candidates: res.candidates.map((c) => ({ ...summarizeCandidate(c), scoreBasis: c.scoreBasis })), iterations: res.iterations, reason: res.reason };
    },
  },
  {
    name: 'edit_recipe',
    description:
      'Apply a JSON Patch (RFC 6902) to a recipe (the current option, or a candidate id) for targeted changes. The result is validated; on failure you get the validation errors to fix.',
    input: z.object({ patch: z.array(JsonPatchOp).min(1).max(50), base: z.string().optional().describe('"current" or a candidate id; default: the last candidate, else current') }),
    run: (ws, input: { patch: z.infer<typeof JsonPatchOp>[]; base?: string }) => {
      const recipe = baseRecipe(ws, input.base);
      const out = fastJsonPatch.applyPatch(recipe, input.patch as Operation[], true, false).newDocument;
      return validated(ws, { ...out, meta: { ...out.meta, createdBy: 'agent' } }, out.meta?.template ?? 'custom');
    },
  },
  {
    name: 'set_params',
    description: 'Change slider parameters (e.g. floorsA, groundFloorHeight) on a recipe; values are clamped to their bounds. Returns updated metrics.',
    input: z.object({ values: z.record(z.string(), z.number()), base: z.string().optional() }),
    run: (ws, input: { values: Record<string, number>; base?: string }) => {
      const recipe = setParams(baseRecipe(ws, input.base), input.values);
      return validated(ws, { ...recipe, meta: { ...recipe.meta, createdBy: 'agent' } }, recipe.meta.template ?? 'custom');
    },
  },
  {
    name: 'run_sun_study',
    description:
      'Direct-sun study for a candidate (or current option) on a date: average façade sun hours by orientation, share of ground with < 2 h of sun, share of façade with > 6 h (overheating risk), share of plot shaded at noon.',
    input: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      candidateId: z.string().optional(),
    }),
    run: (ws, input: { date: string; candidateId?: string }) => {
      const recipe = baseRecipe(ws, input.candidateId);
      const [y, m, d] = input.date.split('-').map(Number) as [number, number, number];
      const br = build(recipe, ws.site, { mesh: false });
      const res = runSunStudy({ build: br, plot: ws.site.plot, context: ws.context, date: { year: y, month: m, day: d }, lat: ws.lat, lon: ws.lon, groundSpacingM: 3, maxPoints: 2500 });
      return res.summary;
    },
  },
  {
    name: 'compare_candidates',
    description: 'Side-by-side metrics table for candidate ids from this run.',
    input: z.object({ ids: z.array(z.string()).min(1).max(6) }),
    run: (ws, input: { ids: string[] }) =>
      input.ids.map((id) => {
        const c = ws.candidates.get(id);
        return c ? summarizeCandidate(c) : { id, error: 'unknown candidate' };
      }),
  },
];

export function toolSchemas() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
  }));
}

/** Runs one tool call. Errors are returned to the model as text so it can recover. */
export function runTool(ws: AgentWorkspace, name: string, rawInput: unknown): { output: unknown; error: string | null } {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { output: null, error: `Unknown tool ${name}` };
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { output: null, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  try {
    return { output: tool.run(ws, parsed.data as never), error: null };
  } catch (e) {
    return { output: null, error: e instanceof Error ? e.message : String(e) };
  }
}
