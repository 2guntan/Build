import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, makeApp, projectWithPlot, signUp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.close(); });

describe('auth and organizations', () => {
  it('creates an organization on sign-up and returns it in /me', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Moussa');
    const me = await client(ctx.app, cookie).get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.organizations).toHaveLength(1);
    expect(me.body.organizations[0].role).toBe('owner');
  });
  it('rejects anonymous requests with problem+json', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.json().code).toBe('UNAUTHENTICATED');
    expect(res.json().message_fr).toBeTruthy();
  });
});

describe('projects, plot and options', () => {
  it('sets a plot, computes area in PostGIS and the buildable area', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { projectId, plot } = await projectWithPlot(c);
    expect(plot.areaM2).toBeGreaterThan(1150);
    expect(plot.areaM2).toBeLessThan(1250);
    expect(plot.buildable.length).toBeGreaterThanOrEqual(4);
    expect(plot.edges.map((e: any) => e.class)).toEqual(['front', 'side', 'rear', 'side']);
    const list = await c.get('/api/v1/projects');
    expect(list.body.map((p: any) => p.id)).toContain(projectId);
    expect(list.body[0].ruleSetIsTest).toBe(true);
  });

  it('rejects an invalid plot', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const p = await c.post('/api/v1/projects', { name: 'x' });
    const bowtie = { type: 'Polygon', coordinates: [[[-17.46, 14.71], [-17.459, 14.711], [-17.459, 14.71], [-17.46, 14.711], [-17.46, 14.71]]] };
    const r = await c.put(`/api/v1/projects/${p.body.id}/plot`, { geojson: bowtie });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('PLOT_INVALID');
  });

  it('stores versions, re-evaluates on the server and supports undo', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { optionId } = await projectWithPlot(c);
    const o1 = await c.get(`/api/v1/options/${optionId}`);
    expect(o1.body.head).toBeTruthy();
    expect(o1.body.evaluation.compliance.test).toBe(true);
    expect(o1.body.evaluation.compliance.compliant).toBe(true); // starter block fits the buildable area
    const recipe = structuredClone(o1.body.head.recipe);
    recipe.params.floorsA.value = 8;
    // A client-side result is never trusted: the server recomputes the evaluation.
    const save = await c.post(`/api/v1/options/${optionId}/versions`, { recipe, authorKind: 'slider', parentId: o1.body.head.id, metrics: { gfaM2: 1 } });
    expect(save.status).toBe(201);
    const o2 = await c.get(`/api/v1/options/${optionId}`);
    expect(o2.body.head.id).toBe(save.body.version.id);
    // Starter block: 4 floors; doubling the floors doubles the GFA.
    expect(o2.body.evaluation.metrics.gfaM2).toBeCloseTo(o1.body.evaluation.metrics.gfaM2 * 2, 0); // 4 → 8 floors
    expect(o2.body.head.parentId).toBe(o1.body.head.id);
    // Stale parent → conflict
    const stale = await c.post(`/api/v1/options/${optionId}/versions`, { recipe, authorKind: 'slider', parentId: o1.body.head.id });
    expect(stale.status).toBe(409);
    // Undo moves the head back; versions are never deleted.
    const undo = await c.post(`/api/v1/options/${optionId}/head`, { versionId: o1.body.head.id });
    expect(undo.body.head.id).toBe(o1.body.head.id);
    const hist = await c.get(`/api/v1/options/${optionId}/versions`);
    expect(hist.body).toHaveLength(2);
    // Reload restores the exact state
    const reload = await c.get(`/api/v1/options/${optionId}`);
    expect(reload.body.head.recipe).toEqual(o1.body.head.recipe);
  });

  it('rejects a recipe that fails the schema', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { optionId } = await projectWithPlot(c);
    const r = await c.post(`/api/v1/options/${optionId}/versions`, { recipe: { schemaVersion: 1, blocks: 'nope' } });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('RECIPE_SCHEMA_INVALID');
    expect(r.body.issues.length).toBeGreaterThan(0);
  });

  it('duplicates an option and compares options', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { projectId, optionId } = await projectWithPlot(c);
    const dup = await c.post(`/api/v1/projects/${projectId}/options`, { name: 'Option B', duplicateFrom: optionId });
    expect(dup.status).toBe(201);
    const cmp = await c.get(`/api/v1/projects/${projectId}/compare?options=${optionId},${dup.body.id}`);
    expect(cmp.body).toHaveLength(2);
    expect(cmp.body[0].metrics.gfaM2).toBe(cmp.body[1].metrics.gfaM2);
  });

  it('stores yield assumptions and recomputes margin on the next save', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { projectId, optionId } = await projectWithPlot(c);
    const put = await c.put(`/api/v1/projects/${projectId}/yield-assumptions`, {
      salePricePerM2: { retail: 900000, residential: 750000 }, buildCostPerM2: { retail: 400000, residential: 350000 },
      landCost: 100000000, softCostRatio: 0.1, parkingCostPerSpace: 0, unitSizesM2: { T2: 55, T3: 75, T4: 95 },
    });
    expect(put.status).toBe(200);
    const o = await c.get(`/api/v1/options/${optionId}`);
    const save = await c.post(`/api/v1/options/${optionId}/versions`, { recipe: o.body.head.recipe });
    expect(save.body.evaluation.yield.complete).toBe(true);
    expect(save.body.evaluation.yield.margin).toBeTypeOf('number');
  });
});

describe('demo project', () => {
  it('creates a plot, labelled synthetic context and three options', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const p = await c.post('/api/v1/projects/demo', { locale: 'fr' });
    expect(p.status).toBe(201);
    const opts = await c.get(`/api/v1/projects/${p.body.id}/options`);
    expect(opts.body).toHaveLength(3);
    const cx = await c.get(`/api/v1/projects/${p.body.id}/context`);
    expect(cx.body.buildings.length).toBeGreaterThan(50);
    expect(cx.body.buildings.every((b: { dataSource: string }) => b.dataSource === 'demo-synthetic')).toBe(true);
    for (const o of opts.body) {
      const full = await c.get(`/api/v1/options/${o.id}`);
      expect(full.body.evaluation.compliance.compliant).toBe(true);
    }
  });
});
