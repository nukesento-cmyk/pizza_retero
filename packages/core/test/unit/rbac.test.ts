import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS, authorize, can, canGrantRole, getRole, SYSTEM_ROLES,
  type Actor, type Grant, type ResourceScope,
} from "../../src/rbac";

const B1 = "brand-1", B2 = "brand-2", F1 = "fr-1", F2 = "fr-2", BR1 = "br-1", BR2 = "br-2", BR3 = "br-3";

function grant(roleKey: string, ids: Partial<Pick<Grant, "brandId" | "franchiseeId" | "branchId">>): Grant {
  const role = getRole(roleKey)!;
  return {
    membershipId: `m-${roleKey}`, roleKey, rank: role.rank, scope: role.scope,
    brandId: ids.brandId ?? null, franchiseeId: ids.franchiseeId ?? null, branchId: ids.branchId ?? null,
    permissions: new Set(role.permissions),
  };
}
const user = (...grants: Grant[]): Actor => ({ kind: "user", userId: "u", grants });

const branch = (brandId: string, franchiseeId: string, branchId: string): ResourceScope =>
  ({ level: "branch", brandId, franchiseeId, branchId });

describe("role catalogue", () => {
  it("only references known permissions and has unique keys", () => {
    const keys = new Set<string>();
    for (const r of SYSTEM_ROLES) {
      expect(keys.has(r.key)).toBe(false);
      keys.add(r.key);
      for (const p of r.permissions) expect(ALL_PERMISSIONS).toContain(p);
    }
  });

  it("never gives a lower-scope role brand-wide powers", () => {
    for (const r of SYSTEM_ROLES.filter((x) => x.scope === "branch" || x.scope === "franchisee")) {
      for (const p of ["brand.update", "brand.create", "catalogue.manage", "franchisee.create", "branch.create", "platform.manage"] as const) {
        expect((r.permissions as readonly string[]).includes(p)).toBe(false);
      }
    }
  });
});

describe("authorize", () => {
  it("anonymous is unauthenticated, not forbidden", () => {
    expect(() => authorize({ kind: "anonymous" }, "order.read", branch(B1, F1, BR1))).toThrow(/sign in/i);
  });

  it("platform owner covers everything", () => {
    const a = user(grant("platform_owner", {}));
    expect(can(a, "brand.create", { level: "platform" })).toBe(true);
    expect(can(a, "order.refund", branch(B2, F2, BR3))).toBe(true);
  });

  it("brand admin covers its own brand tree only", () => {
    const a = user(grant("brand_admin", { brandId: B1 }));
    expect(can(a, "branch.update", branch(B1, F1, BR1))).toBe(true);
    expect(can(a, "branch.update", branch(B2, F2, BR3))).toBe(false);
    expect(can(a, "brand.create", { level: "platform" })).toBe(false);
  });

  it("franchise admin covers its own branches but not sibling franchisees", () => {
    const a = user(grant("franchise_admin", { brandId: B1, franchiseeId: F1 }));
    expect(can(a, "order.refund", branch(B1, F1, BR1))).toBe(true);
    expect(can(a, "order.refund", branch(B1, F2, BR2))).toBe(false);
    expect(can(a, "branch.create", { level: "brand", brandId: B1 })).toBe(false);
  });

  it("branch staff are confined to their branch and their permissions", () => {
    const a = user(grant("kitchen_staff", { brandId: B1, branchId: BR1 }));
    expect(can(a, "kitchen.ticket.update", branch(B1, F1, BR1))).toBe(true);
    expect(can(a, "kitchen.ticket.update", branch(B1, F1, BR2))).toBe(false);
    expect(can(a, "order.refund", branch(B1, F1, BR1))).toBe(false);
    expect(() => authorize(a, "inventory.manage", branch(B1, F1, BR1))).toThrow(/permission/);
  });

  it("does not let a forged brand id widen a branch grant", () => {
    // Same branch id, different brand → not covered (ids are not trusted alone).
    const a = user(grant("branch_manager", { brandId: B1, branchId: BR1 }));
    expect(can(a, "branch.update", branch(B2, F1, BR1))).toBe(false);
  });
});

describe("canGrantRole (privilege escalation)", () => {
  const kitchen = getRole("kitchen_staff")!.rank;
  const manager = getRole("branch_manager")!.rank;
  const brandAdmin = getRole("brand_admin")!.rank;

  it("branch manager can add kitchen staff to own branch only", () => {
    const a = user(grant("branch_manager", { brandId: B1, branchId: BR1 }));
    expect(canGrantRole(a, kitchen, branch(B1, F1, BR1))).toBe(true);
    expect(canGrantRole(a, kitchen, branch(B1, F1, BR2))).toBe(false);
  });

  it("cannot grant a peer or higher role", () => {
    const a = user(grant("branch_manager", { brandId: B1, branchId: BR1 }));
    expect(canGrantRole(a, manager, branch(B1, F1, BR1))).toBe(false);
    expect(canGrantRole(a, brandAdmin, branch(B1, F1, BR1))).toBe(false);
  });

  it("roles without staff.invite cannot grant anything", () => {
    const a = user(grant("inventory_manager", { brandId: B1, branchId: BR1 }));
    expect(canGrantRole(a, kitchen, branch(B1, F1, BR1))).toBe(false);
  });
});
