import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { client, makeApp, projectWithPlot, signUp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
let received: any = null;
const ifcStub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/ifc/validate') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, checks: [] }));
    }
    received = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'application/x-step' });
    res.end('ISO-10303-21;\nEND-ISO-10303-21;\n');
  });
});

beforeAll(async () => {
  await new Promise<void>((r) => ifcStub.listen(0, '127.0.0.1', () => r()));
  const port = (ifcStub.address() as { port: number }).port;
  ctx = await makeApp({ env: { IFC_SERVICE_URL: `http://127.0.0.1:${port}`, DEM_URL_TEMPLATE: 'http://127.0.0.1:9/{name}.tif' } });
});
afterAll(async () => { await ctx.close(); ifcStub.close(); });

describe('exports', () => {
  it('renders a PDF summary and serves it through a signed URL', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { optionId } = await projectWithPlot(c);
    const head = (await c.get(`/api/v1/options/${optionId}`)).body.head;
    const ex = await c.post(`/api/v1/versions/${head.id}/exports`, { kind: 'pdf' });
    const st = await c.get(`/api/v1/exports/${ex.body.exportId}`);
    expect(st.body.status).toBe('done');
    const url = new URL(st.body.url);
    const dl = await ctx.app.inject({ method: 'GET', url: url.pathname + url.search });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    const tampered = await ctx.app.inject({ method: 'GET', url: url.pathname + url.search.replace(/sig=[0-9a-f]/, 'sig=0') });
    expect(tampered.statusCode).toBe(403);
  });

  it('sends the BuildResult contract to the IFC service', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { optionId } = await projectWithPlot(c);
    const head = (await c.get(`/api/v1/options/${optionId}`)).body.head;
    const ex = await c.post(`/api/v1/versions/${head.id}/exports`, { kind: 'ifc' });
    const st = await c.get(`/api/v1/exports/${ex.body.exportId}`);
    expect(st.body.status).toBe('done');
    expect(received.site.origin.crs).toBe('EPSG:32628');
    expect(received.site.originUtm).toHaveLength(2);
    expect(received.blocks[0].storeys.length).toBe(4);
    expect(received.blocks[0].storeys[0].use).toBe('retail');
  });
});

describe('site data import', () => {
  it('copies nearby reference buildings, de-duplicates by IoU and labels heights', async () => {
    const c = client(ctx.app, (await signUp(ctx.app)).cookie);
    const { projectId } = await projectWithPlot(c);
    // Two overlapping footprints from different sources ~60 m east, and one far away.
    const sq = (lon: number, lat: number, d = 0.0001) => `SRID=4326;POLYGON((${lon} ${lat},${lon + d} ${lat},${lon + d} ${lat + d},${lon} ${lat + d},${lon} ${lat}))`;
    await ctx.deps.db.execute(sql`INSERT INTO ref_building (id, geom, height_m, height_source, data_source, priority) VALUES
      ('rb_t1_${sql.raw(projectId)}', ${sq(-17.4667, 14.7168)}, 12, 'measured', 'osm', 3),
      ('rb_t2_${sql.raw(projectId)}', ${sq(-17.46669, 14.71681)}, 6, 'default', 'google-open-buildings', 1),
      ('rb_t3_${sql.raw(projectId)}', ${sq(-17.40, 14.70)}, 9, 'estimated', 'overture', 2)`);
    const job = await c.post(`/api/v1/projects/${projectId}/site-data`, {});
    expect(job.status).toBe(202);
    const ctxRes = await c.get(`/api/v1/projects/${projectId}/context`);
    expect(ctxRes.body.import.status).toBe('done');
    const near = ctxRes.body.buildings;
    expect(near).toHaveLength(1);
    expect(near[0].dataSource).toBe('google-open-buildings');
    expect(near[0].local[0][0]).toBeGreaterThan(50);
    expect(String(ctxRes.body.import.stats.terrain)).toMatch(/unavailable/);
    const edit = await c.patch(`/api/v1/projects/${projectId}/context/${near[0].id}`, { heightM: 21 });
    expect(edit.body.heightSource).toBe('user');
  });
});
