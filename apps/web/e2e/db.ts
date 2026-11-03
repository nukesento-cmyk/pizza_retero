/**
 * E2E fixtures written straight to the dev database as the OWNER role.
 * Used only to set up preconditions; behaviour under test goes through the UI.
 */
import path from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

export function ownerSql() {
  return postgres(process.env.DATABASE_OWNER_URL!, { max: 1, onnotice: () => {} });
}

/** An active franchisee + branch in the dev brand, and a user granted a role there. */
export async function activeBranch(tag: string) {
  const sql = ownerSql();
  try {
    const [brand] = await sql<{ id: string }[]>`select id from brands where slug = 'retero'`;
    const [f] = await sql<{ id: string }[]>`insert into franchisees (id, brand_id, legal_name, trading_name, status)
      values (gen_random_uuid(), ${brand!.id}, ${`E2E ${tag} Ltd`}, ${`E2E ${tag}`}, 'active') returning id`;
    const [b] = await sql<{ id: string }[]>`insert into branches (id, brand_id, franchisee_id, slug, name, city, area, status, latitude, longitude)
      values (gen_random_uuid(), ${brand!.id}, ${f!.id}, ${`e2e-${tag}`}, ${`E2E ${tag}`}, 'Nairobi', 'Westlands', 'active', -1.2676, 36.8108) returning id`;
    for (let d = 0; d < 7; d++) await sql`insert into branch_hours (id, brand_id, branch_id, day_of_week, opens_at, closes_at) values (gen_random_uuid(), ${brand!.id}, ${b!.id}, ${d}, '00:00', '23:59:59')`;
    await sql`insert into delivery_zones (id, brand_id, branch_id, name, radius_m, fee_minor, eta_minutes) values (gen_random_uuid(), ${brand!.id}, ${b!.id}, 'Inner', 4000, 15000, 35)`;
    await sql`insert into mpesa_accounts (id, brand_id, franchisee_id, environment, shortcode, credentials_ref) values (gen_random_uuid(), ${brand!.id}, ${f!.id}, 'simulator', '174379', 'MPESA_SIM')`;
    return { brandId: brand!.id, franchiseeId: f!.id, branchId: b!.id };
  } finally {
    await sql.end();
  }
}

export async function grantRole(email: string, roleKey: string, scope: { brandId?: string; franchiseeId?: string; branchId?: string }, scopeType: string) {
  const sql = ownerSql();
  try {
    const [u] = await sql<{ id: string }[]>`select id from users where lower(email) = lower(${email})`;
    const [r] = await sql<{ id: string }[]>`select id from roles where key = ${roleKey} and brand_id is null`;
    await sql`insert into memberships (id, user_id, role_id, scope_type, brand_id, franchisee_id, branch_id)
      values (gen_random_uuid(), ${u!.id}, ${r!.id}, ${scopeType}::scope_type, ${scope.brandId ?? null}, ${scopeType === "franchisee" ? scope.franchiseeId! : null}, ${scopeType === "branch" ? scope.branchId! : null})`;
  } finally {
    await sql.end();
  }
}

export async function menuItem(slug: string, variantCode = "classic") {
  const sql = ownerSql();
  try {
    const [r] = await sql<{ productId: string; variantId: string }[]>`select p.id as "productId", v.id as "variantId" from products p join product_variants v on v.product_id = p.id
      join brands b on b.id = p.brand_id where b.slug = 'retero' and p.slug = ${slug} and v.code = ${variantCode}`;
    return r!;
  } finally { await sql.end(); }
}
