import type { NextRequest } from "next/server";
import { commerce } from "@retero/core";
import { handle, json } from "@/server/http";
import { runSystem } from "@/server/payments";

/** GET /api/orders/:number?t=… → public tracking view (the token is the capability). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return handle("order.track", { n: 120, windowMs: 60_000 }, async () => {
    const { number } = await params;
    const t = req.nextUrl.searchParams.get("t") ?? "";
    const view = await runSystem(async (tx) => commerce.trackingView(tx, await commerce.orderByTracking(tx, number, t)));
    return json(view);
  });
}
