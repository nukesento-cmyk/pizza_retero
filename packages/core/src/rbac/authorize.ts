import { forbidden, unauthenticated } from "@retero/shared/errors";
import type { Permission } from "./catalogue";
import type { Actor, Grant, ResourceScope } from "./types";

/** Does this grant's scope include the target? Higher scopes cover descendants. */
export function covers(grant: Grant, target: ResourceScope): boolean {
  switch (grant.scope) {
    case "platform":
      return true;
    case "brand":
      return target.level !== "platform" && grant.brandId === target.brandId;
    case "franchisee":
      return (
        (target.level === "franchisee" || target.level === "branch") &&
        grant.brandId === target.brandId &&
        grant.franchiseeId === target.franchiseeId
      );
    case "branch":
      return target.level === "branch" && grant.brandId === target.brandId && grant.branchId === target.branchId;
  }
}

export function can(actor: Actor, permission: Permission, target: ResourceScope): boolean {
  if (actor.kind === "system") return true;
  if (actor.kind === "anonymous") return false;
  return actor.grants.some((g) => g.permissions.has(permission) && covers(g, target));
}

/** Throw unless `actor` may perform `permission` on `target`. */
export function authorize(actor: Actor, permission: Permission, target: ResourceScope): void {
  if (actor.kind === "anonymous") throw unauthenticated();
  if (!can(actor, permission, target)) throw forbidden();
}

/** Highest rank the actor holds at a scope covering the target (0 if none). */
export function maxRankAt(actor: Actor, target: ResourceScope): number {
  if (actor.kind !== "user") return actor.kind === "system" ? Number.POSITIVE_INFINITY : 0;
  return actor.grants.filter((g) => covers(g, target)).reduce((m, g) => Math.max(m, g.rank), 0);
}

/**
 * May the actor grant a role of `roleRank` at `target`? Needs staff.invite
 * there and a strictly higher rank — no self-escalation, no peer creation.
 * Mirrors SQL `app.can_grant`.
 */
export function canGrantRole(actor: Actor, roleRank: number, target: ResourceScope): boolean {
  return can(actor, "staff.invite", target) && roleRank < maxRankAt(actor, target);
}

/** Scopes where the actor holds `permission` — used to build dashboard navigation. */
export function scopesWith(actor: Actor, permission: Permission): Grant[] {
  return actor.kind === "user" ? actor.grants.filter((g) => g.permissions.has(permission)) : [];
}
