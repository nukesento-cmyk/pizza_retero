import "server-only";
import { withSystem } from "@retero/db";
import type { payments } from "@retero/core";
import { env } from "./env";
import { systemDb } from "./db";

/** System-pool transaction runner for the commerce/payments engine (D-017). */
export const runSystem: payments.RunTx = (fn) => withSystem(systemDb(), "commerce", fn);

export function paymentDeps(): payments.PaymentDeps {
  const e = env();
  return {
    env: process.env,
    // The M-Pesa simulator (D-021) only ever works locally.
    allowSimulator: e.APP_ENV === "local",
    callbackBaseUrl: process.env.MPESA_CALLBACK_BASE_URL ?? e.NEXT_PUBLIC_SITE_URL,
  };
}
