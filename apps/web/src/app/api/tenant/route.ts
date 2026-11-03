import { getTenant } from "@/server/tenant";

export const dynamic = "force-dynamic";

/** Public routing info for the current host. */
export async function GET() {
  const t = await getTenant();
  if (!t) {
    return Response.json({ error: { code: "NOT_FOUND", message: "No storefront is configured for this host." } }, { status: 404 });
  }
  return Response.json({
    brand: { slug: t.brand.slug, name: t.brand.name },
    branch: t.branch ? { slug: t.branch.slug, name: t.branch.name } : null,
    regional: t.franchiseeId !== null,
    canonicalHost: t.canonicalHost,
  });
}
