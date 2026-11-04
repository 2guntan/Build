import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, makeApp, projectWithPlot, signUp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.close(); });

describe('agent runs (scripted model)', () => {
  it('runs tools, streams steps over SSE and accepts a candidate as a new version', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { optionId } = await projectWithPlot(c);
    const start = await c.post(`/api/v1/options/${optionId}/agent-runs`, { prompt: 'Un immeuble mixte R+4 avec commerces' });
    expect(start.status).toBe(202);
    await ctx.deps.agent.waitFor(start.body.runId);
    const sse = await c.get(`/api/v1/agent-runs/${start.body.runId}/stream`);
    expect(sse.headers['content-type']).toMatch(/text\/event-stream/);
    const events = String(sse.raw.body).split('\n\n').filter(Boolean).map((chunk) => JSON.parse(chunk.split('\n').find((l) => l.startsWith('data: '))!.slice(6)));
    const steps = events.filter((e) => e.type === 'step').map((e) => e.tool);
    expect(steps).toEqual(['get_site_summary', 'get_rules', 'propose_massing']);
    const done = events.find((e) => e.type === 'done');
    expect(done.proposedCandidateId).toBeTruthy();
    const cands = events.find((e) => e.type === 'candidates').candidates;
    expect(cands.length).toBeGreaterThan(0);
    for (const cand of cands) expect(cand.compliance.compliant).toBe(true);
    const run = await c.get(`/api/v1/agent-runs/${start.body.runId}`);
    expect(run.body.tokensIn).toBeGreaterThan(0);
    expect(run.body.costUsd).toBeGreaterThan(0);
    const acc = await c.post(`/api/v1/agent-runs/${start.body.runId}/accept`, {});
    expect(acc.status).toBe(200);
    expect(acc.body.version.authorKind).toBe('agent');
    const o = await c.get(`/api/v1/options/${optionId}`);
    expect(o.body.head.id).toBe(acc.body.version.id);
    expect(o.body.evaluation.compliance.compliant).toBe(true);
    expect(o.body.head.recipe.blocks[0].floors).toMatch(/^\$params\./);
  });

  it('enforces the per-organization daily token budget', async () => {
    const tight = await makeApp({ env: { AGENT_DAILY_TOKEN_BUDGET: '1' } });
    try {
      const c = client(tight.app, (await signUp(tight.app)).cookie);
      const { optionId } = await projectWithPlot(c);
      const r1 = await c.post(`/api/v1/options/${optionId}/agent-runs`, { prompt: 'R+3' });
      await tight.deps.agent.waitFor(r1.body.runId);
      const r2 = await c.post(`/api/v1/options/${optionId}/agent-runs`, { prompt: 'R+3' });
      expect(r2.status).toBe(429);
      expect(r2.body.code).toBe('AGENT_BUDGET_EXCEEDED');
    } finally {
      await tight.close();
    }
  });

  it('returns AGENT_UNAVAILABLE without an API key', async () => {
    const off = await makeApp({ modelClient: null });
    try {
      const c = client(off.app, (await signUp(off.app)).cookie);
      const { optionId } = await projectWithPlot(c);
      const r = await c.post(`/api/v1/options/${optionId}/agent-runs`, { prompt: 'R+3' });
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('AGENT_UNAVAILABLE');
    } finally {
      await off.close();
    }
  });
});
