import type { NextRequest } from "next/server";
import { z } from "zod";
import { commerce } from "@retero/core";
import { AppError, parseInput } from "@retero/shared/errors";
import { clearCartToken, currentCart } from "@/server/cart";
import { getSession } from "@/server/auth/session";
import { handle, json, readJson } from "@/server/http";
import { runSystem } from "@/server/payments";

const body = z.object({ branchId: z.uuid() }).passthrough();

/**
 * POST /api/checkout/order — requires an `Idempotency-Key` header. Replaying
 * the same key returns the same order (and no new tracking token).
 */
export async function POST(req: NextRequest) {
  return handle("checkout.order", { n: 10, windowMs: 60_000 }, async () => {
    const key = req.headers.get("idempotency-key");
    if (!key || key.length < 16 || key.length > 80) throw new AppError("VALIDATION_FAILED", "Missing Idempotency-Key header.");
    const raw = (await readJson(req)) as Record<string, unknown> | null;
    const { branchId } = parseInput(body, raw);
    const session = await getSession();
    const r = await runSystem(async (tx) => {
      const { cart } = await currentCart(tx, branchId);
      return commerce.placeOrder(tx, cart, { ...raw, idempotencyKey: key, userId: session.user?.id ?? null, channel: "web" });
    });
    if (!r.replayed) await clearCartToken(branchId);
    return json({
      orderId: r.order.id, number: r.order.number, totalMinor: r.order.totalMinor, paymentDueAt: r.order.paymentDueAt, replayed: r.replayed,
      trackingUrl: r.trackingToken ? `/orders/${r.order.number}?t=${r.trackingToken}` : null,
    }, { status: r.replayed ? 200 : 201 });
  });
}
