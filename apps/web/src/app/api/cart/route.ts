import type { NextRequest } from "next/server";
import { z } from "zod";
import { commerce } from "@retero/core";
import { parseInput } from "@retero/shared/errors";
import { currentCart } from "@/server/cart";
import { handle, json } from "@/server/http";
import { runSystem } from "@/server/payments";

const q = z.object({ branch: z.uuid() });

/** GET /api/cart?branch=… → the cart priced against the live menu. */
export async function GET(req: NextRequest) {
  return handle("cart.get", { n: 120, windowMs: 60_000 }, async () => {
    const { branch } = parseInput(q, { branch: req.nextUrl.searchParams.get("branch") });
    const view = await runSystem(async (tx) => {
      try {
        const { cart } = await currentCart(tx, branch);
        return commerce.priceCart(tx, cart);
      } catch {
        return { cartId: null, reference: null, branchId: branch, currency: "KES", lines: [], problems: [], subtotalMinor: 0n };
      }
    });
    return json(view);
  });
}
