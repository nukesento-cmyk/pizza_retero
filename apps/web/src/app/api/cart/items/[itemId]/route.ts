import type { NextRequest } from "next/server";
import { z } from "zod";
import { commerce } from "@retero/core";
import { parseInput } from "@retero/shared/errors";
import { currentCart } from "@/server/cart";
import { handle, json, readJson } from "@/server/http";
import { runSystem } from "@/server/payments";

const body = z.object({ branchId: z.uuid(), quantity: z.number().int().min(0).max(20) });

/** PATCH /api/cart/items/:id → change quantity (0 removes). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  return handle("cart.update", { n: 120, windowMs: 60_000 }, async () => {
    const { itemId } = await params;
    const input = parseInput(body, await readJson(req));
    const view = await runSystem(async (tx) => {
      const { cart } = await currentCart(tx, input.branchId);
      await commerce.updateCartItem(tx, cart, parseInput(z.uuid(), itemId), input.quantity);
      return commerce.priceCart(tx, cart);
    });
    return json(view);
  });
}
