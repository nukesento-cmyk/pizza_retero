import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { withActor, schema, eq, and, asc } from "@retero/db";
import { tenancy } from "@retero/core";
import { db } from "./db";
import { env } from "./env";

/**
 * Tenant for this request's Host header. ROUTING/RENDERING ONLY — never use
 * this to decide what a user may do (ARCHITECTURE §5 B3).
 */
export const getTenant = cache(async () => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return withActor(db(), null, (tx) =>
    tenancy.resolveTenant(tx, host, { devFallbackBrandSlug: env().APP_FALLBACK_BRAND_SLUG }),
  );
});

/** Public storefront data for a brand: settings + active branches. */
export const getBrandPublic = cache(async (brandId: string) =>
  withActor(db(), null, async (tx) => {
    const [settings] = await tx.select().from(schema.brandSettings).where(eq(schema.brandSettings.brandId, brandId));
    const branches = await tx
      .select({
        id: schema.branches.id, slug: schema.branches.slug, name: schema.branches.name,
        area: schema.branches.area, city: schema.branches.city, phone: schema.branches.phone,
        offersDelivery: schema.branches.offersDelivery, offersCollection: schema.branches.offersCollection,
      })
      .from(schema.branches)
      .where(and(eq(schema.branches.brandId, brandId), eq(schema.branches.status, "active")))
      .orderBy(asc(schema.branches.city), asc(schema.branches.name));
    return { settings: settings ?? null, branches };
  }),
);
