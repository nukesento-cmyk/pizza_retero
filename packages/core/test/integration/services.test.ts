import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, withActor } from "@retero/db";
import { uuidv7 } from "@retero/shared/ids";
import { AppError } from "@retero/shared/errors";
import { loadActor, syncUser } from "../../src/identity";
import { grantRole, revokeMembership } from "../../src/staff";
import { resolveTenant } from "../../src/tenancy";
import { can } from "../../src/rbac";
import { grant, makeBrandTree, makeUser, openDbs } from "../../../../test/fixtures";

const dbs = openDbs();
const { owner, app } = dbs;
afterAll(() => dbs.close());

let T: Awaited<ReturnType<typeof makeBrandTree>>;
let manager: string;

beforeAll(async () => {
  T = await makeBrandTree(owner);
  manager = await makeUser(owner, "manager");
  await grant(owner, manager, "branch_manager", { brandId: T.brand.id, branchId: T.b1.id });
});

const code = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return e instanceof AppError ? e.code : String(e); }
};

describe("identity", () => {
  it("syncUser creates then updates the caller's own profile", async () => {
    const id = uuidv7();
    await withActor(app, id, (tx) => syncUser(tx, { id, email: "chef@test.local", displayName: "Chef" }));
    await withActor(app, id, (tx) => syncUser(tx, { id, email: "chef2@test.local", displayName: "Ignored" }));
    const [row] = await owner.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row).toMatchObject({ email: "chef2@test.local", displayName: "Chef" });
  });

  it("loadActor returns grants with permissions", async () => {
    const actor = await withActor(app, manager, (tx) => loadActor(tx, manager));
    expect(actor.kind).toBe("user");
    expect(can(actor, "kitchen.ticket.update", { level: "branch", brandId: T.brand.id, franchiseeId: T.f1.id, branchId: T.b1.id })).toBe(true);
    expect(can(actor, "kitchen.ticket.update", { level: "branch", brandId: T.brand.id, franchiseeId: T.f2.id, branchId: T.b3.id })).toBe(false);
  });
});

describe("staff.grantRole / revokeMembership", () => {
  it("grants, audits, rejects duplicates and revokes", async () => {
    const cook = await makeUser(owner, "cook");
    const m = await withActor(app, manager, async (tx) => {
      const actor = await loadActor(tx, manager);
      return grantRole(tx, actor, { userId: cook, roleKey: "kitchen_staff", target: { level: "branch", id: T.b1.id } });
    });
    const audit = await owner.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, m.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "membership.grant", actorUserId: manager, branchId: T.b1.id, franchiseeId: T.f1.id });

    expect(await code(withActor(app, manager, async (tx) =>
      grantRole(tx, await loadActor(tx, manager), { userId: cook, roleKey: "kitchen_staff", target: { level: "branch", id: T.b1.id } }),
    ))).toBe("CONFLICT");

    await withActor(app, manager, async (tx) => revokeMembership(tx, await loadActor(tx, manager), m.id));
    const [after] = await owner.select().from(schema.memberships).where(eq(schema.memberships.id, m.id));
    expect(after?.revokedBy).toBe(manager);
  });

  it("refuses escalation, wrong scope level, and other tenants", async () => {
    const target = await makeUser(owner, "target");
    const run = (roleKey: string, t: { level: "branch" | "brand"; id: string }) =>
      code(withActor(app, manager, async (tx) => grantRole(tx, await loadActor(tx, manager), { userId: target, roleKey, target: t })));

    expect(await run("branch_manager", { level: "branch", id: T.b1.id })).toBe("FORBIDDEN"); // peer
    expect(await run("brand_admin", { level: "branch", id: T.b1.id })).toBe("VALIDATION_FAILED"); // wrong level
    expect(await run("brand_admin", { level: "brand", id: T.brand.id })).toBe("FORBIDDEN");
    expect(await run("kitchen_staff", { level: "branch", id: T.b3.id })).toBe("NOT_FOUND"); // invisible branch: not even confirmed to exist
  });

  it("anonymous cannot grant", async () => {
    expect(await code(withActor(app, null, (tx) =>
      grantRole(tx, { kind: "anonymous" }, { userId: manager, roleKey: "kitchen_staff", target: { level: "branch", id: T.b1.id } }),
    ))).toBe("UNAUTHENTICATED");
  });

  it("rejects malformed input", async () => {
    expect(await code(withActor(app, manager, async (tx) =>
      grantRole(tx, await loadActor(tx, manager), { userId: "not-a-uuid", roleKey: "kitchen_staff", target: { level: "branch", id: T.b1.id } }),
    ))).toBe("VALIDATION_FAILED");
  });
});

describe("tenancy.resolveTenant", () => {
  let tag: string;
  beforeAll(async () => {
    tag = Math.random().toString(36).slice(2, 7);
    const now = new Date();
    await owner.insert(schema.domains).values([
      { hostname: `${tag}.test`, brandId: T.brand.id, isPrimary: true, verifiedAt: now },
      { hostname: `alias-${tag}.test`, brandId: T.brand.id, verifiedAt: now },
      { hostname: `nbo.${tag}.test`, brandId: T.brand.id, franchiseeId: T.f1.id, isPrimary: true, verifiedAt: now },
      { hostname: `a.${tag}.test`, brandId: T.brand.id, branchId: T.b1.id, isPrimary: true, verifiedAt: now },
      { hostname: `c.${tag}.test`, brandId: T.brand.id, branchId: T.b3.id, isPrimary: true, verifiedAt: now }, // pending branch
      { hostname: `unverified-${tag}.test`, brandId: T.brand.id },
    ]);
  });
  const resolve = (host: string | null, opts = {}) => withActor(app, null, (tx) => resolveTenant(tx, host, opts));

  it("resolves brand, franchisee and branch hosts with canonical hostnames", async () => {
    const brand = await resolve(`WWW.${tag.toUpperCase()}.test.`);
    expect(brand).toMatchObject({ brand: { id: T.brand.id }, branch: null, franchiseeId: null, canonicalHost: `${tag}.test` });

    const alias = await resolve(`alias-${tag}.test`);
    expect(alias?.canonicalHost).toBe(`${tag}.test`);

    const region = await resolve(`nbo.${tag}.test`);
    expect(region).toMatchObject({ franchiseeId: T.f1.id, branch: null, canonicalHost: `nbo.${tag}.test` });

    const branch = await resolve(`a.${tag}.test:443`);
    expect(branch).toMatchObject({ branch: { id: T.b1.id }, canonicalHost: `a.${tag}.test` });
  });

  it("does not serve unverified domains, inactive branches or junk hosts", async () => {
    expect(await resolve(`unverified-${tag}.test`)).toBeNull();
    expect(await resolve(`c.${tag}.test`)).toBeNull();
    expect(await resolve("evil.test/../../etc")).toBeNull();
    expect(await resolve(null)).toBeNull();
  });

  it("dev fallback only applies to localhost", async () => {
    expect((await resolve("localhost:3000", { devFallbackBrandSlug: T.brand.slug }))?.matchedBy).toBe("dev-fallback");
    expect(await resolve("random.example", { devFallbackBrandSlug: T.brand.slug })).toBeNull();
  });
});
