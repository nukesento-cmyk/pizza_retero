import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, forbidden, notFound, parseInput, unauthenticated } from "@retero/shared/errors";
import type { Executor } from "@retero/db";
import { schema } from "@retero/db";
import { canGrantRole } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { loadScope } from "../tenancy/scope";
import { recordAudit } from "../audit";

const { memberships, roles } = schema;

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
