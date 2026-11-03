/**
 * Bootstrap: make an existing user (who has signed in at least once) the
 * platform owner. The only membership ever created outside the app's RLS
 * path, so it is audited with a system reason.
 *
 *   pnpm --filter @retero/core grant-platform-owner you@example.com
 */
import { config } from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@retero/db";

config({ path: new URL("../../../.env", import.meta.url).pathname });
const email = process.argv[2];
const url = process.env.DATABASE_OWNER_URL;
if (!email || !url) {
  console.error("usage: grant-platform-owner <email>  (requires DATABASE_OWNER_URL)");
  process.exit(1);
}

const { db, close } = createDb({ url, max: 1, appName: "retero-bootstrap" });
try {
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(sql`lower(${schema.users.email}) = lower(${email})`);
    if (!user) throw new Error(`No user with email ${email}. Sign in once first.`);
    const [role] = await tx.select().from(schema.roles).where(and(eq(schema.roles.key, "platform_owner"), isNull(schema.roles.brandId)));
    if (!role) throw new Error("platform_owner role missing. Run pnpm db:seed first.");
    const rows = await tx
      .insert(schema.memberships)
      .values({ userId: user.id, roleId: role.id, scopeType: "platform" })
      .onConflictDoNothing()
      .returning({ id: schema.memberships.id });
    await tx.insert(schema.auditLogs).values({
      action: "membership.grant", targetType: "membership", targetId: rows[0]?.id ?? null,
      metadata: { system: "bootstrap:grant-platform-owner", userId: user.id, role: "platform_owner" },
    });
    console.log(rows[0] ? `granted platform_owner to ${email}` : `${email} is already platform owner`);
  });
} finally {
  await close();
}
