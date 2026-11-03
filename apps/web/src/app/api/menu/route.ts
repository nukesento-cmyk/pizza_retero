import { NextResponse, type NextRequest } from "next/server";
import { and, eq, schema, withActor } from "@retero/db";
import { catalogue } from "@retero/core";
import { isUuid } from "@retero/shared/ids";
import { db } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { publicUrl } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Public branch menu. `?branch=<slug|id>`; defaults to the host's branch.
 * Read model only: prices here are informational; checkout re-prices server-side.
 */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: { code: "NOT_FOUND", message: "No storefront for this host." } }, { status: 404 });
  const ref = req.nextUrl.searchParams.get("branch") ?? tenant.branch?.id;
  if (!ref) return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Choose a branch." } }, { status: 400 });
  const menu = await withActor(db(), null, async (tx) => {
    const [b] = await tx.select({ id: schema.branches.id }).from(schema.branches).where(and(
      eq(schema.branches.brandId, tenant.brand.id), eq(schema.branches.status, "active"),
      isUuid(ref) ? eq(schema.branches.id, ref) : eq(schema.branches.slug, ref),
    ));
    return b ? catalogue.getBranchMenu(tx, b.id) : null;
  });
  if (!menu) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Branch not found." } }, { status: 404 });
  const body = catalogue.serializeMenu(menu);
  for (const p of body.products) (p as { imageUrl?: string | null }).imageUrl = publicUrl(p.imageKey);
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" } });
}
