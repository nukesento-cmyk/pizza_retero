import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import type { MenuGroup, MenuOption, MenuProduct, MenuSnapshot } from "./types";

const {
  branches, brandSettings, products, productVariants, optionGroups, options, optionSizes, productOptionGroups,
  productDefaultOptions, variantRecipes, ingredients, ingredientAllergens, branchProducts, branchVariantPrices, branchOptionOverrides,
} = schema;

/**
 * Build the menu for one branch: active products and options, with branch
 * availability and price overrides applied. Reads only public catalogue rows,
 * so it works for anonymous visitors and inside checkout alike.
 */
export async function getBranchMenu(tx: Executor, branchId: string): Promise<MenuSnapshot> {
  const [branch] = await tx.select({ id: branches.id, brandId: branches.brandId, status: branches.status }).from(branches).where(eq(branches.id, branchId));
  if (!branch) throw notFound("Branch");
  const brandId = branch.brandId;
  const [settings] = await tx.select({ currency: brandSettings.currency }).from(brandSettings).where(eq(brandSettings.brandId, brandId));

  const [prods, vars, groups, opts, sizes, pogs, defs, recipes, ings, ingAll, bProds, bPrices, bOpts] = await Promise.all([
    tx.select().from(products).where(and(eq(products.brandId, brandId), eq(products.status, "active"))),
    tx.select().from(productVariants).where(and(eq(productVariants.brandId, brandId), eq(productVariants.status, "active"))),
    tx.select().from(optionGroups).where(eq(optionGroups.brandId, brandId)),
    tx.select().from(options).where(and(eq(options.brandId, brandId), eq(options.status, "active"))),
    tx.select().from(optionSizes).where(eq(optionSizes.brandId, brandId)),
    tx.select().from(productOptionGroups).where(eq(productOptionGroups.brandId, brandId)),
    tx.select().from(productDefaultOptions).where(eq(productDefaultOptions.brandId, brandId)),
    tx.select().from(variantRecipes).where(eq(variantRecipes.brandId, brandId)),
    tx.select().from(ingredients).where(eq(ingredients.brandId, brandId)),
    tx.select().from(ingredientAllergens).where(eq(ingredientAllergens.brandId, brandId)),
    tx.select().from(branchProducts).where(eq(branchProducts.branchId, branchId)),
    tx.select().from(branchVariantPrices).where(eq(branchVariantPrices.branchId, branchId)),
    tx.select().from(branchOptionOverrides).where(eq(branchOptionOverrides.branchId, branchId)),
  ]);

  const ingById = new Map(ings.map((i) => [i.id, i]));
  const allergensOf = (ingredientId: string | null) => (ingredientId ? ingAll.filter((a) => a.ingredientId === ingredientId).map((a) => a.allergenCode) : []);
  const optOverride = new Map(bOpts.map((o) => [o.optionId, o]));

  const optionMap: Record<string, MenuOption> = {};
  for (const o of opts) {
    const ov = optOverride.get(o.id);
    const ing = o.ingredientId ? ingById.get(o.ingredientId) : undefined;
    const sizePrices: Record<string, bigint> = {};
    for (const s of sizes.filter((x) => x.optionId === o.id && x.priceMinor !== null)) sizePrices[s.sizeCode] = s.priceMinor!;
    // A branch override replaces the price for every size.
    if (ov?.priceMinor !== null && ov?.priceMinor !== undefined) for (const k of Object.keys(sizePrices)) sizePrices[k] = ov.priceMinor;
    optionMap[o.id] = {
      id: o.id, code: o.code, name: o.name, groupId: o.groupId,
      priceMinor: ov?.priceMinor ?? o.priceMinor, sizePrices,
      available: ov ? ov.isAvailable : true,
      visualKey: o.visualKey, color: o.color, ingredientId: o.ingredientId,
      allergens: allergensOf(o.ingredientId),
      vegetarian: ing ? ing.isVegetarian : true, vegan: ing ? ing.isVegan : true,
    };
  }

  const groupMap: Record<string, MenuGroup> = {};
  for (const g of groups.sort((a, b) => a.sort - b.sort)) {
    groupMap[g.id] = {
      id: g.id, code: g.code, name: g.name, kind: g.kind, minSelect: g.minSelect, maxSelect: g.maxSelect,
      options: Object.values(optionMap).filter((o) => o.groupId === g.id).sort((a, b) => (opts.find((x) => x.id === a.id)!.sort - opts.find((x) => x.id === b.id)!.sort)),
    };
  }

  const priceOverride = new Map(bPrices.map((p) => [p.variantId, p.priceMinor]));
  const availability = new Map(bProds.map((p) => [p.productId, p.isAvailable]));

  const menuProducts: MenuProduct[] = prods.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((p) => {
    const pv = vars.filter((v) => v.productId === p.id).sort((a, b) => a.sort - b.sort);
    const recipeIngs = recipes.filter((r) => pv.some((v) => v.id === r.variantId)).map((r) => r.ingredientId);
    const baseIngs = [...new Set(recipeIngs)].map((id) => ingById.get(id)).filter(Boolean);
    return {
      id: p.id, slug: p.slug, name: p.name, description: p.description, kind: p.kind,
      builderEnabled: p.builderEnabled, imageKey: p.imageKey,
      available: branch.status === "active" && (availability.get(p.id) ?? true) && pv.length > 0,
      variants: pv.map((v) => ({ id: v.id, code: v.code, name: v.name, sizeCode: v.sizeCode, priceMinor: priceOverride.get(v.id) ?? v.priceMinor, isDefault: v.isDefault })),
      groups: pogs.filter((g) => g.productId === p.id && groupMap[g.groupId]).sort((a, b) => a.sort - b.sort).map((g) => ({
        groupId: g.groupId,
        minSelect: g.minSelect ?? groupMap[g.groupId]!.minSelect,
        maxSelect: g.maxSelect ?? groupMap[g.groupId]!.maxSelect,
      })),
      defaultOptionIds: defs.filter((d) => d.productId === p.id && optionMap[d.optionId]).map((d) => d.optionId),
      allergens: [...new Set(baseIngs.flatMap((i) => allergensOf(i!.id)))].sort(),
      vegetarian: baseIngs.every((i) => i!.isVegetarian),
      vegan: baseIngs.every((i) => i!.isVegan),
    };
  });

  return { brandId, branchId, currency: settings?.currency ?? "KES", products: menuProducts, groups: groupMap, options: optionMap };
}

/** JSON-safe menu for the browser (bigint → number; prices are far below 2^53). */
export function serializeMenu(m: MenuSnapshot) {
  return JSON.parse(JSON.stringify(m, (_k, v) => (typeof v === "bigint" ? Number(v) : v))) as SerializedMenu;
}

type Ser<T> = T extends bigint ? number : T extends (infer U)[] ? Ser<U>[] : T extends object ? { [K in keyof T]: Ser<T[K]> } : T;
export type SerializedMenu = Ser<MenuSnapshot>;

export { inArray };
