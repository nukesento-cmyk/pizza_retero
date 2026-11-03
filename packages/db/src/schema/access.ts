import { sql } from "drizzle-orm";
import {
  check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";
import { pk, scopeType, timestamps } from "./_shared";
import { users } from "./identity";
import { branches, brands, franchisees } from "./tenancy";

/** Mirrors the code catalogue in @retero/core/rbac. Reference data. */
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
});

export const roles = pgTable(
  "roles",
  {
    id: pk(),
    key: text("key").notNull(),
    /** NULL = system role available to every brand. */
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    scopeType: scopeType("scope_type").notNull(),
    /** Higher rank may grant lower ranks. Prevents privilege escalation. */
    rank: integer("rank").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("roles_key_brand_uq").on(t.key, t.brandId).nullsNotDistinct(),
    unique("roles_id_scope_uq").on(t.id, t.scopeType),
    check("roles_rank_range", sql`${t.rank} BETWEEN 1 AND 100`),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key").notNull().references(() => permissions.key, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

/**
 * A user holds a role at exactly one scope. Higher scopes cover descendants.
 * Never hard-deleted: revoke by setting `revoked_at`.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid("role_id").notNull(),
    scopeType: scopeType("scope_type").notNull(),
    brandId: uuid("brand_id"),
    franchiseeId: uuid("franchisee_id"),
    branchId: uuid("branch_id"),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "restrict" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    // Role's scope must equal the membership's scope.
    foreignKey({
      name: "memberships_role_scope_fk",
      columns: [t.roleId, t.scopeType],
      foreignColumns: [roles.id, roles.scopeType],
    }).onDelete("restrict"),
    foreignKey({ name: "memberships_brand_fk", columns: [t.brandId], foreignColumns: [brands.id] }).onDelete("restrict"),
    foreignKey({
      name: "memberships_franchisee_brand_fk",
      columns: [t.franchiseeId, t.brandId],
      foreignColumns: [franchisees.id, franchisees.brandId],
    }).onDelete("restrict"),
    foreignKey({
      name: "memberships_branch_brand_fk",
      columns: [t.branchId, t.brandId],
      foreignColumns: [branches.id, branches.brandId],
    }).onDelete("restrict"),
    check(
      "memberships_scope_shape",
      sql`CASE ${t.scopeType}
        WHEN 'platform'   THEN ${t.brandId} IS NULL AND ${t.franchiseeId} IS NULL AND ${t.branchId} IS NULL
        WHEN 'brand'      THEN ${t.brandId} IS NOT NULL AND ${t.franchiseeId} IS NULL AND ${t.branchId} IS NULL
        WHEN 'franchisee' THEN ${t.brandId} IS NOT NULL AND ${t.franchiseeId} IS NOT NULL AND ${t.branchId} IS NULL
        WHEN 'branch'     THEN ${t.brandId} IS NOT NULL AND ${t.franchiseeId} IS NULL AND ${t.branchId} IS NOT NULL
      END`,
    ),
    check("memberships_revoke_pair", sql`(${t.revokedAt} IS NULL) = (${t.revokedBy} IS NULL)`),
    index("memberships_user_active_idx").on(t.userId).where(sql`${t.revokedAt} IS NULL`),
    index("memberships_brand_idx").on(t.brandId),
    index("memberships_branch_idx").on(t.branchId),
  ],
);

/** Append-only. The runtime role has no UPDATE/DELETE grant on this table. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(), // e.g. "membership.grant"
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "restrict" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text("ip_hash"),
    requestId: text("request_id"),
  },
  (t) => [
    index("audit_logs_brand_time_idx").on(t.brandId, t.occurredAt),
    index("audit_logs_branch_time_idx").on(t.branchId, t.occurredAt),
    index("audit_logs_actor_idx").on(t.actorUserId),
  ],
);
