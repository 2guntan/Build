import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { createAuth, type Auth } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { AgentService } from './agent/service.js';
import { AnthropicModelClient } from './agent/anthropic-client.js';
import { ScriptedModelClient } from './agent/scripted-client.js';
import type { ModelClient } from './agent/loop.js';
import { ProblemError, registerErrorHandler } from './http/problem.js';
import type { Jobs } from './jobs.js';
import type { Storage } from './services/storage.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerOptionRoutes } from './routes/options.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerExportRoutes } from './routes/exports.js';

export interface Deps {
  cfg: Config;
  db: Db;
  auth: Auth;
  storage: Storage;
  jobs: Jobs;
  agent: AgentService;
}

export async function requireUser(deps: Deps, req: FastifyRequest): Promise<{ userId: string; email: string; name: string }> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const s = await deps.auth.api.getSession({ headers });
  if (!s) throw new ProblemError('UNAUTHENTICATED');
  return { userId: s.user.id, email: s.user.email, name: s.user.name };
}

export function pickModelClient(cfg: Config): ModelClient | null {
  if (cfg.ANTHROPIC_API_KEY) return new AnthropicModelClient(cfg.ANTHROPIC_API_KEY);
  if (cfg.AGENT_OFFLINE) return new ScriptedModelClient();
  return null;
}

export async function buildApp(a: {
  cfg: Config;
  db: Db;
  storage: Storage;
  jobs: Jobs;
  modelClient?: ModelClient | null;
}): Promise<{ app: FastifyInstance; deps: Deps }> {
  const app = Fastify({
    logger: a.cfg.NODE_ENV === 'test' ? false : { level: a.cfg.LOG_LEVEL },
    bodyLimit: 8 * 1024 * 1024,
    genReqId: () => crypto.randomUUID(),
  });
  await app.register(cors, { origin: [a.cfg.WEB_ORIGIN], credentials: true });
  registerErrorHandler(app);
  const auth = createAuth(a.db, a.cfg);
  const modelClient = a.modelClient === undefined ? pickModelClient(a.cfg) : a.modelClient;
  const deps: Deps = { ...a, auth, agent: new AgentService(a.db, a.cfg, modelClient) };
  app.get('/health', async () => ({ ok: true, agent: deps.agent.available }));
  registerAuthRoutes(app, deps);
  registerCatalogRoutes(app, deps);
  registerProjectRoutes(app, deps);
  registerOptionRoutes(app, deps);
  registerAgentRoutes(app, deps);
  registerExportRoutes(app, deps);
  return { app, deps };
}
