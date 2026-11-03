import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, withActor, type Tx } from "@retero/db";
import { AppError } from "@retero/shared/errors";
import { loadActor } from "../../src/identity";
import * as franchise from "../../src/franchise";
import * as brands from "../../src/brands";
import * as domains from "../../src/domains";
import { acceptInvitation, inviteStaff, listStaff } from "../../src/staff";
import { grant, makeBrandTree, makeUser, openDbs } from "../../../../test/fixtures";

const dbs = openDbs();
const { owner, app } = dbs;
afterAll(() => dbs.close());

let A: Awaited<ReturnType<typeof makeBrandTree>>;
let B: Awaited<ReturnType<typeof makeBrandTree>>;
let brandAdmin: string, franchiseAdmin: string, manager: string, platform: string;

beforeAll(async () => {
  A = await makeBrandTree(owner);
  B = await makeBrandTree(owner);
  brandAdmin = await makeUser(owner, "ba");
  franchiseAdmin = await makeUser(owner, "fa");
  manager = await makeUser(owner, "mgr");
  platform = await makeUser(owner, "plat");
  await grant(owner, brandAdmin, "brand_admin", { brandId: A.brand.id });
  await grant(owner, franchiseAdmin, "franchise_admin", { brandId: A.brand.id, franchiseeId: A.f1.id });
  await grant(owner, manager, "branch_manager", { brandId: A.brand.id, branchId: A.b1.id });
  await grant(owner, platform, "platform_owner", {});
});

const as = <T>(userId: string, fn: (tx: Tx, actor: Awaited<ReturnType<typeof loadActor>>) => Promise<T>) =>
  withActor(app, userId, async (tx) => fn(tx, await loadActor(tx, userId)));
const code = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return e instanceof AppError ? e.code : `RAW:${(e as Error).message.slice(0, 120)}`; }
};

describe("brand onboarding", () => {
  it("platform owner creates a brand; brand admins cannot", async () => {
    const slug = `new-${Math.random().toString(36).slice(2, 7)}`;
    const b = await as(platform, (tx, a) => brands.createBrand(tx, a, { slug, name: "New Co" }));
    expect(b.status).toBe("pending");
    expect(await code(as(brandAdmin, (tx, a) => brands.createBrand(tx, a, { slug: `${slug}-x`, name: "Nope" })))).toBe("FORBIDDEN");
  });

  it("brand admin edits settings with validation; other brands are off limits", async () => {
    await as(brandAdmin, (tx, a) => brands.updateBrandSettings(tx, a, { brandId: A.brand.id, whatsappNumber: "+254712345678", theme: { colors: { sauce: "#aa2211" } } }));
    expect(await code(as(brandAdmin, (tx, a) => brands.updateBrandSettings(tx, a, { brandId: A.brand.id, theme: { colors: { sauce: "red" } } })))).toBe("VALIDATION_FAILED");
    expect(await code(as(brandAdmin, (tx, a) => brands.updateBrandSettings(tx, a, { brandId: B.brand.id, whatsappNumber: "+254700000000" })))).toBe("FORBIDDEN");
  });

  it("only the platform can change a brand's status", async () => {
    expect(await code(as(brandAdmin, (tx, a) => brands.updateBrand(tx, a, { brandId: A.brand.id, status: "suspended" })))).toBe("FORBIDDEN");
  });
});

describe("franchisees and branches", () => {
  it("brand admin onboards a franchisee and opens a branch; audit rows written", async () => {
    const f = await as(brandAdmin, (tx, a) => franchise.createFranchisee(tx, a, { brandId: A.brand.id, legalName: "Kilimani Foods Ltd", tradingName: "Kilimani", kraPin: "P051234567X" }));
    const br = await as(brandAdmin, (tx, a) => franchise.createBranch(tx, a, {
      franchiseeId: f.id, slug: `kilimani-${f.id.slice(-4)}`, name: "Kilimani", city: "Nairobi", latitude: -1.2921, longitude: 36.7822,
    }));
    expect(br).toMatchObject({ brandId: A.brand.id, franchiseeId: f.id, status: "pending", latitude: "-1.292100" });
    const audit = await owner.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, br.id));
    expect(audit.map((r) => r.action)).toEqual(["branch.create"]);
  });

  it("validates input (KRA PIN format)", async () => {
    expect(await code(as(brandAdmin, (tx, a) => franchise.createFranchisee(tx, a, { brandId: A.brand.id, legalName: "X Ltd", tradingName: "X", kraPin: "123" })))).toBe("VALIDATION_FAILED");
  });

  it("cross-tenant: brand A admin cannot onboard into brand B (not even confirm it exists)", async () => {
    // B is active so its brand row is publicly visible → FORBIDDEN rather than NOT_FOUND.
    expect(await code(as(brandAdmin, (tx, a) => franchise.createFranchisee(tx, a, { brandId: B.brand.id, legalName: "Evil Ltd", tradingName: "Evil" })))).toBe("FORBIDDEN");
    expect(await code(as(brandAdmin, (tx, a) => franchise.updateFranchisee(tx, a, { franchiseeId: B.f1.id, tradingName: "Hijacked" })))).toBe("NOT_FOUND");
  });

  it("franchise admin edits own branch but cannot open branches or change trading status", async () => {
    await as(franchiseAdmin, (tx, a) => franchise.updateBranch(tx, a, { branchId: A.b1.id, phone: "+254711000111" }));
    expect(await code(as(franchiseAdmin, (tx, a) => franchise.createBranch(tx, a, { franchiseeId: A.f1.id, slug: "rogue", name: "Rogue", city: "Nairobi" })))).toBe("FORBIDDEN");
    expect(await code(as(franchiseAdmin, (tx, a) => franchise.updateBranch(tx, a, { branchId: A.b1.id, status: "closed" })))).toBe("FORBIDDEN");
    expect(await code(as(franchiseAdmin, (tx, a) => franchise.updateBranch(tx, a, { branchId: A.b3.id, name: "Sibling" })))).toBe("NOT_FOUND");
  });

  it("branch manager sets weekly hours; overlapping schedules are rejected", async () => {
    await as(manager, (tx, a) => franchise.setBranchHours(tx, a, { branchId: A.b1.id, week: [
      { dayOfWeek: 1, opensAt: "10:00", closesAt: "22:00" }, { dayOfWeek: 5, opensAt: "11:00", closesAt: "01:00" },
    ] }));
    const hours = await withActor(app, null, (tx) => franchise.getBranchHours(tx, A.b1.id));
    expect(hours).toHaveLength(2);
    expect(await code(as(manager, (tx, a) => franchise.setBranchHours(tx, a, { branchId: A.b1.id, week: [
      { dayOfWeek: 1, opensAt: "10:00", closesAt: "15:00" }, { dayOfWeek: 1, opensAt: "14:00", closesAt: "16:00" },
    ] })))).toBe("VALIDATION_FAILED");
  });
});

describe("domains", () => {
  it("add → verify via DNS TXT → primary", async () => {
    const host = `wl-${Math.random().toString(36).slice(2, 7)}.example.test`;
    const { domain, txtRecord } = await as(brandAdmin, (tx, a) => domains.addDomain(tx, a, { brandId: A.brand.id, branchId: A.b1.id, hostname: host.toUpperCase() }));
    expect(domain.hostname).toBe(host);
    expect(txtRecord.name).toBe(`_retero-verify.${host}`);

    const missing = async () => [] as string[][];
    expect(await code(as(brandAdmin, (tx, a) => domains.verifyDomain(tx, a, domain.id, missing)))).toBe("VALIDATION_FAILED");
    const ok = async (name: string) => (name === txtRecord.name ? [[txtRecord.value]] : []);
    const v = await as(brandAdmin, (tx, a) => domains.verifyDomain(tx, a, domain.id, ok));
    expect(v.verifiedAt).not.toBeNull();
    await as(brandAdmin, (tx, a) => domains.setPrimaryDomain(tx, a, domain.id));
  });

  it("branch managers can't manage domains; duplicates conflict", async () => {
    expect(await code(as(manager, (tx, a) => domains.addDomain(tx, a, { brandId: A.brand.id, branchId: A.b1.id, hostname: "x.example.test" })))).toBe("FORBIDDEN");
    const host = `dup-${Math.random().toString(36).slice(2, 7)}.example.test`;
    await as(brandAdmin, (tx, a) => domains.addDomain(tx, a, { brandId: A.brand.id, hostname: host }));
    expect(await code(as(brandAdmin, (tx, a) => domains.addDomain(tx, a, { brandId: A.brand.id, hostname: host })))).toBe("CONFLICT");
  });
});

describe("staff invitations", () => {
  it("manager invites a cook; the right person accepts; membership granted by the manager", async () => {
    const cookEmail = `cook-${Math.random().toString(36).slice(2, 7)}@test.local`;
    const { token } = await as(manager, (tx, a) => inviteStaff(tx, a, { email: cookEmail.toUpperCase(), roleKey: "kitchen_staff", target: { level: "branch", id: A.b1.id } }));

    const stranger = await makeUser(owner, "stranger");
    expect(await code(as(stranger, (tx, a) => acceptInvitation(tx, a, token)))).toBe("FORBIDDEN");

    const cookId = await makeUser(owner, "cook");
    await owner.update(schema.users).set({ email: cookEmail }).where(eq(schema.users.id, cookId));
    const membershipId = await as(cookId, (tx, a) => acceptInvitation(tx, a, token));
    const [m] = await owner.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId!));
    expect(m).toMatchObject({ userId: cookId, grantedBy: manager, branchId: A.b1.id });

    expect(await code(as(cookId, (tx, a) => acceptInvitation(tx, a, token)))).toBe("NOT_FOUND"); // single use
    const staff = await as(manager, (tx) => listStaff(tx, { branchId: A.b1.id }));
    expect(staff.map((s) => s.userId)).toContain(cookId);
  });

  it("cannot invite peers or higher roles, or into other branches", async () => {
    expect(await code(as(manager, (tx, a) => inviteStaff(tx, a, { email: "x@test.local", roleKey: "branch_manager", target: { level: "branch", id: A.b1.id } })))).toBe("FORBIDDEN");
    expect(await code(as(manager, (tx, a) => inviteStaff(tx, a, { email: "x@test.local", roleKey: "kitchen_staff", target: { level: "branch", id: A.b2.id } })))).toBe("NOT_FOUND");
  });

  it("invitation dies if the inviter loses their role before acceptance", async () => {
    const tempManager = await makeUser(owner, "temp");
    const mm = await grant(owner, tempManager, "branch_manager", { brandId: A.brand.id, branchId: A.b1.id });
    const email = `late-${Math.random().toString(36).slice(2, 7)}@test.local`;
    const { token } = await as(tempManager, (tx, a) => inviteStaff(tx, a, { email, roleKey: "kitchen_staff", target: { level: "branch", id: A.b1.id } }));
    await owner.update(schema.memberships).set({ revokedAt: new Date(), revokedBy: brandAdmin }).where(eq(schema.memberships.id, mm.id));
    const late = await makeUser(owner, "late");
    await owner.update(schema.users).set({ email }).where(eq(schema.users.id, late));
    expect(await code(as(late, (tx, a) => acceptInvitation(tx, a, token)))).toBe("FORBIDDEN");
  });
});
