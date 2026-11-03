import { sql } from "@retero/db";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + database reachability. Reveals nothing about tenants. */
export async function GET() {
  const started = Date.now();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: "ok", db: "ok", latencyMs: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
