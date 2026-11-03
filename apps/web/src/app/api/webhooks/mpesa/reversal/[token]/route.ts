import type { NextRequest } from "next/server";
import { payments } from "@retero/core";
import { log } from "@/server/log";
import { runSystem } from "@/server/payments";

/** M-Pesa reversal result / queue-timeout callback. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let payload: unknown = null;
  try { payload = JSON.parse((await req.text()).slice(0, 32_768)); } catch { payload = { unparseable: true }; }
  try {
    const outcome = await payments.handleReversalResult(runSystem, { token, payload, timeout: req.nextUrl.searchParams.has("timeout") });
    log.info("mpesa.reversal.callback", { outcome });
  } catch (e) {
    log.error("mpesa.reversal.callback.failed", { err: e });
  }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
