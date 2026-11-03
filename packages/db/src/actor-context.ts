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
