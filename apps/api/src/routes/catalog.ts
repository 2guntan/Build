import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { jurisdiction, ruleSet } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { requireUser, type Deps } from '../app.js';

export function registerCatalogRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/api/v1/jurisdictions', async (req) => {
    await requireUser(deps, req);
    const js = await deps.db.select().from(jurisdiction);
    const sets = await deps.db
      .select({ id: ruleSet.id, jurisdictionId: ruleSet.jurisdictionId, version: ruleSet.version, status: ruleSet.status, isTest: ruleSet.isTest, content: ruleSet.content })
      .from(ruleSet);
    return js.map((j) => ({
      ...j,
      ruleSets: sets
        .filter((s) => s.jurisdictionId === j.id && (s.status === 'published' || deps.cfg.ALLOW_DRAFT_RULESETS))
        .map((s) => ({
          id: s.id,
          version: s.version,
          status: s.status,
          isTest: s.isTest,
          zones: (s.content as { zones: { id: string; name: string; name_en?: string }[] }).zones.map((z) => ({ id: z.id, name: z.name, name_en: z.name_en })),
        })),
    }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/rule-sets/:id', async (req) => {
    await requireUser(deps, req);
    const [rs] = await deps.db.select().from(ruleSet).where(eq(ruleSet.id, req.params.id));
    if (!rs) throw new ProblemError('NOT_FOUND');
    if (rs.status !== 'published' && !deps.cfg.ALLOW_DRAFT_RULESETS) throw new ProblemError('RULESET_NOT_PUBLISHED');
    return rs;
  });
}
