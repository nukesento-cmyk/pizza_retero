import type { NextRequest } from "next/server";
import { z } from "zod";
import { commerce } from "@retero/core";
import { parseInput } from "@retero/shared/errors";
import { currentCart } from "@/server/cart";
import { handle, json, readJson } from "@/server/http";
import { runSystem } from "@/server/payments";

const body = z.object({ branchId: z.uuid() }).passthrough();

/** POST /api/checkout/quote → server-calculated price (subtotal, delivery, VAT, total). */
export async function POST(req: NextRequest) {
  return handle("checkout.quote", { n: 30, windowMs: 60_000 }, async () => {
    const raw = await readJson(req);
    const { branchId } = parseInput(body, raw);
    const r = await runSystem(async (tx) => {
      const { cart } = await currentCart(tx, branchId);
      return commerce.createQuote(tx, cart, raw);
    });
    return json({
      quoteId: r.quote.id, expiresAt: r.quote.expiresAt, fulfilment: r.quote.fulfilment, etaMinutes: r.etaMinutes, currency: r.quote.currency,
      subtotalMinor: r.quote.subtotalMinor, deliveryFeeMinor: r.quote.deliveryFeeMinor, discountMinor: r.quote.discountMinor,
      totalMinor: r.quote.totalMinor, vatIncludedMinor: r.quote.vatIncludedMinor,
      lines: r.lines.map((l) => ({ name: l.productName, variant: l.variantName, quantity: l.quantity, lineTotalMinor: l.lineTotalMinor })),
    });
  });
}
