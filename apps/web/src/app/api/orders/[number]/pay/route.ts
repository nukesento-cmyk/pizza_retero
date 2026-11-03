import type { NextRequest } from "next/server";
import { z } from "zod";
import { commerce, payments } from "@retero/core";
import { parseInput } from "@retero/shared/errors";
import { handle, json, readJson } from "@/server/http";
import { paymentDeps, runSystem } from "@/server/payments";

const body = z.object({ t: z.string().min(10).max(100), phone: z.string().min(9).max(20) });

/** POST /api/orders/:number/pay → send an M-Pesa STK push to the customer's phone. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return handle("order.pay", { n: 10, windowMs: 60_000 }, async () => {
    const { number } = await params;
    const input = parseInput(body, await readJson(req));
    const order = await runSystem((tx) => commerce.orderByTracking(tx, number, input.t));
    const r = await payments.initiatePayment(runSystem, paymentDeps(), { orderId: order.id, phone: input.phone });
    return json({ status: r.status, message: r.customerMessage }, { status: 202 });
  });
}
