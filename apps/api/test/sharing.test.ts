import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, makeApp, projectWithPlot, signUp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.close(); });

// 1×1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('share links, thumbnails and members', () => {
  it('serves a read-only public view that can be revoked', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { projectId } = await projectWithPlot(c);
    const link = await c.post(`/api/v1/projects/${projectId}/share-links`, { days: 7 });
    expect(link.status).toBe(201);
    const pub = await ctx.app.inject({ method: 'GET', url: `/api/v1/shared/${link.body.token}` });
    expect(pub.statusCode).toBe(200);
    const body = pub.json();
    expect(body.project.name).toBe('Test Plateau');
    expect(body.options[0].recipe.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/@example\.com/);
    await c.del(`/api/v1/projects/${projectId}/share-links/${link.body.id}`);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1/shared/${link.body.token}` })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/shared/not-a-token' })).statusCode).toBe(404);
  });

  it('stores an option thumbnail and exposes it on the project card', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { projectId, optionId } = await projectWithPlot(c);
    expect((await c.put(`/api/v1/options/${optionId}/thumbnail`, { png: 'bm90IGEgcG5n' })).status).toBe(400);
    expect((await c.put(`/api/v1/options/${optionId}/thumbnail`, { png: PNG })).status).toBe(200);
    const p = await c.get(`/api/v1/projects/${projectId}`);
    expect(p.body.thumbnailUrl).toMatch(/files\?key=thumbnails/);
  });

  it('lets an owner add, change and remove members; others cannot', async () => {
    const owner = await signUp(ctx.app, 'Owner');
    const other = await signUp(ctx.app, 'Mate');
    const o = client(ctx.app, owner.cookie);
    const m = client(ctx.app, other.cookie);
    const orgId = (await o.get('/api/v1/me')).body.organizations[0].id;
    expect((await o.post(`/api/v1/orgs/${orgId}/members`, { email: 'nobody@example.com', role: 'editor' })).status).toBe(404);
    expect((await o.post(`/api/v1/orgs/${orgId}/members`, { email: other.email, role: 'viewer' })).status).toBe(201);
    const list = await o.get(`/api/v1/orgs/${orgId}/members`);
    expect(list.body.members).toHaveLength(2);
    // The viewer sees the org's projects but cannot write.
    const p = await o.post('/api/v1/projects', { name: 'Shared', orgId });
    expect((await m.get(`/api/v1/projects/${p.body.id}`)).status).toBe(200);
    expect((await m.patch(`/api/v1/projects/${p.body.id}`, { name: 'x' })).status).toBe(403);
    expect((await m.post(`/api/v1/orgs/${orgId}/members`, { email: owner.email, role: 'viewer' })).status).toBe(403);
    const mateId = list.body.members.find((x: { email: string }) => x.email === other.email).userId;
    expect((await o.patch(`/api/v1/orgs/${orgId}/members/${mateId}`, { role: 'editor' })).status).toBe(200);
    expect((await m.patch(`/api/v1/projects/${p.body.id}`, { name: 'Renamed' })).status).toBe(200);
    expect((await o.del(`/api/v1/orgs/${orgId}/members/${mateId}`)).status).toBe(204);
    expect((await m.get(`/api/v1/projects/${p.body.id}`)).status).toBe(404);
  });
});
