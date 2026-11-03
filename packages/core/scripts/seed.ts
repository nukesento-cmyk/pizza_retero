import { config } from "dotenv";
import { createDb } from "@retero/db";
import { syncCatalogue } from "../src/catalogue-sync";

config({ path: new URL("../../../.env", import.meta.url).pathname });
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL is not set");

const { db, close } = createDb({ url, max: 1, appName: "retero-seed" });
try {
  const res = await syncCatalogue(db);
  console.log(`catalogue synced: ${res.permissions} permissions, ${res.roles} system roles`);
} finally {
  await close();
}
