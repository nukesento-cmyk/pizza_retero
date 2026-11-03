import postgres from "postgres";
import { runMigrations } from "../packages/db/src/migrate";
import { createDb } from "../packages/db/src/client";
import { syncCatalogue } from "../packages/core/src/catalogue-sync";
import { TEST_OWNER_URL } from "./env";

/**
 * Rebuild the *test* database schema from versioned migrations, then sync the
 * permission catalogue. Refuses to touch any database not named *_test.
 */
export default async function setup() {
  const sql = postgres(TEST_OWNER_URL, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ db: string }[]>`select current_database() as db`;
    const db = row?.db ?? "";
    if (!db.endsWith("_test")) throw new Error(`Refusing to reset non-test database "${db}"`);
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS app CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP TYPE IF EXISTS scope_type, tenant_status CASCADE;
      CREATE SCHEMA public;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO retero_app, retero_system;
    `);
  } finally {
    await sql.end();
  }
  await runMigrations(TEST_OWNER_URL);
  const { db, close } = createDb({ url: TEST_OWNER_URL, max: 1 });
  await syncCatalogue(db);
  await close();
}
