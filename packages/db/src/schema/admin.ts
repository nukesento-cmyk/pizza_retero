import { sql } from "drizzle-orm";
import {
  boolean, check, foreignKey, index, pgTable, smallint, text, time, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { pk, scopeType, timestamps } from "./_shared";
import { users } from "./identity";
import { branches, brands, franchisees } from "./tenancy";
import { roles } from "./access";

/**
 * Weekly opening hours. `closes_at < opens_at` means the interval runs past
 * midnight (e.g. 18:00–02:00). Several intervals per day are allowed.
 */
export const branchHours = pgTable(
  "branch_hours",
  {
    id: pk(),
    brandId: uuid("brand_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    dayOfWeek: smallint("day_of_week").notNull(), // 0 = Sunday … 6 = Saturday (branch timezone)
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: "branch_hours_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
    uniqueIndex("branch_hours_slot_uq").on(t.branchId, t.dayOfWeek, t.opensAt),
    check("branch_hours_dow", sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
    check("branch_hours_nonzero", sql`${t.opensAt} <> ${t.closesAt}`),
  ],
);

/** Date-specific closures/overrides (public holidays, refits). */
export const branchClosures = pgTable(
  "branch_closures",
  {
    id: pk(),
    brandId: uuid("brand_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: "branch_closures_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
    check("branch_closures_range", sql`${t.endsAt} > ${t.startsAt}`),
    index("branch_closures_branch_idx").on(t.branchId, t.startsAt),
  ],
);

/**
 * Staff invitation. Only a hash of the token is stored. Acceptance goes
 * through app.accept_invitation(), which creates the membership on behalf of
 * the inviter after re-checking their right to grant it.
 */
export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: pk(),
    email: text("email").notNull(),
    roleId: uuid("role_id").notNull(),
    scopeType: scopeType("scope_type").notNull(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "restrict" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: "staff_invitations_role_scope_fk", columns: [t.roleId, t.scopeType], foreignColumns: [roles.id, roles.scopeType] }).onDelete("restrict"),
    uniqueIndex("staff_invitations_token_uq").on(t.tokenHash),
    index("staff_invitations_email_idx").on(sql`lower(${t.email})`),
    check("staff_invitations_email_lower", sql`${t.email} = lower(${t.email})`),
    check(
      "staff_invitations_scope_shape",
      sql`CASE ${t.scopeType}
        WHEN 'platform'   THEN ${t.brandId} IS NULL AND ${t.franchiseeId} IS NULL AND ${t.branchId} IS NULL
        WHEN 'brand'      THEN ${t.brandId} IS NOT NULL AND ${t.franchiseeId} IS NULL AND ${t.branchId} IS NULL
        WHEN 'franchisee' THEN ${t.brandId} IS NOT NULL AND ${t.franchiseeId} IS NOT NULL AND ${t.branchId} IS NULL
        WHEN 'branch'     THEN ${t.brandId} IS NOT NULL AND ${t.franchiseeId} IS NULL AND ${t.branchId} IS NOT NULL
      END`,
    ),
  ],
);

export const domainVerification = {
  /** DNS TXT record name prefix used for domain ownership checks. */
  recordPrefix: "_retero-verify",
};

export const featureFlags = pgTable("brand_flags", {
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  ...timestamps,
}, (t) => [uniqueIndex("brand_flags_uq").on(t.brandId, t.key)]);
