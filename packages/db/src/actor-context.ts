import { sql } from "drizzle-orm";
import type { Database, Tx } from "./client";

/**
 * Run `fn` in a transaction whose RLS context is the given user.
 *
 * `userId` MUST come from a server-verified session (never from request
 * input). `null` means anonymous: only public policies apply.
 *
 * `set_config(..., true)` scopes the setting to this transaction, so it can
 * never leak to another request sharing the pooled connection.
 */
export async function withActor<T>(db: Database, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId ?? ""}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` on the SYSTEM pool (role retero_system, BYPASSRLS) for trusted
 * server paths that have no end-user identity: payment callbacks, the guest
 * checkout engine, the background worker. Callers in `core` must enforce
 * their own rules; `reason` is recorded for pg_stat_activity/log correlation.
 */
export async function withSystem<T>(systemDb: Database, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return systemDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('application_name', ${`retero-system:${reason}`.slice(0, 63)}, true)`);
    return fn(tx);
  });
}
