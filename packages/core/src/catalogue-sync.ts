import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Database } from "@retero/db";
import { schema } from "@retero/db";
import { PERMISSIONS, SYSTEM_ROLES } from "./rbac/catalogue";
import { ALLERGENS } from "./catalogue/allergens";

/**
 * Mirror the code permission catalogue and system roles into the database.
 * Idempotent. Runs as the OWNER role (reference tables are read-only to the app).
 * This is reference data, not sample data.
 */
export async function syncCatalogue(ownerDb: Database): Promise<{ permissions: number; roles: number }> {
  return ownerDb.transaction(async (tx) => {
    const perms = Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
    await tx
      .insert(schema.permissions)
      .values(perms)
      .onConflictDoUpdate({ target: schema.permissions.key, set: { description: sql`excluded.description` } });

    for (const r of SYSTEM_ROLES) {
      const [role] = await tx
        .insert(schema.roles)
        .values({ key: r.key, name: r.name, scopeType: r.scope, rank: r.rank, brandId: null })
        .onConflictDoUpdate({
          target: [schema.roles.key, schema.roles.brandId],
          set: { name: r.name, rank: r.rank },
        })
        .returning({ id: schema.roles.id, scopeType: schema.roles.scopeType });
      if (!role) throw new Error(`failed to upsert role ${r.key}`);
      if (role.scopeType !== r.scope) {
        throw new Error(`Role ${r.key} scope changed (${role.scopeType} → ${r.scope}); needs a data migration.`);
      }
      const keys = [...r.permissions] as string[];
      await tx
        .insert(schema.rolePermissions)
        .values(keys.map((permissionKey) => ({ roleId: role.id, permissionKey })))
        .onConflictDoNothing();
      await tx
        .delete(schema.rolePermissions)
        .where(and(eq(schema.rolePermissions.roleId, role.id), notInArray(schema.rolePermissions.permissionKey, keys)));
    }

    // Permissions removed from the catalogue disappear from system roles too.
    const systemRoleIds = tx.select({ id: schema.roles.id }).from(schema.roles).where(isNull(schema.roles.brandId));
    await tx
      .delete(schema.rolePermissions)
      .where(and(inArray(schema.rolePermissions.roleId, systemRoleIds), notInArray(schema.rolePermissions.permissionKey, Object.keys(PERMISSIONS))));

    await tx.insert(schema.allergens)
      .values(Object.entries(ALLERGENS).map(([code, name]) => ({ code, name })))
      .onConflictDoUpdate({ target: schema.allergens.code, set: { name: sql`excluded.name` } });

    return { permissions: perms.length, roles: SYSTEM_ROLES.length };
  });
}
