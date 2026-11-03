import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, forbidden, notFound, parseInput, unauthenticated } from "@retero/shared/errors";
import type { Executor } from "@retero/db";
import { schema } from "@retero/db";
import { canGrantRole } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { loadScope } from "../tenancy/scope";
import { recordAudit } from "../audit";

const { memberships, roles, staffInvitations } = schema;

export const grantRoleInput = z.object({
  userId: z.uuid(),
  roleKey: z.string().min(1).max(64),
  target: z.discriminatedUnion("level", [
    z.object({ level: z.literal("platform") }),
    z.object({ level: z.literal("brand"), id: z.uuid() }),
    z.object({ level: z.literal("franchisee"), id: z.uuid() }),
    z.object({ level: z.literal("branch"), id: z.uuid() }),
  ]),
});
export type GrantRoleInput = z.input<typeof grantRoleInput>;

function scopeColumns(scope: ResourceScope) {
  return {
    brandId: scope.level === "platform" ? null : scope.brandId,
    franchiseeId: scope.level === "franchisee" ? scope.franchiseeId : null,
    branchId: scope.level === "branch" ? scope.branchId : null,
  };
}

/**
 * Grant a role at a scope. Authorization is checked here AND enforced again
 * by the memberships_insert RLS policy (app.can_grant).
 */
export async function grantRole(tx: Executor, actor: Actor, raw: GrantRoleInput, ctx: { requestId?: string } = {}) {
  if (actor.kind === "anonymous") throw unauthenticated();
  const input = parseInput(grantRoleInput, raw);
  const scope = await loadScope(tx, input.target);

  const brandId = scope.level === "platform" ? null : scope.brandId;
  // Brand-specific role with this key wins over the system role of the same key.
  const [role] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.key, input.roleKey), brandId ? or(eq(roles.brandId, brandId), isNull(roles.brandId)) : isNull(roles.brandId)))
    .orderBy(sql`${roles.brandId} nulls last`)
    .limit(1);
  if (!role) throw notFound("Role");
  if (role.scopeType !== scope.level) {
    throw new AppError("VALIDATION_FAILED", `Role ${role.key} is granted at ${role.scopeType} level, not ${scope.level}.`);
  }
  if (!canGrantRole(actor, role.rank, scope)) throw forbidden();

  const inserted = await tx
    .insert(memberships)
    .values({
      userId: input.userId,
      roleId: role.id,
      scopeType: role.scopeType,
      ...scopeColumns(scope),
      grantedBy: actor.kind === "user" ? actor.userId : null,
    })
    .onConflictDoNothing()
    .returning({ id: memberships.id });
  const membership = inserted[0];
  if (!membership) throw conflict("That person already has this role here.");

  await recordAudit(tx, actor, {
    action: "membership.grant",
    scope,
    targetType: "membership",
    targetId: membership.id,
    metadata: { userId: input.userId, role: role.key },
    requestId: ctx.requestId ?? null,
  });
  return membership;
}

export async function revokeMembership(tx: Executor, actor: Actor, membershipId: string, ctx: { requestId?: string } = {}) {
  if (actor.kind !== "user") throw unauthenticated();
  const id = parseInput(z.uuid(), membershipId);
  const [m] = await tx
    .select({
      id: memberships.id, userId: memberships.userId, scopeType: memberships.scopeType,
      brandId: memberships.brandId, franchiseeId: memberships.franchiseeId, branchId: memberships.branchId,
      revokedAt: memberships.revokedAt, rank: roles.rank, roleKey: roles.key,
    })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.id, id));
  if (!m) throw notFound("Membership");
  if (m.revokedAt) return;

  const ref =
    m.scopeType === "platform" ? ({ level: "platform" } as const)
    : m.scopeType === "brand" ? ({ level: "brand", id: m.brandId! } as const)
    : m.scopeType === "franchisee" ? ({ level: "franchisee", id: m.franchiseeId! } as const)
    : ({ level: "branch", id: m.branchId! } as const);
  const scope = await loadScope(tx, ref);
  if (!canGrantRole(actor, m.rank, scope)) throw forbidden();

  await tx
    .update(memberships)
    .set({ revokedAt: new Date(), revokedBy: actor.userId })
    .where(and(eq(memberships.id, id), isNull(memberships.revokedAt)));

  await recordAudit(tx, actor, {
    action: "membership.revoke", scope, targetType: "membership", targetId: id,
    metadata: { userId: m.userId, role: m.roleKey }, requestId: ctx.requestId ?? null,
  });
}

/* ── Invitations ─────────────────────────────────────────────────── */

export const inviteInput = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  roleKey: z.string().min(1).max(64),
  target: grantRoleInput.shape.target,
});

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

/**
 * Invite someone by email. Returns the raw token ONCE (to put in the link);
 * only its hash is stored. Authorization: same rule as granting the role.
 */
export async function inviteStaff(tx: Executor, actor: Actor, raw: unknown, ctx: { requestId?: string } = {}) {
  if (actor.kind !== "user") throw unauthenticated();
  const input = parseInput(inviteInput, raw);
  const scope = await loadScope(tx, input.target);
  const brandId = scope.level === "platform" ? null : scope.brandId;
  const [role] = await tx.select().from(roles)
    .where(and(eq(roles.key, input.roleKey), brandId ? or(eq(roles.brandId, brandId), isNull(roles.brandId)) : isNull(roles.brandId)))
    .orderBy(sql`${roles.brandId} nulls last`).limit(1);
  if (!role) throw notFound("Role");
  if (role.scopeType !== scope.level) throw new AppError("VALIDATION_FAILED", `Role ${role.key} is granted at ${role.scopeType} level, not ${scope.level}.`);
  if (!canGrantRole(actor, role.rank, scope)) throw forbidden();

  const token = randomBytes(32).toString("base64url");
  const [inv] = await tx.insert(staffInvitations).values({
    email: input.email, roleId: role.id, scopeType: role.scopeType, ...scopeColumns(scope),
    tokenHash: hashToken(token), invitedBy: actor.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  }).returning({ id: staffInvitations.id, expiresAt: staffInvitations.expiresAt });
  await recordAudit(tx, actor, {
    action: "invitation.create", scope, targetType: "staff_invitation", targetId: inv!.id,
    metadata: { email: input.email, role: role.key }, requestId: ctx.requestId ?? null,
  });
  return { invitationId: inv!.id, token, expiresAt: inv!.expiresAt, role: role.key };
}

/** Accept as the signed-in user. All checks run in app.accept_invitation (SECURITY DEFINER). */
export async function acceptInvitation(tx: Executor, actor: Actor, token: string): Promise<string | null> {
  if (actor.kind !== "user") throw unauthenticated();
  const t = parseInput(z.string().min(20).max(100), token);
  try {
    const rows = await tx.execute<{ id: string | null }>(sql`select app.accept_invitation(${hashToken(t)}) as id`);
    return rows[0]?.id ?? null;
  } catch (e) {
    const msg = String((e as { cause?: Error }).cause?.message ?? (e as Error).message);
    if (/different email/.test(msg)) throw new AppError("FORBIDDEN", "This invitation was sent to a different email address.");
    if (/not found or expired/.test(msg)) throw notFound("Invitation");
    if (/no longer grant/.test(msg)) throw new AppError("FORBIDDEN", "This invitation is no longer valid. Ask for a new one.");
    throw e;
  }
}

export async function revokeInvitation(tx: Executor, actor: Actor, invitationId: string) {
  if (actor.kind !== "user") throw unauthenticated();
  const id = parseInput(z.uuid(), invitationId);
  const [inv] = await tx.update(staffInvitations).set({ revokedAt: new Date() })
    .where(and(eq(staffInvitations.id, id), isNull(staffInvitations.acceptedAt), isNull(staffInvitations.revokedAt)))
    .returning();
  if (!inv) throw notFound("Invitation");
  const scope = inv.branchId ? await loadScope(tx, { level: "branch", id: inv.branchId })
    : inv.franchiseeId ? await loadScope(tx, { level: "franchisee", id: inv.franchiseeId })
    : inv.brandId ? await loadScope(tx, { level: "brand", id: inv.brandId }) : ({ level: "platform" } as const);
  await recordAudit(tx, actor, { action: "invitation.revoke", scope, targetType: "staff_invitation", targetId: id, metadata: { email: inv.email } });
}

/** Staff visible to the caller (RLS filters to scopes they may read). */
export async function listStaff(tx: Executor, filter: { brandId?: string; branchId?: string; franchiseeId?: string } = {}) {
  const { users } = schema;
  const conds = [
    isNull(memberships.revokedAt),
    filter.brandId ? eq(memberships.brandId, filter.brandId) : undefined,
    filter.branchId ? eq(memberships.branchId, filter.branchId) : undefined,
    filter.franchiseeId ? eq(memberships.franchiseeId, filter.franchiseeId) : undefined,
  ].filter(Boolean);
  return tx.select({
    membershipId: memberships.id, userId: users.id, email: users.email, displayName: users.displayName,
    role: roles.key, roleName: roles.name, rank: roles.rank, scope: memberships.scopeType,
    brandId: memberships.brandId, franchiseeId: memberships.franchiseeId, branchId: memberships.branchId, since: memberships.createdAt,
  }).from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(...conds));
}

export async function listInvitations(tx: Executor, filter: { brandId?: string; branchId?: string } = {}) {
  const conds = [
    isNull(staffInvitations.acceptedAt), isNull(staffInvitations.revokedAt),
    filter.brandId ? eq(staffInvitations.brandId, filter.brandId) : undefined,
    filter.branchId ? eq(staffInvitations.branchId, filter.branchId) : undefined,
  ].filter(Boolean);
  return tx.select({
    id: staffInvitations.id, email: staffInvitations.email, role: roles.key, roleName: roles.name,
    scope: staffInvitations.scopeType, branchId: staffInvitations.branchId, expiresAt: staffInvitations.expiresAt,
  }).from(staffInvitations).innerJoin(roles, eq(roles.id, staffInvitations.roleId)).where(and(...conds));
}

/** Roles the actor could grant at a scope (for invite forms). */
export async function grantableRoles(tx: Executor, actor: Actor, scope: ResourceScope) {
  const level = scope.level;
  const all = await tx.select().from(roles).where(eq(roles.scopeType, level));
  return all.filter((r) => canGrantRole(actor, r.rank, scope)).sort((a, b) => b.rank - a.rank);
}
