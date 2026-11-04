import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { contextBuilding, designOption, evaluation, membership, organization, plot, project, recipeVersion, shareLink, user } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';
import { requireUser, type Deps } from '../app.js';
import { optionFor, orgRole, projectFor } from '../services/access.js';
import { projectContext } from '../services/evaluation.js';
import { frameFor, outerRingLonLat, plotSummary, type PlotRow } from '../services/site.js';

type P = { Params: { id: string } };
const MAX_THUMB_BYTES = 400 * 1024;

export function registerSharingRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps;

  /* ---------- Thumbnails ---------- */
  app.put<P>('/api/v1/options/:id/thumbnail', async (req) => {
    const u = await requireUser(deps, req);
    await optionFor(db, u, req.params.id, 'editor');
    const body = z.object({ png: z.string().max(Math.ceil((MAX_THUMB_BYTES * 4) / 3) + 64) }).parse(req.body);
    const b64 = body.png.replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.subarray(0, 4).toString('hex') !== '89504e47') throw new ProblemError('VALIDATION_FAILED', 'Expected a PNG');
    const key = `thumbnails/${req.params.id}.png`;
    await deps.storage.put(key, buf, 'image/png');
    await db.update(designOption).set({ thumbnailKey: key }).where(eq(designOption.id, req.params.id));
    return { ok: true };
  });

  /* ---------- Share links (read-only presentation) ---------- */
  app.post<P>('/api/v1/projects/:id/share-links', async (req, reply) => {
    const u = await requireUser(deps, req);
    const { project: p } = await projectFor(db, u, req.params.id, 'editor');
    const days = z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(req.body ?? {}).days;
    const token = randomBytes(18).toString('base64url');
    const [l] = await db.insert(shareLink).values({ projectId: p.id, token, createdBy: u.userId, expiresAt: new Date(Date.now() + days * 86400_000) }).returning();
    reply.status(201);
    return { id: l!.id, token, expiresAt: l!.expiresAt };
  });

  app.get<P>('/api/v1/projects/:id/share-links', async (req) => {
    const u = await requireUser(deps, req);
    await projectFor(db, u, req.params.id);
    return db.select({ id: shareLink.id, token: shareLink.token, createdAt: shareLink.createdAt, expiresAt: shareLink.expiresAt }).from(shareLink).where(and(eq(shareLink.projectId, req.params.id), isNull(shareLink.revokedAt)));
  });

  app.delete<{ Params: { id: string; linkId: string } }>('/api/v1/projects/:id/share-links/:linkId', async (req, reply) => {
    const u = await requireUser(deps, req);
    await projectFor(db, u, req.params.id, 'editor');
    await db.update(shareLink).set({ revokedAt: new Date() }).where(and(eq(shareLink.id, req.params.linkId), eq(shareLink.projectId, req.params.id)));
    return reply.status(204).send();
  });

  /** Public: no session. Returns only what the presentation needs (no ids of users, no prompts). */
  app.get<{ Params: { token: string } }>('/api/v1/shared/:token', async (req) => {
    const [l] = await db.select().from(shareLink).where(eq(shareLink.token, req.params.token));
    if (!l || l.revokedAt || (l.expiresAt && l.expiresAt < new Date())) throw new ProblemError('NOT_FOUND');
    const [p] = await db.select().from(project).where(eq(project.id, l.projectId));
    if (!p || p.archived) throw new ProblemError('NOT_FOUND');
    const ctx = await projectContext(db, deps.cfg, p.id);
    const [pl] = await db.select().from(plot).where(eq(plot.projectId, p.id));
    const opts = await db.select().from(designOption).where(and(eq(designOption.projectId, p.id), eq(designOption.isArchived, false))).orderBy(designOption.createdAt);
    const heads = opts.map((o) => o.headVersionId).filter((h): h is string => !!h);
    const versions = heads.length ? await db.select().from(recipeVersion).where(inArray(recipeVersion.id, heads)) : [];
    const evs = heads.length ? await db.select().from(evaluation).where(inArray(evaluation.recipeVersionId, heads)) : [];
    const buildings = await db.select().from(contextBuilding).where(and(eq(contextBuilding.projectId, p.id), eq(contextBuilding.deleted, false)));
    const frame = pl ? frameFor(pl) : null;
    return {
      project: { name: p.name, currency: p.currency, ruleSetIsTest: ctx.isTest },
      plot: pl ? plotSummary(pl as PlotRow, ctx.zone) : null,
      zone: ctx.zone,
      context: frame ? buildings.map((b) => ({ id: b.id, heightM: b.heightM, dataSource: b.dataSource, local: outerRingLonLat(b.geom).map(([lon, lat]) => frame.toLocal(lon, lat)) })) : [],
      options: opts.map((o) => ({
        id: o.id,
        name: o.name,
        recipe: versions.find((v) => v.id === o.headVersionId)?.recipe ?? null,
        evaluation: (() => {
          const e = evs.find((x) => x.recipeVersionId === o.headVersionId);
          return e ? { compliance: e.compliance, metrics: e.metrics, yield: e.yield } : null;
        })(),
      })),
      expiresAt: l.expiresAt,
    };
  });

  /* ---------- Members ---------- */
  const requireOwner = async (userId: string, orgId: string) => {
    const role = await orgRole(db, userId, orgId);
    if (!role) throw new ProblemError('NOT_FOUND');
    return role;
  };

  app.get<P>('/api/v1/orgs/:id/members', async (req) => {
    const u = await requireUser(deps, req);
    await requireOwner(u.userId, req.params.id);
    const [org] = await db.select().from(organization).where(eq(organization.id, req.params.id));
    const rows = await db
      .select({ userId: membership.userId, role: membership.role, name: user.name, email: user.email })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.orgId, req.params.id));
    return { organization: { id: org!.id, name: org!.name }, members: rows };
  });

  app.post<P>('/api/v1/orgs/:id/members', async (req, reply) => {
    const u = await requireUser(deps, req);
    if ((await requireOwner(u.userId, req.params.id)) !== 'owner') throw new ProblemError('FORBIDDEN');
    const b = z.object({ email: z.string().email(), role: z.enum(['owner', 'editor', 'viewer']) }).parse(req.body);
    const [target] = await db.select().from(user).where(eq(user.email, b.email.toLowerCase()));
    if (!target) {
      throw new ProblemError('NOT_FOUND', 'No account with this email', undefined, {
        fr: "Aucun compte avec cet e-mail : la personne doit d'abord créer un compte.",
        en: 'No account with this email: the person must sign up first.',
      });
    }
    await db.insert(membership).values({ orgId: req.params.id, userId: target.id, role: b.role }).onConflictDoUpdate({ target: [membership.orgId, membership.userId], set: { role: b.role } });
    reply.status(201);
    return { userId: target.id, role: b.role };
  });

  app.patch<{ Params: { id: string; userId: string } }>('/api/v1/orgs/:id/members/:userId', async (req) => {
    const u = await requireUser(deps, req);
    if ((await requireOwner(u.userId, req.params.id)) !== 'owner') throw new ProblemError('FORBIDDEN');
    const b = z.object({ role: z.enum(['owner', 'editor', 'viewer']) }).parse(req.body);
    if (req.params.userId === u.userId && b.role !== 'owner') throw new ProblemError('CONFLICT', 'An owner cannot demote themselves');
    await db.update(membership).set({ role: b.role }).where(and(eq(membership.orgId, req.params.id), eq(membership.userId, req.params.userId)));
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>('/api/v1/orgs/:id/members/:userId', async (req, reply) => {
    const u = await requireUser(deps, req);
    if ((await requireOwner(u.userId, req.params.id)) !== 'owner') throw new ProblemError('FORBIDDEN');
    if (req.params.userId === u.userId) throw new ProblemError('CONFLICT', 'An owner cannot remove themselves');
    await db.delete(membership).where(and(eq(membership.orgId, req.params.id), eq(membership.userId, req.params.userId)));
    return reply.status(204).send();
  });
}
