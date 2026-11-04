import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, makeApp, projectWithPlot, signUp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.close(); });

describe('organization isolation', () => {
  it('a user cannot read or write another organization\'s data', async () => {
    const a = client(ctx.app, (await signUp(ctx.app, 'Alice')).cookie);
    const b = client(ctx.app, (await signUp(ctx.app, 'Bob')).cookie);
    const { projectId, optionId } = await projectWithPlot(a);
    const head = (await a.get(`/api/v1/options/${optionId}`)).body.head;
    const exp = await a.post(`/api/v1/versions/${head.id}/exports`, { kind: 'pdf' });
    const run = await a.post(`/api/v1/options/${optionId}/agent-runs`, { prompt: 'R+4 logements' });
    await ctx.deps.agent.waitFor(run.body.runId);

    const reads = [
      `/api/v1/projects/${projectId}`,
      `/api/v1/projects/${projectId}/options`,
      `/api/v1/projects/${projectId}/context`,
      `/api/v1/projects/${projectId}/yield-assumptions`,
      `/api/v1/projects/${projectId}/compare?options=${optionId}`,
      `/api/v1/options/${optionId}`,
      `/api/v1/options/${optionId}/versions`,
      `/api/v1/exports/${exp.body.exportId}`,
      `/api/v1/agent-runs/${run.body.runId}`,
      `/api/v1/agent-runs/${run.body.runId}/stream`,
    ];
    for (const u of reads) expect((await b.get(u)).status, u).toBe(404);
    const writes: [string, string, unknown][] = [
      ['PATCH', `/api/v1/projects/${projectId}`, { name: 'pwned' }],
      ['PUT', `/api/v1/projects/${projectId}/plot`, { geojson: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]] } }],
      ['POST', `/api/v1/options/${optionId}/versions`, { recipe: head.recipe }],
      ['POST', `/api/v1/options/${optionId}/head`, { versionId: head.id }],
      ['POST', `/api/v1/options/${optionId}/agent-runs`, { prompt: 'x' }],
      ['POST', `/api/v1/agent-runs/${run.body.runId}/accept`, {}],
      ['POST', `/api/v1/versions/${head.id}/exports`, { kind: 'pdf' }],
      ['POST', `/api/v1/projects/${projectId}/options`, { name: 'x' }],
      ['DELETE', `/api/v1/projects/${projectId}`, undefined],
    ];
    for (const [m, u, p] of writes) {
      const r = m === 'PATCH' ? await b.patch(u, p) : m === 'PUT' ? await b.put(u, p) : m === 'DELETE' ? await b.del(u) : await b.post(u, p);
      expect(r.status, `${m} ${u}`).toBe(404);
    }
    expect((await b.get('/api/v1/projects')).body.map((p: any) => p.id)).not.toContain(projectId);
    // Owner still sees the untouched project.
    expect((await a.get(`/api/v1/projects/${projectId}`)).body.name).toBe('Test Plateau');
  });
});
