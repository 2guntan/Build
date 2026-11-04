import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { designOption, membership, project, recipeVersion } from '../db/schema.js';
import { ProblemError } from '../http/problem.js';

export type Role = 'owner' | 'editor' | 'viewer';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export interface Actor {
  userId: string;
}

export async function orgRole(db: Db, userId: string, orgId: string): Promise<Role | null> {
  const [m] = await db
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.orgId, orgId)));
  return m?.role ?? null;
}

function check(role: Role | null, min: Role) {
  // Not a member → 404, so project ids from other organizations are not disclosed.
  if (!role) throw new ProblemError('NOT_FOUND');
  if (RANK[role] < RANK[min]) throw new ProblemError('FORBIDDEN');
}

/** Loads a project the actor can access with at least `min` role. Every project query goes through here. */
export async function projectFor(db: Db, actor: Actor, projectId: string, min: Role = 'viewer') {
  const [row] = await db
    .select({ project, role: membership.role })
    .from(project)
    .leftJoin(membership, and(eq(membership.orgId, project.orgId), eq(membership.userId, actor.userId)))
    .where(eq(project.id, projectId));
  if (!row) throw new ProblemError('NOT_FOUND');
  check(row.role, min);
  return { project: row.project, role: row.role! };
}

export async function optionFor(db: Db, actor: Actor, optionId: string, min: Role = 'viewer') {
  const [opt] = await db.select().from(designOption).where(eq(designOption.id, optionId));
  if (!opt) throw new ProblemError('NOT_FOUND');
  const p = await projectFor(db, actor, opt.projectId, min);
  return { option: opt, ...p };
}

export async function versionFor(db: Db, actor: Actor, versionId: string, min: Role = 'viewer') {
  const [v] = await db.select().from(recipeVersion).where(eq(recipeVersion.id, versionId));
  if (!v) throw new ProblemError('NOT_FOUND');
  const o = await optionFor(db, actor, v.optionId, min);
  return { version: v, ...o };
}
