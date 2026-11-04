import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { membership, organization } from '../db/schema.js';
import { requireUser, type Deps } from '../app.js';

export function registerAuthRoutes(app: FastifyInstance, deps: Deps) {
  // Better Auth handles sign-up, sign-in, sign-out, OAuth callbacks.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/v1/auth/*',
    handler: async (req, reply) => {
      const url = new URL(req.url, deps.cfg.API_PUBLIC_URL);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      }
      const res = await deps.auth.handler(
        new Request(url, {
          method: req.method,
          headers,
          ...(req.body !== undefined && req.method !== 'GET' ? { body: JSON.stringify(req.body) } : {}),
        }),
      );
      reply.status(res.status);
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(res.body ? Buffer.from(await res.arrayBuffer()) : null);
    },
  });

  app.get('/api/v1/me', async (req) => {
    const u = await requireUser(deps, req);
    const orgs = await deps.db
      .select({ id: organization.id, name: organization.name, role: membership.role })
      .from(membership)
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .where(eq(membership.userId, u.userId));
    return { user: { id: u.userId, name: u.name, email: u.email }, organizations: orgs };
  });
}
