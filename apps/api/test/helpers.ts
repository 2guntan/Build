import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type Deps } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { createJobs } from '../src/jobs.js';
import { FsStorage } from '../src/services/storage.js';
import type { ModelClient } from '../src/agent/loop.js';
import { ScriptedModelClient } from '../src/agent/scripted-client.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export const ORIGIN = 'http://localhost:5173';

export async function makeApp(opts: { modelClient?: ModelClient | null; env?: Record<string, string> } = {}) {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    JOBS_ENABLED: 'false',
    STORAGE_DIR: mkdtempSync(join(tmpdir(), 'fs-storage-')),
    API_PUBLIC_URL: 'http://localhost:3001',
    WEB_ORIGIN: ORIGIN,
    IFC_SERVICE_URL: 'http://127.0.0.1:9',
    ...opts.env,
  });
  const { db, pool } = createDb(cfg.DATABASE_URL);
  const storage = new FsStorage(cfg);
  const jobs = await createJobs(cfg, db, storage);
  const { app, deps } = await buildApp({ cfg, db, storage, jobs, modelClient: opts.modelClient === undefined ? new ScriptedModelClient() : opts.modelClient });
  await app.ready();
  return { app, deps, close: async () => { await app.close(); await pool.end(); } };
}

let n = 0;
export async function signUp(app: FastifyInstance, name = 'Awa') {
  n += 1;
  const email = `${name.toLowerCase()}-${Date.now()}-${n}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-up/email',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: { email, password: 'correct-horse-battery', name },
  });
  if (res.statusCode !== 200) throw new Error(`sign-up failed ${res.statusCode} ${res.body}`);
  const raw = res.headers['set-cookie'];
  const cookies = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((c) => String(c).split(';')[0]).join('; ');
  return { email, cookie: cookies };
}

export function client(app: FastifyInstance, cookie: string) {
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie, origin: ORIGIN, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
    });
    let body: any = null;
    try { body = res.json(); } catch { body = res.body; }
    return { status: res.statusCode, body, headers: res.headers, raw: res };
  };
  return {
    get: (u: string) => call('GET', u),
    post: (u: string, p?: unknown) => call('POST', u, p ?? {}),
    put: (u: string, p: unknown) => call('PUT', u, p),
    patch: (u: string, p: unknown) => call('PATCH', u, p),
    del: (u: string) => call('DELETE', u),
  };
}

/** A ~40 × 30 m plot in central Dakar, in lon/lat. */
export function dakarPlot(): { type: 'Polygon'; coordinates: [number, number][][] } {
  const lon0 = -17.4677;
  const lat0 = 14.7167;
  const dLon = 40 / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const dLat = 30 / 110574;
  return { type: 'Polygon', coordinates: [[[lon0, lat0], [lon0 + dLon, lat0], [lon0 + dLon, lat0 + dLat], [lon0, lat0 + dLat], [lon0, lat0]]] };
}

/** Creates a project with a plot in the TEST zone and returns ids. */
export async function projectWithPlot(c: ReturnType<typeof client>) {
  const p = await c.post('/api/v1/projects', { name: 'Test Plateau' });
  if (p.status !== 201) throw new Error(JSON.stringify(p.body));
  const plot = await c.put(`/api/v1/projects/${p.body.id}/plot`, { geojson: dakarPlot(), zoneId: 'test-r', edgeClasses: ['front', 'side', 'rear', 'side'] });
  if (plot.status !== 200) throw new Error(JSON.stringify(plot.body));
  const o = await c.post(`/api/v1/projects/${p.body.id}/options`, { name: 'Option A' });
  if (o.status !== 201) throw new Error(JSON.stringify(o.body));
  return { projectId: p.body.id as string, optionId: o.body.id as string, plot: plot.body };
}

export type { Deps };
