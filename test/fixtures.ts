/**
 * Test fixtures. Created through the OWNER connection (bypasses RLS) so tests
 * can then assert what the RUNTIME role is and isn't allowed to see.
 */
import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema, type Database } from "../packages/db/src";
import { uuidv7 } from "../packages/shared/src/ids";
import { TEST_APP_URL, TEST_OWNER_URL, TEST_SYSTEM_URL } from "./env";

export function openDbs() {
  const owner = createDb({ url: TEST_OWNER_URL, max: 2, appName: "test-owner" });
  const app = createDb({ url: TEST_APP_URL, max: 4, appName: "test-app" });
  const system = createDb({ url: TEST_SYSTEM_URL, max: 4, appName: "test-system" });
  return { owner: owner.db, app: app.db, system: system.db, close: async () => { await owner.close(); await app.close(); await system.close(); } };
}

const tag = () => Math.random().toString(36).slice(2, 8);

export async function makeUser(owner: Database, label = "user") {
  const id = uuidv7();
  await owner.insert(schema.users).values({ id, email: `${label}-${tag()}@test.local`, displayName: label });
  return id;
}

export async function roleId(owner: Database, key: string) {
  const [r] = await owner.select().from(schema.roles).where(and(eq(schema.roles.key, key), isNull(schema.roles.brandId)));
  if (!r) throw new Error(`role ${key} missing`);
  return r.id;
}

/** Brand → 2 franchisees → (2 branches, 1 branch). */
export async function makeBrandTree(owner: Database, status: "active" | "pending" = "active") {
  const t = tag();
  const [brand] = await owner.insert(schema.brands).values({ slug: `brand-${t}`, name: `Brand ${t}`, status }).returning();
  const [f1, f2] = await owner.insert(schema.franchisees).values([
    { brandId: brand!.id, legalName: `F1 ${t} Ltd`, tradingName: "F1", status: "active" },
    { brandId: brand!.id, legalName: `F2 ${t} Ltd`, tradingName: "F2", status: "active" },
  ]).returning();
  const [b1, b2, b3] = await owner.insert(schema.branches).values([
    { brandId: brand!.id, franchiseeId: f1!.id, slug: `a-${t}`, name: "A", city: "Nairobi", status: "active" },
    { brandId: brand!.id, franchiseeId: f1!.id, slug: `b-${t}`, name: "B", city: "Nairobi", status: "pending" },
    { brandId: brand!.id, franchiseeId: f2!.id, slug: `c-${t}`, name: "C", city: "Mombasa", status: "pending" },
  ]).returning();
  return { brand: brand!, f1: f1!, f2: f2!, b1: b1!, b2: b2!, b3: b3! };
}

export async function grant(
  owner: Database, userId: string, roleKey: string,
  scope: { brandId?: string; franchiseeId?: string; branchId?: string },
) {
  const role = await owner.select().from(schema.roles).where(and(eq(schema.roles.key, roleKey), isNull(schema.roles.brandId)));
  const r = role[0]!;
  const [m] = await owner.insert(schema.memberships).values({
    userId, roleId: r.id, scopeType: r.scopeType,
    brandId: scope.brandId ?? null, franchiseeId: scope.franchiseeId ?? null, branchId: scope.branchId ?? null,
  }).returning();
  return m!;
}

/** Drizzle wraps driver errors; assert on the underlying Postgres message. */
export async function expectDbError(p: Promise<unknown>, re: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    const msg = `${err.message}\n${err.cause?.message ?? ""}`;
    if (!re.test(msg)) throw new Error(`Expected DB error matching ${re}, got: ${err.cause?.message ?? err.message}`);
    return;
  }
  throw new Error(`Expected DB error matching ${re}, but the query succeeded`);
}

/** Open every day, all day (tests must not depend on the wall clock). */
export async function openAllWeek(owner: Database, brandId: string, branchId: string) {
  await owner.insert(schema.branchHours).values([0, 1, 2, 3, 4, 5, 6].map((d) => ({ brandId, branchId, dayOfWeek: d, opensAt: "00:00", closesAt: "23:59:59" })));
}
