import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { AcceptAgentRun, StartAgentRun } from '@fs/api-contract';
import { agentRun } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { requireUser, type Deps } from '../app.js';
import { optionFor } from '../services/access.js';

type P = { Params: { id: string } };

async function runFor(deps: Deps, userId: string, runId: string, min: 'viewer' | 'editor' = 'viewer') {
  const [run] = await deps.db.select().from(agentRun).where(eq(agentRun.id, runId));
  if (!run) throw new ProblemError('NOT_FOUND');
  await optionFor(deps.db, { userId }, run.optionId, min);
  return run;
}

export function registerAgentRoutes(app: FastifyInstance, deps: Deps) {
  app.post<P>('/api/v1/options/:id/agent-runs', async (req, reply) => {
    const u = await requireUser(deps, req);
    const { project } = await optionFor(deps.db, u, req.params.id, 'editor');
    const body = StartAgentRun.parse(req.body);
    const runId = await deps.agent.start({ optionId: req.params.id, orgId: project.orgId, userId: u.userId, prompt: body.prompt, image: body.image, locale: body.locale });
    reply.status(202);
    return { runId };
  });

  app.get<P>('/api/v1/agent-runs/:id', async (req) => {
    const u = await requireUser(deps, req);
    return runFor(deps, u.userId, req.params.id);
  });

  app.get<P>('/api/v1/agent-runs/:id/stream', async (req, reply) => {
    const u = await requireUser(deps, req);
    await runFor(deps, u.userId, req.params.id);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': deps.cfg.WEB_ORIGIN,
      'access-control-allow-credentials': 'true',
    });
    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());
    await deps.agent.stream(req.params.id, (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`), ac.signal);
    res.end();
  });

  app.post<P>('/api/v1/agent-runs/:id/accept', async (req) => {
    const u = await requireUser(deps, req);
    await runFor(deps, u.userId, req.params.id, 'editor');
    const body = AcceptAgentRun.parse(req.body ?? {});
    return deps.agent.accept(req.params.id, u.userId, body.candidateId);
  });
}
