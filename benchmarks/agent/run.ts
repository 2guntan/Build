/**
 * Agent benchmark: runs the 30 cases against the real agent loop and prints a scorecard.
 *   pnpm bench:agent              → real Claude (needs ANTHROPIC_API_KEY; costs tokens)
 *   pnpm bench:agent -- --offline → scripted model (checks the harness, not Claude)
 * Results are written to benchmarks/agent/results/<timestamp>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildableArea, findZone, REFERENCE_ORIGIN, REFERENCE_PLOTS, TEST_RULESET } from '../../apps/api/src/agent/bench-support.js';
import { AnthropicModelClient } from '../../apps/api/src/agent/anthropic-client.js';
import { ScriptedModelClient } from '../../apps/api/src/agent/scripted-client.js';
import { runAgentLoop, type ModelClient } from '../../apps/api/src/agent/loop.js';
import type { AgentWorkspace } from '../../apps/api/src/agent/workspace.js';

interface Case {
  id: string;
  plot: string;
  lang: 'fr' | 'en';
  prompt: string;
  expect: { compliant?: boolean; groundUse?: string; maxFloors?: number; blocks?: number; minBlocks?: number; gfaRange?: [number, number]; mentionsRule?: boolean };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const { cases } = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')) as { cases: Case[] };
const offline = process.argv.includes('--offline');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const key = process.env.ANTHROPIC_API_KEY;
if (!offline && !key) {
  console.error('ANTHROPIC_API_KEY is not set. Use --offline to check the harness without Claude.');
  process.exit(2);
}
const model = process.env.AGENT_MODEL ?? 'claude-opus-5-5';
const priceIn = Number(process.env.AGENT_PRICE_IN_PER_MTOK ?? 4);
const priceOut = Number(process.env.AGENT_PRICE_OUT_PER_MTOK ?? 20);

function workspace(c: Case): AgentWorkspace {
  const ref = REFERENCE_PLOTS.find((p) => p.id === c.plot)!;
  const zone = findZone(TEST_RULESET, ref.zone);
  return {
    site: { plot: ref.plot, edgeClasses: ref.edgeClasses, buildable: buildableArea(ref.plot, ref.edgeClasses, zone) ?? ref.plot },
    zone,
    ruleSet: TEST_RULESET,
    isTest: true,
    recipe: null,
    assumptions: {},
    base: { optionId: `bench_${c.id}`, origin: REFERENCE_ORIGIN, plotRef: ref.id },
    context: ref.context,
    lat: REFERENCE_ORIGIN.lat,
    lon: REFERENCE_ORIGIN.lon,
    nonCompliantStudy: false,
    candidates: new Map(),
    lastCandidateId: null,
    editCounter: 0,
  };
}

function score(c: Case, ws: AgentWorkspace, explanation: string) {
  const cand = ws.lastCandidateId ? ws.candidates.get(ws.lastCandidateId) : undefined;
  const checks: Record<string, boolean> = {};
  checks.proposed = !!cand;
  if (cand) {
    const e = c.expect;
    if (e.compliant !== undefined) checks.compliant = cand.compliance.compliant === e.compliant;
    if (e.groundUse) {
      const ground = cand.recipe.blocks.flatMap((b) => b.uses).filter((u) => u.floors.length === 1 && u.floors[0] === 0).map((u) => u.use);
      const groundUse = ground[0] ?? cand.recipe.blocks[0]?.uses[0]?.use;
      checks.groundUse = groundUse === e.groundUse;
    }
    if (e.maxFloors) checks.maxFloors = cand.metrics.maxFloors <= e.maxFloors;
    if (e.blocks) checks.blocks = cand.recipe.blocks.length === e.blocks;
    if (e.minBlocks) checks.blocks = cand.recipe.blocks.length >= e.minBlocks;
    if (e.gfaRange) checks.gfa = cand.metrics.gfaM2 >= e.gfaRange[0] && cand.metrics.gfaM2 <= e.gfaRange[1];
    if (e.mentionsRule) checks.mentionsRule = /t-height|c-height|T3|C3|hauteur|height/i.test(explanation);
  }
  const compliancePass = checks.proposed && checks.compliant !== false;
  const fullPass = Object.values(checks).every(Boolean);
  return { checks, compliancePass, fullPass };
}

async function main() {
  const client: ModelClient = offline ? new ScriptedModelClient() : new AnthropicModelClient(key!);
  const results = [];
  for (const c of cases.filter((x) => !only || x.id.includes(only))) {
    const ws = workspace(c);
    const t0 = Date.now();
    let res;
    let error: string | null = null;
    try {
      res = await runAgentLoop({ client: offline ? new ScriptedModelClient() : client, model, ws, prompt: c.prompt, locale: c.lang, maxToolCalls: 12, onEvent: () => undefined });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ms = Date.now() - t0;
    const s = res ? score(c, ws, res.explanation) : { checks: { error: false }, compliancePass: false, fullPass: false };
    const cost = res ? (res.tokensIn * priceIn + res.tokensOut * priceOut) / 1e6 : 0;
    results.push({ id: c.id, ...s, toolCalls: res?.toolCalls ?? 0, tokensIn: res?.tokensIn ?? 0, tokensOut: res?.tokensOut ?? 0, costUsd: cost, ms, error });
    console.log(`${s.fullPass ? 'PASS' : s.compliancePass ? 'part' : 'FAIL'}  ${c.id}  ${JSON.stringify(s.checks)}  ${ms} ms`);
  }
  const n = results.length || 1;
  const card = {
    model: offline ? 'scripted' : model,
    cases: results.length,
    compliancePassRate: results.filter((r) => r.compliancePass).length / n,
    fullPassRate: results.filter((r) => r.fullPass).length / n,
    avgToolCalls: results.reduce((a, r) => a + r.toolCalls, 0) / n,
    avgTokens: results.reduce((a, r) => a + r.tokensIn + r.tokensOut, 0) / n,
    avgCostUsd: results.reduce((a, r) => a + r.costUsd, 0) / n,
    avgDurationMs: results.reduce((a, r) => a + r.ms, 0) / n,
    targets: { compliancePassRate: 0.9, fullPassRate: 0.8 },
  };
  console.log('\nScorecard', JSON.stringify(card, null, 2));
  mkdirSync(join(here, 'results'), { recursive: true });
  writeFileSync(join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ card, results }, null, 2));
  if (card.compliancePassRate < 0.9 || card.fullPassRate < 0.8) process.exitCode = 1;
}

await main();
