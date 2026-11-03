import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;
/** A transaction handle, as passed to `db.transaction(cb)`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the pool or a transaction. */
export type Executor = Database | Tx;

export interface CreateDbOptions {
  url: string;
  max?: number;
  /** Label shown in pg_stat_activity. */
  appName?: string;
}

export function createDb({ url, max = 10, appName = "retero" }: CreateDbOptions): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, {
    max,
    connection: { application_name: appName },
    // Supabase's transaction pooler (pgbouncer) does not support prepared statements.
    prepare: false,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}
