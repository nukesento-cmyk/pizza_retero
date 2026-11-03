/**
 * Cross-tenant isolation at the DATABASE layer, using the runtime role.
 * These tests deliberately bypass @retero/core: they prove that even a bug in
 * application authorization cannot leak or corrupt another tenant's data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { schema, withActor } from "../src";
import { expectDbError, grant, makeBrandTree, makeUser, openDbs, roleId } from "../../../test/fixtures";

const dbs = openDbs();
const { owner, app } = dbs;
afterAll(() => dbs.close());

let A: Awaited<ReturnType<typeof makeBrandTree>>;
let B: Awaited<ReturnType<typeof makeBrandTree>>;
const u = {} as Record<"brandAdminA" | "franchiseAdminA1" | "managerA1" | "kitchenA1" | "kitchenA3" | "outsider", string>;

beforeAll(async () => {
  A = await makeBrandTree(owner);
  B = await makeBrandTree(owner, "pending");
  for (const k of Object.keys({ brandAdminA: 1, franchiseAdminA1: 1, managerA1: 1, kitchenA1: 1, kitchenA3: 1, outsider: 1 }) as (keyof typeof u)[]) {
    u[k] = await makeUser(owner, k);
  }
  await grant(owner, u.brandAdminA, "brand_admin", { brandId: A.brand.id });
  await grant(owner, u.franchiseAdminA1, "franchise_admin", { brandId: A.brand.id, franchiseeId: A.f1.id });
  await grant(owner, u.managerA1, "branch_manager", { brandId: A.brand.id, branchId: A.b1.id });
  await grant(owner, u.kitchenA1, "kitchen_staff", { brandId: A.brand.id, branchId: A.b1.id });
  await grant(owner, u.kitchenA3, "kitchen_staff", { brandId: A.brand.id, branchId: A.b3.id });
  await owner.insert(schema.auditLogs).values([
    { action: "test.a", brandId: A.brand.id, targetType: "x" },
    { action: "test.b", brandId: B.brand.id, targetType: "x" },
  ]);
});

const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);

describe("schema hygiene", () => {
  it("every table in public has RLS enabled", async () => {
    const rows = await owner.execute<{ relname: string }>(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("runtime role cannot bypass RLS and does not own tables", async () => {
    const [r] = await app.execute<{ bypass: boolean; owns: number }>(sql`
      select rolbypassrls as bypass,
        (select count(*)::int from pg_tables where schemaname='public' and tableowner = current_user) as owns
      from pg_roles where rolname = current_user`);
    expect(r).toEqual({ bypass: false, owns: 0 });
  });
});

describe("anonymous visitors", () => {
  it("see only active brands/branches and nothing private", async () => {
    await withActor(app, null, async (tx) => {
      const brands = ids(await tx.select().from(schema.brands));
      expect(brands).toContain(A.brand.id);
      expect(brands).not.toContain(B.brand.id); // pending brand hidden
      const branches = ids(await tx.select().from(schema.branches));
      expect(branches).toContain(A.b1.id);
      expect(branches).not.toContain(A.b2.id); // pending branch hidden
      expect(await tx.select().from(schema.franchisees)).toEqual([]);
      expect(await tx.select().from(schema.memberships)).toEqual([]);
      expect(await tx.select().from(schema.users)).toEqual([]);
      expect(await tx.select().from(schema.auditLogs)).toEqual([]);
    });
  });

  it("cannot create a brand", async () => {
    await expectDbError(withActor(app, null, (tx) => tx.insert(schema.brands).values({ slug: "evil", name: "Evil" })), /row-level security/);
  });
});

describe("brand isolation", () => {
  it("brand admin sees own brand's private rows, never another brand's", async () => {
    await withActor(app, u.brandAdminA, async (tx) => {
      const fr = ids(await tx.select().from(schema.franchisees));
      expect(fr.sort()).toEqual([A.f1.id, A.f2.id].sort());
      const br = ids(await tx.select().from(schema.branches).where(eq(schema.branches.brandId, A.brand.id)));
      expect(br).toHaveLength(3);
      expect(ids(await tx.select().from(schema.brands))).not.toContain(B.brand.id);
      const audit = (await tx.select().from(schema.auditLogs)).map((r) => r.action);
      expect(audit).toContain("test.a");
      expect(audit).not.toContain("test.b");
    });
  });

  it("brand admin cannot update another brand (silently 0 rows)", async () => {
    const updated = await withActor(app, u.brandAdminA, (tx) =>
      tx.update(schema.brands).set({ name: "Hijacked" }).where(eq(schema.brands.id, B.brand.id)).returning(),
    );
    expect(updated).toEqual([]);
  });

  it("brand admin cannot plant a branch in another brand", async () => {
    await expectDbError(withActor(app, u.brandAdminA, (tx) =>
        tx.insert(schema.branches).values({ brandId: B.brand.id, franchiseeId: B.f1.id, slug: "plant", name: "x", city: "x" })), /row-level security/);
  });

  it("composite FK stops a branch claiming a franchisee from a different brand", async () => {
    await expectDbError(owner.insert(schema.branches).values({ brandId: A.brand.id, franchiseeId: B.f1.id, slug: "mix", name: "x", city: "x" }), /branches_franchisee_brand_fk/);
  });
});

describe("franchisee isolation", () => {
  it("franchise admin sees own franchisee and its branches only", async () => {
    await withActor(app, u.franchiseAdminA1, async (tx) => {
      expect(ids(await tx.select().from(schema.franchisees))).toEqual([A.f1.id]);
      const br = ids(await tx.select().from(schema.branches).where(eq(schema.branches.brandId, A.brand.id)));
      expect(br.sort()).toEqual([A.b1.id, A.b2.id].sort()); // not b3 (pending, other franchisee)
    });
  });

  it("franchise admin sees own branch staff but not sibling franchisee's staff", async () => {
    await withActor(app, u.franchiseAdminA1, async (tx) => {
      const m = await tx.select().from(schema.memberships);
      const users = m.map((x) => x.userId);
      expect(users).toContain(u.kitchenA1);
      expect(users).not.toContain(u.kitchenA3);
      expect(users).not.toContain(u.brandAdminA);
    });
  });

  it("franchise admin cannot open branches (brand-level permission)", async () => {
    await expectDbError(withActor(app, u.franchiseAdminA1, (tx) =>
        tx.insert(schema.branches).values({ brandId: A.brand.id, franchiseeId: A.f1.id, slug: "new", name: "x", city: "x" })), /row-level security/);
  });
});

describe("branch staff", () => {
  it("kitchen staff see only their own membership and no other users", async () => {
    await withActor(app, u.kitchenA1, async (tx) => {
      const m = await tx.select().from(schema.memberships);
      expect(m.map((x) => x.userId)).toEqual([u.kitchenA1]);
      expect(ids(await tx.select().from(schema.users))).toEqual([u.kitchenA1]);
    });
  });

  it("kitchen staff cannot edit their branch", async () => {
    const res = await withActor(app, u.kitchenA1, (tx) =>
      tx.update(schema.branches).set({ name: "Mine now" }).where(eq(schema.branches.id, A.b1.id)).returning());
    expect(res).toEqual([]);
  });
});

describe("privilege escalation via direct SQL", () => {
  it("manager can grant kitchen staff at own branch", async () => {
    const newbie = await makeUser(owner, "newbie");
    const kitchen = await roleId(owner, "kitchen_staff");
    const rows = await withActor(app, u.managerA1, (tx) =>
      tx.insert(schema.memberships).values({
        userId: newbie, roleId: kitchen, scopeType: "branch", brandId: A.brand.id, branchId: A.b1.id, grantedBy: u.managerA1,
      }).returning());
    expect(rows).toHaveLength(1);
  });

  it("manager cannot grant at another branch", async () => {
    const kitchen = await roleId(owner, "kitchen_staff");
    await expectDbError(withActor(app, u.managerA1, (tx) =>
        tx.insert(schema.memberships).values({
          userId: u.outsider, roleId: kitchen, scopeType: "branch", brandId: A.brand.id, branchId: A.b3.id, grantedBy: u.managerA1,
        })), /row-level security/);
  });

  it("manager cannot grant a peer role, or themselves brand admin", async () => {
    const manager = await roleId(owner, "branch_manager");
    const brandAdmin = await roleId(owner, "brand_admin");
    await expectDbError(withActor(app, u.managerA1, (tx) =>
        tx.insert(schema.memberships).values({
          userId: u.outsider, roleId: manager, scopeType: "branch", brandId: A.brand.id, branchId: A.b1.id, grantedBy: u.managerA1,
        })), /row-level security/);
    await expectDbError(withActor(app, u.managerA1, (tx) =>
        tx.insert(schema.memberships).values({
          userId: u.managerA1, roleId: brandAdmin, scopeType: "brand", brandId: A.brand.id, grantedBy: u.managerA1,
        })), /row-level security/);
  });

  it("cannot forge granted_by", async () => {
    const kitchen = await roleId(owner, "kitchen_staff");
    const someone = await makeUser(owner, "someone");
    await expectDbError(withActor(app, u.managerA1, (tx) =>
        tx.insert(schema.memberships).values({
          userId: someone, roleId: kitchen, scopeType: "branch", brandId: A.brand.id, branchId: A.b1.id, grantedBy: u.brandAdminA,
        })), /row-level security/);
  });

  it("cannot move an existing membership to another scope", async () => {
    await expectDbError(withActor(app, u.brandAdminA, (tx) =>
        tx.update(schema.memberships).set({ branchId: A.b3.id })
          .where(and(eq(schema.memberships.userId, u.kitchenA1), eq(schema.memberships.branchId, A.b1.id)))), /immutable/);
  });

  it("cannot change a branch's franchisee", async () => {
    await expectDbError(withActor(app, u.brandAdminA, (tx) =>
        tx.update(schema.branches).set({ franchiseeId: A.f2.id }).where(eq(schema.branches.id, A.b1.id))), /cannot be changed|branches_franchisee_brand_fk/);
  });
});

describe("audit log integrity", () => {
  it("runtime role cannot update or delete audit rows", async () => {
    await expectDbError(withActor(app, u.brandAdminA, (tx) => tx.update(schema.auditLogs).set({ action: "x" })), /permission denied/);
    await expectDbError(withActor(app, u.brandAdminA, (tx) => tx.delete(schema.auditLogs)), /permission denied/);
  });

  it("cannot write audit rows as somebody else", async () => {
    await expectDbError(
      withActor(app, u.kitchenA1, (tx) =>
        tx.insert(schema.auditLogs).values({ actorUserId: u.brandAdminA, action: "forged", targetType: "x" })),
      /row-level security/,
    );
  });
});

describe("actor context", () => {
  it("does not leak between transactions on a pooled connection", async () => {
    await withActor(app, u.brandAdminA, async () => {});
    const [r] = await app.execute<{ uid: string | null }>(sql`select app.current_user_id() as uid`);
    expect(r?.uid).toBeNull();
  });

  it("users can only create their own profile", async () => {
    const forgedId = "0190f0e0-0000-7000-8000-000000000001";
    await expectDbError(withActor(app, u.outsider, (tx) => tx.insert(schema.users).values({ id: forgedId, email: "x@y.z" })), /row-level security/);
  });
});
