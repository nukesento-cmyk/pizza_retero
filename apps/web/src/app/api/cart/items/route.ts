import type { NextRequest } from "next/server";
import { z } from "zod";
import { commerce } from "@retero/core";
import { parseInput } from "@retero/shared/errors";
import { currentCart } from "@/server/cart";
import { handle, json, readJson } from "@/server/http";
import { runSystem } from "@/server/payments";

const body = commerce.lineInput.extend({ branchId: z.uuid() });

/** POST /api/cart/items → add a line. Price is computed server-side; any price fields sent are ignored. */
export async function POST(req: NextRequest) {
  return handle("cart.add", { n: 60, windowMs: 60_000 }, async () => {
    const input = parseInput(body, await readJson(req));
    const view = await runSystem(async (tx) => {
      const { cart } = await currentCart(tx, input.branchId, true);
      await commerce.addCartItem(tx, cart, input);
      return commerce.priceCart(tx, cart);
    });
    return json(view, { status: 201 });
  });
}
