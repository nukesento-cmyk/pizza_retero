import type { NextRequest } from "next/server";
import { audit, payments } from "@retero/core";
import { clientIp } from "@/server/http";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { paymentDeps, runSystem } from "@/server/payments";

/**
 * M-Pesa STK callback. The path token (unguessable, per attempt) identifies
 * the attempt; the body is persisted before processing; success is only
 * applied after STK Query verification. Always answers 200 so Safaricom
 * doesn't retry-storm; outcomes are in mpesa_callbacks.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let payload: unknown = null;
  try { payload = JSON.parse((await req.text()).slice(0, 32_768)); } catch { payload = { unparseable: true }; }
  try {
    const outcome = await payments.handleStkCallback(runSystem, paymentDeps(), { token, payload, sourceIpHash: audit.hashIp(await clientIp(), env().AUDIT_IP_SALT) });
    log.info("mpesa.stk.callback", { outcome });
  } catch (e) {
    log.error("mpesa.stk.callback.failed", { err: e });
  }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
