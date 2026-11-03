import { sql } from "drizzle-orm";
import {
  boolean, char, check, foreignKey, index, jsonb, numeric, pgTable, text,
  timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { pk, tenantStatus, timestamps } from "./_shared";

const SLUG = `'^[a-z0-9]+(-[a-z0-9]+)*$'`;

export const brands = pgTable(
  "brands",
  {
    id: pk(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: tenantStatus("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("brands_slug_uq").on(t.slug),
    check("brands_slug_format", sql`${t.slug} ~ ${sql.raw(SLUG)}`),
  ],
);

/** Theme tokens a brand may override. Validated by Zod in core before write. */
export interface BrandTheme {
  colors?: Partial<Record<"sauce" | "crust" | "oven" | "basil" | "dough" | "espresso", string>>;
  logoAssetKey?: string;
}

export const brandSettings = pgTable(
  "brand_settings",
  {
    brandId: uuid("brand_id").primaryKey().references(() => brands.id, { onDelete: "restrict" }),
    currency: char("currency", { length: 3 }).notNull().default("KES"),
    timezone: text("timezone").notNull().default("Africa/Nairobi"),
    whatsappNumber: text("whatsapp_number"), // E.164, used for click-to-chat
    supportEmail: text("support_email"),
    theme: jsonb("theme").$type<BrandTheme>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    check("brand_settings_wa_e164", sql`${t.whatsappNumber} IS NULL OR ${t.whatsappNumber} ~ '^\\+[1-9][0-9]{6,14}$'`),
  ],
);

export const franchisees = pgTable(
  "franchisees",
  {
    id: pk(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name").notNull(),
    kraPin: text("kra_pin"),
    status: tenantStatus("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    // Lets children reference (id, brand_id) so they cannot claim another brand.
    unique("franchisees_id_brand_uq").on(t.id, t.brandId),
    index("franchisees_brand_idx").on(t.brandId),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: pk(),
    brandId: uuid("brand_id").notNull(),
    franchiseeId: uuid("franchisee_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    addressLine: text("address_line"),
    area: text("area"),
    city: text("city").notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    timezone: text("timezone").notNull().default("Africa/Nairobi"),
    offersDelivery: boolean("offers_delivery").notNull().default(true),
    offersCollection: boolean("offers_collection").notNull().default(true),
    status: tenantStatus("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "branches_franchisee_brand_fk",
      columns: [t.franchiseeId, t.brandId],
      foreignColumns: [franchisees.id, franchisees.brandId],
    }).onDelete("restrict"),
    foreignKey({ name: "branches_brand_fk", columns: [t.brandId], foreignColumns: [brands.id] }).onDelete("restrict"),
    unique("branches_id_brand_uq").on(t.id, t.brandId),
    uniqueIndex("branches_brand_slug_uq").on(t.brandId, t.slug),
    index("branches_franchisee_idx").on(t.franchiseeId),
    check("branches_slug_format", sql`${t.slug} ~ ${sql.raw(SLUG)}`),
    check("branches_lat_range", sql`${t.latitude} IS NULL OR ${t.latitude} BETWEEN -90 AND 90`),
    check("branches_lng_range", sql`${t.longitude} IS NULL OR ${t.longitude} BETWEEN -180 AND 180`),
  ],
);

/**
 * Hostnames that route to a brand, a franchisee (e.g. a regional site such as
 * nairobi.brand.com listing its branches) or a single branch.
 * Routing input only. Never used for authorization.
 */
export const domains = pgTable(
  "domains",
  {
    id: pk(),
    hostname: text("hostname").notNull(),
    brandId: uuid("brand_id").notNull(),
    franchiseeId: uuid("franchisee_id"),
    branchId: uuid("branch_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("domains_hostname_uq").on(t.hostname),
    foreignKey({ name: "domains_brand_fk", columns: [t.brandId], foreignColumns: [brands.id] }).onDelete("restrict"),
    foreignKey({
      name: "domains_franchisee_brand_fk",
      columns: [t.franchiseeId, t.brandId],
      foreignColumns: [franchisees.id, franchisees.brandId],
    }).onDelete("restrict"),
    foreignKey({
      name: "domains_branch_brand_fk",
      columns: [t.branchId, t.brandId],
      foreignColumns: [branches.id, branches.brandId],
    }).onDelete("restrict"),
    check("domains_single_target", sql`${t.franchiseeId} IS NULL OR ${t.branchId} IS NULL`),
    // Exactly one canonical hostname per target (brand, franchisee or branch).
    uniqueIndex("domains_one_primary_v2_uq")
      .on(
        t.brandId,
        sql`coalesce(${t.franchiseeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`coalesce(${t.branchId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.isPrimary}`),
    check("domains_hostname_format", sql`${t.hostname} = lower(${t.hostname}) AND ${t.hostname} ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$'`),
  ],
);
