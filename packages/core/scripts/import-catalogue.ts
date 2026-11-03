/**
 * Import a catalogue template into a brand (owner role, audited as system).
 *   pnpm --filter @retero/core import-catalogue <brand-slug> [template.json] [--publish]
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@retero/db";
import { importCatalogue, readTemplate } from "../src/catalogue/import";

config({ path: new URL("../../../.env", import.meta.url).pathname });
const args = process.argv.slice(2);
const publish = args.includes("--publish");
const [slug, file = new URL("../templates/starter-menu.json", import.meta.url).pathname] = args.filter((a) => a !== "--publish");
if (!slug || !process.env.DATABASE_OWNER_URL) {
  console.error("usage: import-catalogue <brand-slug> [template.json] [--publish]");
  process.exit(1);
}
const { db, close } = createDb({ url: process.env.DATABASE_OWNER_URL, max: 1, appName: "retero-import" });
try {
  await db.transaction(async (tx) => {
    const [brand] = await tx.select().from(schema.brands).where(eq(schema.brands.slug, slug));
    if (!brand) throw new Error(`No brand ${slug}`);
    const res = await importCatalogue(tx, { kind: "system", reason: "import-catalogue" }, brand.id, await readTemplate(file), { publish });
    console.log(`imported into ${brand.name}:`, res, publish ? "(published)" : "(as drafts)");
  });
} finally {
  await close();
}
