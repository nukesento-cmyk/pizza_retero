/**
 * Bootstrap provisioning: create an ACTIVE brand with default settings.
 * Phase 2 replaces this with the platform-owner UI; until then this is the
 * supported way to stand up a brand. Runs as the owner role and is audited.
 *
 *   pnpm --filter @retero/core create-brand <slug> "<Name>" [--whatsapp +2547...]
 */
import { config } from "dotenv";
import { z } from "zod";
import { createDb, schema } from "@retero/db";

config({ path: new URL("../../../.env", import.meta.url).pathname });

const args = process.argv.slice(2);
const waIdx = args.indexOf("--whatsapp");
const whatsapp = waIdx >= 0 ? args.splice(waIdx, 2)[1] : undefined;
const parsed = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(80),
  whatsapp: z.string().regex(/^\+[1-9][0-9]{6,14}$/).optional(),
}).safeParse({ slug: args[0], name: args[1], whatsapp });
if (!parsed.success || !process.env.DATABASE_OWNER_URL) {
  console.error('usage: create-brand <slug> "<Name>" [--whatsapp +2547XXXXXXXX]  (requires DATABASE_OWNER_URL)');
  process.exit(1);
}
const input = parsed.data;

const { db, close } = createDb({ url: process.env.DATABASE_OWNER_URL, max: 1, appName: "retero-bootstrap" });
try {
  await db.transaction(async (tx) => {
    const [brand] = await tx
      .insert(schema.brands)
      .values({ slug: input.slug, name: input.name, status: "active" })
      .onConflictDoNothing()
      .returning();
    if (!brand) {
      console.log(`brand "${input.slug}" already exists. Nothing changed.`);
      return;
    }
    await tx.insert(schema.brandSettings).values({ brandId: brand.id, whatsappNumber: input.whatsapp ?? null });
    await tx.insert(schema.auditLogs).values({
      action: "brand.create", brandId: brand.id, targetType: "brand", targetId: brand.id,
      metadata: { system: "bootstrap:create-brand", slug: input.slug },
    });
    console.log(`created brand ${input.name} (${brand.id})`);
  });
} finally {
  await close();
}
