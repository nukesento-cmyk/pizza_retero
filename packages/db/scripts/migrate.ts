import { config } from "dotenv";
import { runMigrations } from "../src/migrate";

config({ path: new URL("../../../.env", import.meta.url).pathname });

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error("DATABASE_OWNER_URL is not set");
  process.exit(1);
}
await runMigrations(url);
console.log("migrations applied");
