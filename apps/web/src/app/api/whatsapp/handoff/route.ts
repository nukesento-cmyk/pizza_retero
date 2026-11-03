import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq, schema } from "@retero/db";
import { assisted, commerce } from "@retero/core";
import { AppError, parseInput } from "@retero/shared/errors";
import { currentCart } from "@/server/cart";
import { handle, json, readJson } from "@/server/http";
import { runSystem } from "@/server/payments";
import { whatsappLink } from "@/lib/whatsapp";

const body = z.object({ branchId: z.uuid() });

/**
 * POST /api/whatsapp/handoff → a wa.me link whose prefilled text carries the
 * cart reference, so staff can open the same cart in the ops console and
 * finish the order through the same engine (README §7).
 */
export async function POST(req: NextRequest) {
  return handle("whatsapp.handoff", { n: 20, windowMs: 60_000 }, async () => {
    const { branchId } = parseInput(body, await readJson(req));
    const r = await runSystem(async (tx) => {
      const { cart } = await currentCart(tx, branchId, true);
      const [b] = await tx.select({ brandId: schema.branches.brandId }).from(schema.branches).where(eq(schema.branches.id, branchId));
      const [settings] = await tx.select().from(schema.brandSettings).where(eq(schema.brandSettings.brandId, b!.brandId));
      const [brand] = await tx.select({ name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, b!.brandId));
      if (!settings?.whatsappNumber) throw new AppError("CONFLICT", "WhatsApp ordering isn't set up for this brand yet.");
      const view = await commerce.priceCart(tx, cart);
      return { url: whatsappLink(settings.whatsappNumber, assisted.handoffText(brand!.name, view)), reference: cart.reference };
    });
    return json(r);
  });
}
