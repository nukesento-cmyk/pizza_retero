import "server-only";
import { createDb, type Database } from "@retero/db";
import { env } from "./env";

// One pool per server process (survives dev hot reloads).
const g = globalThis as unknown as { __reteroDb?: Database; __reteroSystemDb?: Database };

export function db(): Database {
  g.__reteroDb ??= createDb({ url: env().DATABASE_URL, max: 10, appName: "retero-web" }).db;
  return g.__reteroDb;
}

/** System pool (BYPASSRLS). Only for paths with no end-user identity; see withSystem. */
export function systemDb(): Database {
  g.__reteroSystemDb ??= createDb({ url: env().DATABASE_SYSTEM_URL, max: 5, appName: "retero-web-system" }).db;
  return g.__reteroSystemDb;
}
