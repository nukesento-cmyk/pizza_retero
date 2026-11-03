import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { Executor } from "@retero/db";
import { schema } from "@retero/db";
import { isLocalHost, normalizeHost } from "./host";

const { brands, branches, domains } = schema;

export interface TenantContext {
  brand: { id: string; slug: string; name: string };
  /** Set when the host targets a franchisee (regional) site. */
  franchiseeId: string | null;
  branch: { id: string; slug: string; name: string } | null;
  host: string;
  /** Primary hostname for this target, for canonical SEO URLs. */
  canonicalHost: string | null;
  matchedBy: "domain" | "dev-fallback";
}

export interface ResolveOptions {
  /** Brand slug used for localhost only. Ignored for real hostnames. */
  devFallbackBrandSlug?: string | undefined;
}

/**
 * Map a request host to a tenant for ROUTING AND RENDERING ONLY.
 * Must be called with an anonymous (or any) actor context — it reads only
 * public rows (verified domains, active brands/branches). It never confers
 * permissions; see docs/ARCHITECTURE.md §5 B3.
 */
export async function resolveTenant(tx: Executor, rawHost: string | null, opts: ResolveOptions = {}): Promise<TenantContext | null> {
  const host = normalizeHost(rawHost);
  if (!host) return null;

  const [row] = await tx
    .select({
      brandId: brands.id, brandSlug: brands.slug, brandName: brands.name,
      franchiseeId: domains.franchiseeId,
      branchId: domains.branchId,
    })
    .from(domains)
    .innerJoin(brands, eq(brands.id, domains.brandId))
    .where(and(eq(domains.hostname, host), isNotNull(domains.verifiedAt), eq(brands.status, "active")))
    .limit(1);

  if (row) {
    let branch: TenantContext["branch"] = null;
    if (row.branchId) {
      const [b] = await tx
        .select({ id: branches.id, slug: branches.slug, name: branches.name })
        .from(branches)
        .where(and(eq(branches.id, row.branchId), eq(branches.status, "active")))
        .limit(1);
      if (!b) return null; // branch closed/suspended: do not serve its site
      branch = b;
    }
    return {
      brand: { id: row.brandId, slug: row.brandSlug, name: row.brandName },
      franchiseeId: row.franchiseeId,
      branch,
      host,
      canonicalHost: await canonicalHostFor(tx, row.brandId, row.franchiseeId, row.branchId),
      matchedBy: "domain",
    };
  }

  if (isLocalHost(host) && opts.devFallbackBrandSlug) {
    const [b] = await tx
      .select({ id: brands.id, slug: brands.slug, name: brands.name })
      .from(brands)
      .where(and(eq(brands.slug, opts.devFallbackBrandSlug), eq(brands.status, "active")))
      .limit(1);
    if (b) {
      return { brand: b, franchiseeId: null, branch: null, host, canonicalHost: null, matchedBy: "dev-fallback" };
    }
  }
  return null;
}

export async function canonicalHostFor(
  tx: Executor, brandId: string, franchiseeId: string | null, branchId: string | null,
): Promise<string | null> {
  const conds: SQL[] = [
    eq(domains.brandId, brandId),
    eq(domains.isPrimary, true),
    isNotNull(domains.verifiedAt),
    franchiseeId ? eq(domains.franchiseeId, franchiseeId) : isNull(domains.franchiseeId),
    branchId ? eq(domains.branchId, branchId) : isNull(domains.branchId),
  ];
  const [d] = await tx.select({ hostname: domains.hostname }).from(domains).where(and(...conds)).limit(1);
  return d?.hostname ?? null;
}
