import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { CreateExport } from '@fs/api-contract';
import { exportJob } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { requireUser, type Deps } from '../app.js';
import { versionFor } from '../services/access.js';
import { FsStorage } from '../services/storage.js';

type P = { Params: { id: string } };

export function registerExportRoutes(app: FastifyInstance, deps: Deps) {
  app.post<P>('/api/v1/versions/:id/exports', async (req, reply) => {
    const u = await requireUser(deps, req);
    await versionFor(deps.db, u, req.params.id);
    const body = CreateExport.parse(req.body);
    const [ex] = await deps.db.insert(exportJob).values({ recipeVersionId: req.params.id, kind: body.kind }).returning();
    await deps.jobs.enqueue('export.build', { id: ex!.id });
    reply.status(202);
    return { exportId: ex!.id };
  });

  app.get<P>('/api/v1/exports/:id', async (req) => {
    const u = await requireUser(deps, req);
    const [ex] = await deps.db.select().from(exportJob).where(eq(exportJob.id, req.params.id));
    if (!ex) throw new ProblemError('NOT_FOUND');
    await versionFor(deps.db, u, ex.recipeVersionId);
    const url = ex.status === 'done' && ex.storageKey ? await deps.storage.signedUrl(ex.storageKey, `${ex.recipeVersionId}.${ex.kind}`) : null;
    return { id: ex.id, kind: ex.kind, status: ex.status, url, error: ex.error };
  });

  // Signed downloads for the local filesystem storage (S3 serves its own signed URLs).
  app.get<{ Querystring: { key?: string; exp?: string; sig?: string; name?: string } }>('/api/v1/files', async (req, reply) => {
    const s = deps.storage;
    if (!(s instanceof FsStorage)) throw new ProblemError('NOT_FOUND');
    const { key, exp, sig, name } = req.query;
    if (!key || !exp || !sig || !s.verify(key, Number(exp), sig, Math.floor(Date.now() / 1000))) throw new ProblemError('FORBIDDEN');
    const body = await s.get(key);
    const type = key.endsWith('.pdf') ? 'application/pdf' : key.endsWith('.ifc') ? 'application/x-step' : 'application/json';
    reply.header('content-type', type);
    reply.header('access-control-allow-origin', deps.cfg.WEB_ORIGIN);
    if (name) reply.header('content-disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`);
    return reply.send(body);
  });
}
