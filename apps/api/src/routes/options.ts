import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { MoveHead, SaveVersion } from '@fs/api-contract';
import { designOption } from '../db/schema.js';
import { requireUser, type Deps } from '../app.js';
import { optionFor } from '../services/access.js';
import { history, moveHead, optionWithHead, saveVersion } from '../services/options.js';

type P = { Params: { id: string } };

export function registerOptionRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps;

  app.get<P>('/api/v1/options/:id', async (req) => {
    const u = await requireUser(deps, req);
    await optionFor(db, u, req.params.id);
    return optionWithHead(db, req.params.id);
  });

  app.patch<P>('/api/v1/options/:id', async (req) => {
    const u = await requireUser(deps, req);
    await optionFor(db, u, req.params.id, 'editor');
    const body = z
      .object({ name: z.string().min(1).max(120).optional(), isArchived: z.boolean().optional(), nonCompliantStudy: z.boolean().optional() })
      .parse(req.body ?? {});
    const [o] = await db.update(designOption).set(body).where(eq(designOption.id, req.params.id)).returning();
    return o;
  });

  app.post<P>('/api/v1/options/:id/versions', async (req, reply) => {
    const u = await requireUser(deps, req);
    await optionFor(db, u, req.params.id, 'editor');
    const body = SaveVersion.parse(req.body);
    const saved = await saveVersion(db, deps.cfg, {
      optionId: req.params.id,
      recipe: body.recipe,
      authorKind: body.authorKind,
      authorId: u.userId,
      summary: body.summary,
      parentId: body.parentId,
    });
    reply.status(201);
    return saved;
  });

  app.get<P>('/api/v1/options/:id/versions', async (req) => {
    const u = await requireUser(deps, req);
    await optionFor(db, u, req.params.id);
    return history(db, req.params.id);
  });

  app.post<P>('/api/v1/options/:id/head', async (req) => {
    const u = await requireUser(deps, req);
    await optionFor(db, u, req.params.id, 'editor');
    const body = MoveHead.parse(req.body);
    return moveHead(db, req.params.id, body.versionId);
  });
}
