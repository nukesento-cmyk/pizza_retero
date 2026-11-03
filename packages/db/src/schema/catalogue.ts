import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, foreignKey, index, integer, numeric, pgEnum, pgTable, primaryKey, text, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { branches, brands } from "./tenancy";

/*
 * Catalogue. All prices are bigint minor units in the brand's currency.
 * Brand-level tables define WHAT can be sold; branch-level tables define
 * availability and (bounded) price overrides.
 */

export const catalogueStatus = pgEnum("catalogue_status", ["draft", "active", "archived"]);
export const productKind = pgEnum("product_kind", ["pizza", "side", "drink", "dessert"]);
export const optionGroupKind = pgEnum("option_group_kind", ["crust", "sauce", "cheese", "topping", "extra"]);
export const ingredientUnit = pgEnum("ingredient_unit", ["g", "ml", "each"]);

const money = (name: string) => bigint(name, { mode: "bigint" });
const SLUG = `'^[a-z0-9]+(-[a-z0-9]+)*$'`;

/** Reference list (seeded): the 14 major food allergens. */
export const allergens = pgTable("allergens", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

export const ingredients = pgTable("ingredients", {
  id: pk(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  unit: ingredientUnit("unit").notNull().default("g"),
  isVegetarian: boolean("is_vegetarian").notNull().default(true),
  isVegan: boolean("is_vegan").notNull().default(false),
  status: catalogueStatus("status").notNull().default("active"),
  ...timestamps,
}, (t) => [
  unique("ingredients_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("ingredients_brand_code_uq").on(t.brandId, t.code),
  check("ingredients_vegan_implies_veg", sql`NOT ${t.isVegan} OR ${t.isVegetarian}`),
]);

export const ingredientAllergens = pgTable("ingredient_allergens", {
  brandId: uuid("brand_id").notNull(),
  ingredientId: uuid("ingredient_id").notNull(),
  allergenCode: text("allergen_code").notNull().references(() => allergens.code, { onDelete: "restrict" }),
}, (t) => [
  primaryKey({ columns: [t.ingredientId, t.allergenCode] }),
  foreignKey({ name: "ingredient_allergens_ing_fk", columns: [t.ingredientId, t.brandId], foreignColumns: [ingredients.id, ingredients.brandId] }).onDelete("cascade"),
]);

export const products = pgTable("products", {
  id: pk(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  kind: productKind("kind").notNull().default("pizza"),
  /** Can be built station by station in the 3D kitchen. */
  builderEnabled: boolean("builder_enabled").notNull().default(false),
  imageKey: text("image_key"),
  status: catalogueStatus("status").notNull().default("draft"),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
}, (t) => [
  unique("products_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("products_brand_slug_uq").on(t.brandId, t.slug),
  check("products_slug_format", sql`${t.slug} ~ ${sql.raw(SLUG)}`),
  index("products_brand_status_idx").on(t.brandId, t.status),
]);

export const productVariants = pgTable("product_variants", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  productId: uuid("product_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  /** Size family used for option pricing and the 3D builder (e.g. personal/classic/party). */
  sizeCode: text("size_code"),
  priceMinor: money("price_minor").notNull(),
  /** Bounds for branch overrides (Q5). NULL = no bound. */
  minPriceMinor: money("min_price_minor"),
  maxPriceMinor: money("max_price_minor"),
  isDefault: boolean("is_default").notNull().default(false),
  status: catalogueStatus("status").notNull().default("active"),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "product_variants_product_fk", columns: [t.productId, t.brandId], foreignColumns: [products.id, products.brandId] }).onDelete("cascade"),
  unique("product_variants_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("product_variants_code_uq").on(t.productId, t.code),
  check("product_variants_price_pos", sql`${t.priceMinor} > 0`),
  check("product_variants_bounds", sql`(${t.minPriceMinor} IS NULL OR ${t.minPriceMinor} <= ${t.priceMinor}) AND (${t.maxPriceMinor} IS NULL OR ${t.maxPriceMinor} >= ${t.priceMinor})`),
]);

export const optionGroups = pgTable("option_groups", {
  id: pk(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: optionGroupKind("kind").notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
}, (t) => [
  unique("option_groups_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("option_groups_brand_code_uq").on(t.brandId, t.code),
  check("option_groups_bounds", sql`${t.minSelect} >= 0 AND ${t.maxSelect} >= 1 AND ${t.minSelect} <= ${t.maxSelect}`),
]);

export const options = pgTable("options", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  groupId: uuid("group_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  priceMinor: money("price_minor").notNull().default(sql`0`),
  ingredientId: uuid("ingredient_id"),
  /** Key the 3D kitchen uses to draw this option (e.g. "pepperoni", "thin"). */
  visualKey: text("visual_key"),
  color: text("color"),
  status: catalogueStatus("status").notNull().default("active"),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "options_group_fk", columns: [t.groupId, t.brandId], foreignColumns: [optionGroups.id, optionGroups.brandId] }).onDelete("cascade"),
  foreignKey({ name: "options_ingredient_fk", columns: [t.ingredientId, t.brandId], foreignColumns: [ingredients.id, ingredients.brandId] }).onDelete("restrict"),
  unique("options_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("options_group_code_uq").on(t.groupId, t.code),
  check("options_price_nonneg", sql`${t.priceMinor} >= 0`),
  check("options_color_hex", sql`${t.color} IS NULL OR ${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
]);

/** Size-dependent option price and portion (e.g. more pepperoni on a party pie). */
export const optionSizes = pgTable("option_sizes", {
  brandId: uuid("brand_id").notNull(),
  optionId: uuid("option_id").notNull(),
  sizeCode: text("size_code").notNull(),
  priceMinor: money("price_minor"),
  portionQty: numeric("portion_qty", { precision: 12, scale: 3 }),
}, (t) => [
  primaryKey({ columns: [t.optionId, t.sizeCode] }),
  foreignKey({ name: "option_sizes_option_fk", columns: [t.optionId, t.brandId], foreignColumns: [options.id, options.brandId] }).onDelete("cascade"),
  check("option_sizes_price_nonneg", sql`${t.priceMinor} IS NULL OR ${t.priceMinor} >= 0`),
]);

export const productOptionGroups = pgTable("product_option_groups", {
  brandId: uuid("brand_id").notNull(),
  productId: uuid("product_id").notNull(),
  groupId: uuid("group_id").notNull(),
  minSelect: integer("min_select"),
  maxSelect: integer("max_select"),
  sort: integer("sort").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.productId, t.groupId] }),
  foreignKey({ name: "pog_product_fk", columns: [t.productId, t.brandId], foreignColumns: [products.id, products.brandId] }).onDelete("cascade"),
  foreignKey({ name: "pog_group_fk", columns: [t.groupId, t.brandId], foreignColumns: [optionGroups.id, optionGroups.brandId] }).onDelete("cascade"),
  check("pog_bounds", sql`(${t.minSelect} IS NULL OR ${t.minSelect} >= 0) AND (${t.maxSelect} IS NULL OR ${t.maxSelect} >= 1)`),
]);

/** Options included in the product's base price (a Margherita includes tomato + mozzarella + basil). */
export const productDefaultOptions = pgTable("product_default_options", {
  brandId: uuid("brand_id").notNull(),
  productId: uuid("product_id").notNull(),
  optionId: uuid("option_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.productId, t.optionId] }),
  foreignKey({ name: "pdo_product_fk", columns: [t.productId, t.brandId], foreignColumns: [products.id, products.brandId] }).onDelete("cascade"),
  foreignKey({ name: "pdo_option_fk", columns: [t.optionId, t.brandId], foreignColumns: [options.id, options.brandId] }).onDelete("cascade"),
]);

/** Base recipe per variant, for stock consumption (Phase 5) and allergen roll-up. */
export const variantRecipes = pgTable("variant_recipes", {
  brandId: uuid("brand_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  ingredientId: uuid("ingredient_id").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.variantId, t.ingredientId] }),
  foreignKey({ name: "variant_recipes_variant_fk", columns: [t.variantId, t.brandId], foreignColumns: [productVariants.id, productVariants.brandId] }).onDelete("cascade"),
  foreignKey({ name: "variant_recipes_ing_fk", columns: [t.ingredientId, t.brandId], foreignColumns: [ingredients.id, ingredients.brandId] }).onDelete("restrict"),
  check("variant_recipes_qty_pos", sql`${t.quantity} > 0`),
]);

/* ── Branch overrides ───────────────────────────────────────────── */

export const branchProducts = pgTable("branch_products", {
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  productId: uuid("product_id").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  ...timestamps,
}, (t) => [
  primaryKey({ columns: [t.branchId, t.productId] }),
  foreignKey({ name: "branch_products_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
  foreignKey({ name: "branch_products_product_fk", columns: [t.productId, t.brandId], foreignColumns: [products.id, products.brandId] }).onDelete("cascade"),
]);

export const branchVariantPrices = pgTable("branch_variant_prices", {
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  priceMinor: money("price_minor").notNull(),
  ...timestamps,
}, (t) => [
  primaryKey({ columns: [t.branchId, t.variantId] }),
  foreignKey({ name: "bvp_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
  foreignKey({ name: "bvp_variant_fk", columns: [t.variantId, t.brandId], foreignColumns: [productVariants.id, productVariants.brandId] }).onDelete("cascade"),
  check("bvp_price_pos", sql`${t.priceMinor} > 0`),
]);

export const branchOptionOverrides = pgTable("branch_option_overrides", {
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  optionId: uuid("option_id").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  priceMinor: money("price_minor"),
  ...timestamps,
}, (t) => [
  primaryKey({ columns: [t.branchId, t.optionId] }),
  foreignKey({ name: "boo_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
  foreignKey({ name: "boo_option_fk", columns: [t.optionId, t.brandId], foreignColumns: [options.id, options.brandId] }).onDelete("cascade"),
  check("boo_price_nonneg", sql`${t.priceMinor} IS NULL OR ${t.priceMinor} >= 0`),
]);
