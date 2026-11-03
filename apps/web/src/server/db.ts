import "server-only";
import { createDb, type Database } from "@retero/db";
import { env } from "./env";

// One pool per server process (survives dev hot reloads).
const g = globalThis as unknown as { __reteroDb?: Database };

export function db(): Database {
  g.__reteroDb ??= createDb({ url: env().DATABASE_URL, max: 10, appName: "retero-web" }).db;
  return g.__reteroDb;
}
