import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor } from "../rbac/types";
import { recordAudit } from "../audit";
import { loadScope } from "../tenancy/scope";
import { ALLERGENS } from "./allergens";

const CODE = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes.").min(1).max(48);
const minor = z.coerce.bigint().refine((v) => v >= 0n, "Must not be negative.");
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** M-Pesa takes whole shillings: KES catalogue prices must be multiples of 100 cents. */
export function assertPayable(currency: string, priceMinor: bigint, label = "Price") {
  if (currency === "KES" && priceMinor % 100n !== 0n) throw new AppError("VALIDATION_FAILED", `${label} must be whole shillings (M-Pesa can't take cents).`);
}

async function brandCurrency(tx: Executor, brandId: string) {
  const [s] = await tx.select({ c: schema.brandSettings.currency }).from(schema.brandSettings).where(eq(schema.brandSettings.brandId, brandId));
  return s?.c ?? "KES";
}

async function brandGuard(tx: Executor, actor: Actor, brandId: string) {
  const scope = await loadScope(tx, { level: "brand", id: brandId });
  authorize(actor, "catalogue.manage", scope);
  return scope;
}

/* ── Ingredients ────────────────────────────────────────────────── */

export const ingredientInput = z.object({
  brandId: z.uuid(),
  code: CODE,
  name: z.string().trim().min(1).max(80),
  unit: z.enum(["g", "ml", "each"]).default("g"),
  isVegetarian: z.boolean().default(true),
  isVegan: z.boolean().default(false),
  allergens: z.array(z.enum(Object.keys(ALLERGENS) as [keyof typeof ALLERGENS, ...(keyof typeof ALLERGENS)[]])).default([]),
}).refine((v) => !v.isVegan || v.isVegetarian, { message: "Vegan implies vegetarian.", path: ["isVegan"] });

export async function upsertIngredient(tx: Executor, actor: Actor, raw: unknown) {
  const { allergens, ...input } = parseInput(ingredientInput, raw);
  const scope = await brandGuard(tx, actor, input.brandId);
  const [ing] = await tx.insert(schema.ingredients).values(input)
    .onConflictDoUpdate({ target: [schema.ingredients.brandId, schema.ingredients.code], set: { name: input.name, unit: input.unit, isVegetarian: input.isVegetarian, isVegan: input.isVegan } })
    .returning();
  await tx.delete(schema.ingredientAllergens).where(eq(schema.ingredientAllergens.ingredientId, ing!.id));
  if (allergens.length) await tx.insert(schema.ingredientAllergens).values(allergens.map((a) => ({ brandId: input.brandId, ingredientId: ing!.id, allergenCode: a })));
  await recordAudit(tx, actor, { action: "ingredient.upsert", scope, targetType: "ingredient", targetId: ing!.id, metadata: { code: input.code, allergens } });
  return ing!;
}

/* ── Option groups & options ────────────────────────────────────── */

export const optionGroupInput = z.object({
  brandId: z.uuid(),
  code: CODE,
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["crust", "sauce", "cheese", "topping", "extra"]),
  minSelect: z.coerce.number().int().min(0).max(20).default(0),
  maxSelect: z.coerce.number().int().min(1).max(20).default(1),
  sort: z.coerce.number().int().default(0),
}).refine((v) => v.minSelect <= v.maxSelect, { message: "Minimum can't exceed maximum.", path: ["minSelect"] });

export async function upsertOptionGroup(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(optionGroupInput, raw);
  const scope = await brandGuard(tx, actor, input.brandId);
  const { brandId: _b, code: _c, ...set } = input;
  const [g] = await tx.insert(schema.optionGroups).values(input)
    .onConflictDoUpdate({ target: [schema.optionGroups.brandId, schema.optionGroups.code], set })
    .returning();
  await recordAudit(tx, actor, { action: "option_group.upsert", scope, targetType: "option_group", targetId: g!.id, metadata: { code: input.code } });
  return g!;
}

export const optionInput = z.object({
  brandId: z.uuid(),
  groupId: z.uuid(),
  code: CODE,
  name: z.string().trim().min(1).max(60),
  priceMinor: minor.default(0n),
  ingredientId: z.uuid().nullish(),
  visualKey: z.string().max(40).nullish(),
  color: HEX.nullish(),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  sort: z.coerce.number().int().default(0),
  sizes: z.array(z.object({ sizeCode: CODE, priceMinor: minor.nullish(), portionQty: z.coerce.number().positive().nullish() })).default([]),
});

export async function upsertOption(tx: Executor, actor: Actor, raw: unknown) {
  const { sizes, ...input } = parseInput(optionInput, raw);
  const scope = await brandGuard(tx, actor, input.brandId);
  const currency = await brandCurrency(tx, input.brandId);
  assertPayable(currency, input.priceMinor);
  for (const s of sizes) if (s.priceMinor != null) assertPayable(currency, s.priceMinor, `${s.sizeCode} price`);
  const [group] = await tx.select().from(schema.optionGroups).where(and(eq(schema.optionGroups.id, input.groupId), eq(schema.optionGroups.brandId, input.brandId)));
  if (!group) throw notFound("Option group");
  const { brandId: _b, groupId: _g, code: _c, ...set } = input;
  const [o] = await tx.insert(schema.options).values({ ...input, ingredientId: input.ingredientId ?? null, visualKey: input.visualKey ?? null, color: input.color ?? null })
    .onConflictDoUpdate({ target: [schema.options.groupId, schema.options.code], set: { ...set, ingredientId: input.ingredientId ?? null, visualKey: input.visualKey ?? null, color: input.color ?? null } })
    .returning();
  await tx.delete(schema.optionSizes).where(eq(schema.optionSizes.optionId, o!.id));
  if (sizes.length) {
    await tx.insert(schema.optionSizes).values(sizes.map((s) => ({
      brandId: input.brandId, optionId: o!.id, sizeCode: s.sizeCode, priceMinor: s.priceMinor ?? null,
      portionQty: s.portionQty != null ? String(s.portionQty) : null,
    })));
  }
  await recordAudit(tx, actor, { action: "option.upsert", scope, targetType: "option", targetId: o!.id, metadata: { code: input.code, priceMinor: String(input.priceMinor) } });
  return o!;
}

/* ── Products ───────────────────────────────────────────────────── */

export const productInput = z.object({
  brandId: z.uuid(),
  slug: CODE,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  kind: z.enum(["pizza", "side", "drink", "dessert"]).default("pizza"),
  builderEnabled: z.boolean().default(false),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  sort: z.coerce.number().int().default(0),
});

export async function upsertProduct(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(productInput, raw);
  const scope = await brandGuard(tx, actor, input.brandId);
  const { brandId: _b, slug: _s, ...set } = input;
  const [p] = await tx.insert(schema.products).values({ ...input, description: input.description ?? null })
    .onConflictDoUpdate({ target: [schema.products.brandId, schema.products.slug], set: { ...set, description: input.description ?? null } })
    .returning();
  await recordAudit(tx, actor, { action: "product.upsert", scope, targetType: "product", targetId: p!.id, metadata: { slug: input.slug, status: input.status } });
  return p!;
}

export const setProductStatusInput = z.object({ productId: z.uuid(), status: z.enum(["draft", "active", "archived"]) });

export async function setProductStatus(tx: Executor, actor: Actor, raw: unknown) {
  const { productId, status } = parseInput(setProductStatusInput, raw);
  const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, productId));
  if (!p) throw notFound("Product");
  const scope = await brandGuard(tx, actor, p.brandId);
  if (status === "active") {
    const vs = await tx.select().from(schema.productVariants).where(and(eq(schema.productVariants.productId, productId), eq(schema.productVariants.status, "active")));
    if (!vs.length) throw new AppError("VALIDATION_FAILED", "Add at least one size/price before publishing.");
  }
  await tx.update(schema.products).set({ status }).where(eq(schema.products.id, productId));
  await recordAudit(tx, actor, { action: "product.status", scope, targetType: "product", targetId: productId, metadata: { status } });
}

export const variantInput = z.object({
  productId: z.uuid(),
  code: CODE,
  name: z.string().trim().min(1).max(40),
  sizeCode: CODE.nullish(),
  priceMinor: minor.refine((v) => v > 0n, "Price must be above zero."),
  minPriceMinor: minor.nullish(),
  maxPriceMinor: minor.nullish(),
  isDefault: z.boolean().default(false),
  sort: z.coerce.number().int().default(0),
}).refine((v) => (v.minPriceMinor == null || v.minPriceMinor <= v.priceMinor) && (v.maxPriceMinor == null || v.maxPriceMinor >= v.priceMinor),
  { message: "Price must sit between the minimum and maximum.", path: ["priceMinor"] });

export async function upsertVariant(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(variantInput, raw);
  const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, input.productId));
  if (!p) throw notFound("Product");
  const scope = await brandGuard(tx, actor, p.brandId);
  const currency = await brandCurrency(tx, p.brandId);
  assertPayable(currency, input.priceMinor);
  if (input.minPriceMinor != null) assertPayable(currency, input.minPriceMinor, "Minimum");
  if (input.maxPriceMinor != null) assertPayable(currency, input.maxPriceMinor, "Maximum");
  if (input.isDefault) await tx.update(schema.productVariants).set({ isDefault: false }).where(eq(schema.productVariants.productId, input.productId));
  const vals = { ...input, brandId: p.brandId, sizeCode: input.sizeCode ?? null, minPriceMinor: input.minPriceMinor ?? null, maxPriceMinor: input.maxPriceMinor ?? null };
  const { productId: _p, code: _c, ...set } = vals;
  const [v] = await tx.insert(schema.productVariants).values(vals)
    .onConflictDoUpdate({ target: [schema.productVariants.productId, schema.productVariants.code], set })
    .returning();
  await recordAudit(tx, actor, { action: "variant.upsert", scope, targetType: "product_variant", targetId: v!.id, metadata: { code: input.code, priceMinor: String(input.priceMinor) } });
  return v!;
}

export const productComposition = z.object({
  productId: z.uuid(),
  groups: z.array(z.object({ groupId: z.uuid(), minSelect: z.number().int().min(0).nullish(), maxSelect: z.number().int().min(1).nullish(), sort: z.number().int().default(0) })),
  defaultOptionIds: z.array(z.uuid()),
});

/** Replace which option groups a product offers and which options it includes. */
export async function setProductComposition(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(productComposition, raw);
  const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, input.productId));
  if (!p) throw notFound("Product");
  const scope = await brandGuard(tx, actor, p.brandId);
  const groupIds = input.groups.map((g) => g.groupId);
  if (input.defaultOptionIds.length) {
    const opts = await tx.select().from(schema.options).where(inArray(schema.options.id, input.defaultOptionIds));
    if (opts.length !== input.defaultOptionIds.length || opts.some((o) => !groupIds.includes(o.groupId) || o.brandId !== p.brandId)) {
      throw new AppError("VALIDATION_FAILED", "Included options must belong to the product's option groups.");
    }
  }
  await tx.delete(schema.productOptionGroups).where(eq(schema.productOptionGroups.productId, p.id));
  await tx.delete(schema.productDefaultOptions).where(eq(schema.productDefaultOptions.productId, p.id));
  if (input.groups.length) await tx.insert(schema.productOptionGroups).values(input.groups.map((g) => ({ ...g, brandId: p.brandId, productId: p.id, minSelect: g.minSelect ?? null, maxSelect: g.maxSelect ?? null })));
  if (input.defaultOptionIds.length) await tx.insert(schema.productDefaultOptions).values(input.defaultOptionIds.map((optionId) => ({ brandId: p.brandId, productId: p.id, optionId })));
  await recordAudit(tx, actor, { action: "product.composition", scope, targetType: "product", targetId: p.id, metadata: { groups: groupIds.length, defaults: input.defaultOptionIds.length } });
}

export const recipeInput = z.object({
  variantId: z.uuid(),
  items: z.array(z.object({ ingredientId: z.uuid(), quantity: z.coerce.number().positive() })),
});

export async function setVariantRecipe(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(recipeInput, raw);
  const [v] = await tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, input.variantId));
  if (!v) throw notFound("Variant");
  const scope = await brandGuard(tx, actor, v.brandId);
  await tx.delete(schema.variantRecipes).where(eq(schema.variantRecipes.variantId, v.id));
  if (input.items.length) await tx.insert(schema.variantRecipes).values(input.items.map((i) => ({ brandId: v.brandId, variantId: v.id, ingredientId: i.ingredientId, quantity: String(i.quantity) })));
  await recordAudit(tx, actor, { action: "variant.recipe", scope, targetType: "product_variant", targetId: v.id, metadata: { items: input.items.length } });
}

export async function setProductImage(tx: Executor, actor: Actor, productId: string, imageKey: string | null) {
  const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, productId));
  if (!p) throw notFound("Product");
  const scope = await brandGuard(tx, actor, p.brandId);
  if (imageKey && !imageKey.startsWith(`brands/${p.brandId}/products/${p.id}/`)) throw new AppError("FORBIDDEN", "Image key does not belong to this product.");
  await tx.update(schema.products).set({ imageKey }).where(eq(schema.products.id, p.id));
  await recordAudit(tx, actor, { action: "product.image", scope, targetType: "product", targetId: p.id, metadata: { imageKey } });
}

/* ── Branch menu management ─────────────────────────────────────── */

async function branchGuard(tx: Executor, actor: Actor, branchId: string) {
  const scope = await loadScope(tx, { level: "branch", id: branchId });
  authorize(actor, "branch.menu.manage", scope);
  if (scope.level !== "branch") throw notFound("Branch");
  return scope;
}

export const branchAvailabilityInput = z.object({ branchId: z.uuid(), productId: z.uuid(), isAvailable: z.boolean() });

export async function setBranchProductAvailability(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(branchAvailabilityInput, raw);
  const scope = await branchGuard(tx, actor, input.branchId);
  await tx.insert(schema.branchProducts).values({ ...input, brandId: scope.brandId })
    .onConflictDoUpdate({ target: [schema.branchProducts.branchId, schema.branchProducts.productId], set: { isAvailable: input.isAvailable } });
  await recordAudit(tx, actor, { action: "branch.product.availability", scope, targetType: "product", targetId: input.productId, metadata: { isAvailable: input.isAvailable } });
}

export const branchPriceInput = z.object({ branchId: z.uuid(), variantId: z.uuid(), priceMinor: minor.nullable() });

/** Set (or clear, with null) a branch price for a variant, within the brand's bounds. */
export async function setBranchVariantPrice(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(branchPriceInput, raw);
  const scope = await branchGuard(tx, actor, input.branchId);
  const [v] = await tx.select().from(schema.productVariants).where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.brandId, scope.brandId)));
  if (!v) throw notFound("Variant");
  if (input.priceMinor === null) {
    await tx.delete(schema.branchVariantPrices).where(and(eq(schema.branchVariantPrices.branchId, input.branchId), eq(schema.branchVariantPrices.variantId, v.id)));
  } else {
    assertPayable(await brandCurrency(tx, scope.brandId), input.priceMinor);
    if ((v.minPriceMinor !== null && input.priceMinor < v.minPriceMinor) || (v.maxPriceMinor !== null && input.priceMinor > v.maxPriceMinor)) {
      throw new AppError("VALIDATION_FAILED", "That price is outside the range the brand allows for this item.");
    }
    if (input.priceMinor <= 0n) throw new AppError("VALIDATION_FAILED", "Price must be above zero.");
    await tx.insert(schema.branchVariantPrices).values({ brandId: scope.brandId, branchId: input.branchId, variantId: v.id, priceMinor: input.priceMinor })
      .onConflictDoUpdate({ target: [schema.branchVariantPrices.branchId, schema.branchVariantPrices.variantId], set: { priceMinor: input.priceMinor } });
  }
  await recordAudit(tx, actor, { action: "branch.variant.price", scope, targetType: "product_variant", targetId: v.id, metadata: { priceMinor: input.priceMinor === null ? null : String(input.priceMinor) } });
}

export const branchOptionInput = z.object({ branchId: z.uuid(), optionId: z.uuid(), isAvailable: z.boolean(), priceMinor: minor.nullish() });

export async function setBranchOptionOverride(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(branchOptionInput, raw);
  const scope = await branchGuard(tx, actor, input.branchId);
  if (input.priceMinor != null) assertPayable(await brandCurrency(tx, scope.brandId), input.priceMinor);
  await tx.insert(schema.branchOptionOverrides).values({ brandId: scope.brandId, branchId: input.branchId, optionId: input.optionId, isAvailable: input.isAvailable, priceMinor: input.priceMinor ?? null })
    .onConflictDoUpdate({ target: [schema.branchOptionOverrides.branchId, schema.branchOptionOverrides.optionId], set: { isAvailable: input.isAvailable, priceMinor: input.priceMinor ?? null } });
  await recordAudit(tx, actor, { action: "branch.option.override", scope, targetType: "option", targetId: input.optionId, metadata: { isAvailable: input.isAvailable } });
}
