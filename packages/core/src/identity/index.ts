import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { parseInput } from "@retero/shared/errors";
import type { Executor } from "@retero/db";
import { schema } from "@retero/db";
import type { Actor, Grant, ScopeType } from "../rbac/types";

const { users, memberships, roles, rolePermissions } = schema;

export const verifiedIdentitySchema = z.object({
  id: z.uuid(),
  email: z.email().nullish(),
  phone: z.string().regex(/^\+[1-9][0-9]{6,14}$/).nullish(),
  displayName: z.string().trim().max(120).nullish(),
});
export type VerifiedIdentity = z.infer<typeof verifiedIdentitySchema>;

/**
 * Upsert the local profile for an identity the managed auth provider has
 * already verified. Must run inside withActor(identity.id).
 */
export async function syncUser(tx: Executor, identity: VerifiedIdentity): Promise<void> {
  const v = parseInput(verifiedIdentitySchema, identity);
  await tx
    .insert(users)
    .values({ id: v.id, email: v.email ?? null, phone: v.phone ?? null, displayName: v.displayName ?? null })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: sql`excluded.email`,
        phone: sql`coalesce(excluded.phone, ${users.phone})`,
        displayName: sql`coalesce(${users.displayName}, excluded.display_name)`,
      },
    });
}

/** Load the caller's active grants. Must run inside withActor(userId). */
export async function loadActor(tx: Executor, userId: string): Promise<Actor> {
  const rows = await tx
    .select({
      membershipId: memberships.id,
      roleKey: roles.key,
      rank: roles.rank,
      scope: memberships.scopeType,
      brandId: memberships.brandId,
      franchiseeId: memberships.franchiseeId,
      branchId: memberships.branchId,
      permissions: sql<string[]>`coalesce(array_agg(${rolePermissions.permissionKey}) filter (where ${rolePermissions.permissionKey} is not null), '{}')`,
    })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.revokedAt)))
    .groupBy(memberships.id, roles.id);

  const grants: Grant[] = rows.map((r) => ({
    membershipId: r.membershipId,
    roleKey: r.roleKey,
    rank: r.rank,
    scope: r.scope as ScopeType,
    brandId: r.brandId,
    franchiseeId: r.franchiseeId,
    branchId: r.branchId,
    permissions: new Set(r.permissions),
  }));
  return { kind: "user", userId, grants };
}

export const isStaff = (actor: Actor): boolean => actor.kind === "user" && actor.grants.length > 0;
