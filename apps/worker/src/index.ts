/**
 * Background worker: payment reconciliation, unpaid-order expiry and outbox
 * delivery. Safe to run several copies (row locks with SKIP LOCKED).
 *
 *   pnpm --filter @retero/worker start      # loop
 *   pnpm --filter @retero/worker once       # single pass (cron / tests)
 */
import path from "node:path";
import { config } from "dotenv";
import { createDb, withSystem } from "@retero/db";
import { outbox, payments } from "@retero/core";
import { handlers } from "./handlers";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const url = process.env.DATABASE_SYSTEM_URL;
if (!url) throw new Error("DATABASE_SYSTEM_URL is not set");
const { db, close } = createDb({ url, max: 4, appName: "retero-worker" });
const run: payments.RunTx = (fn) => withSystem(db, "worker", fn);
const deps: payments.PaymentDeps = {
  env: process.env,
  allowSimulator: (process.env.APP_ENV ?? "local") === "local",
  callbackBaseUrl: process.env.MPESA_CALLBACK_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

const log = (level: string, event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));

async function deliverOutbox() {
  let delivered = 0;
  await run(async (tx) => {
    for (const e of await outbox.claimBatch(tx, 50)) {
      try {
        for (const h of handlers[e.topic] ?? []) await h(tx, e);
        await outbox.markPublished(tx, e.id);
        delivered++;
      } catch (err) {
        await outbox.markFailed(tx, e.id, err instanceof Error ? err.message : String(err));
      }
    }
  });
  return delivered;
}

export async function pass() {
  const reconciled = await payments.reconcilePending(run, deps);
  const expired = await payments.expireUnpaidOrders(run);
  const delivered = await deliverOutbox();
  if (reconciled.length || expired.length || delivered) log("info", "worker.pass", { reconciled: reconciled.length, expired: expired.length, delivered });
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; log("info", "worker.stopping", { sig }); });

if (process.argv.includes("--once")) {
  await pass();
  await close();
} else {
  log("info", "worker.started");
  while (!stopping) {
    try { await pass(); } catch (e) { log("error", "worker.pass.failed", { message: e instanceof Error ? e.message : String(e) }); }
    await new Promise((r) => setTimeout(r, Number(process.env.WORKER_INTERVAL_MS ?? 5000)));
  }
  await close();
}
