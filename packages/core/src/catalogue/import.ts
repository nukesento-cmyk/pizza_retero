import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Executor } from "@retero/db";
import type { Actor } from "../rbac/types";
import { setProductComposition, setProductStatus, setVariantRecipe, upsertIngredient, upsertOption, upsertOptionGroup, upsertProduct, upsertVariant } from "./admin";

const kes = (n: number) => BigInt(Math.round(n * 100));

const templateSchema = z.object({
  ingredients: z.array(z.object({ code: z.string(), name: z.string(), unit: z.enum(["g", "ml", "each"]), isVegetarian: z.boolean(), isVegan: z.boolean(), allergens: z.array(z.string()) })),
  groups: z.array(z.object({
    code: z.string(), name: z.string(), kind: z.enum(["crust", "sauce", "cheese", "topping", "extra"]), minSelect: z.number(), maxSelect: z.number(), sort: z.number(),
    options: z.array(z.object({ code: z.string(), name: z.string(), priceKes: z.number(), ingredient: z.string().optional(), visualKey: z.string().optional(), color: z.string().optional(), sizes: z.record(z.string(), z.number()).optional() })),
  })),
  pizzaSizes: z.array(z.object({ code: z.string(), name: z.string(), sizeCode: z.string(), doughG: z.number(), isDefault: z.boolean().optional() })),
  products: z.array(z.object({
    slug: z.string(), name: z.string(), kind: z.enum(["pizza", "side", "drink", "dessert"]), description: z.string(), sort: z.number(),
    builderEnabled: z.boolean().optional(), prices: z.record(z.string(), z.number()).optional(), defaults: z.array(z.string()).optional(),
    fixed: z.object({ code: z.string(), name: z.string(), priceKes: z.number() }).optional(), recipe: z.record(z.string(), z.number()).optional(),
  })),
});

/**
 * Import a catalogue template into a brand through the normal admin
 * functions, so it is validated, authorized and audited like manual edits.
 * Idempotent: re-running updates by code/slug.
 */
export async function importCatalogue(tx: Executor, actor: Actor, brandId: string, template: unknown, opts: { publish?: boolean } = {}) {
  const t = templateSchema.parse(template);
  const ing = new Map<string, string>();
  for (const i of t.ingredients) ing.set(i.code, (await upsertIngredient(tx, actor, { brandId, ...i })).id);

  const groupIds = new Map<string, string>();
  const optionIds = new Map<string, string>();
  for (const g of t.groups) {
    const grp = await upsertOptionGroup(tx, actor, { brandId, code: g.code, name: g.name, kind: g.kind, minSelect: g.minSelect, maxSelect: g.maxSelect, sort: g.sort });
    groupIds.set(g.code, grp.id);
    let sort = 0;
    for (const o of g.options) {
      const opt = await upsertOption(tx, actor, {
        brandId, groupId: grp.id, code: o.code, name: o.name, priceMinor: kes(o.priceKes), sort: sort++,
        ingredientId: o.ingredient ? ing.get(o.ingredient) : null, visualKey: o.visualKey ?? null, color: o.color ?? null,
        sizes: Object.entries(o.sizes ?? {}).map(([sizeCode, p]) => ({ sizeCode, priceMinor: kes(p) })),
      });
      optionIds.set(`${g.code}/${o.code}`, opt.id);
    }
  }

  for (const p of t.products) {
    const prod = await upsertProduct(tx, actor, { brandId, slug: p.slug, name: p.name, kind: p.kind, description: p.description, sort: p.sort, builderEnabled: p.builderEnabled ?? false, status: "draft" });
    if (p.prices) {
      let sort = 0;
      for (const size of t.pizzaSizes) {
        const kesPrice = p.prices[size.code];
        if (kesPrice === undefined) continue;
        const v = await upsertVariant(tx, actor, {
          productId: prod.id, code: size.code, name: size.name, sizeCode: size.sizeCode, priceMinor: kes(kesPrice),
          minPriceMinor: kes(Math.floor(kesPrice * 0.85 / 10) * 10), maxPriceMinor: kes(Math.ceil(kesPrice * 1.15 / 10) * 10),
          isDefault: size.isDefault ?? false, sort: sort++,
        });
        await setVariantRecipe(tx, actor, { variantId: v.id, items: [{ ingredientId: ing.get("dough")!, quantity: size.doughG }] });
      }
      await setProductComposition(tx, actor, {
        productId: prod.id,
        groups: t.groups.map((g) => ({ groupId: groupIds.get(g.code)!, sort: g.sort })),
        defaultOptionIds: (p.defaults ?? []).map((d) => optionIds.get(d)!).filter(Boolean),
      });
    } else if (p.fixed) {
      const v = await upsertVariant(tx, actor, { productId: prod.id, code: p.fixed.code, name: p.fixed.name, priceMinor: kes(p.fixed.priceKes), isDefault: true });
      if (p.recipe) await setVariantRecipe(tx, actor, { variantId: v.id, items: Object.entries(p.recipe).map(([code, quantity]) => ({ ingredientId: ing.get(code)!, quantity })) });
    }
    if (opts.publish) await setProductStatus(tx, actor, { productId: prod.id, status: "active" });
  }
  return { ingredients: ing.size, groups: groupIds.size, options: optionIds.size, products: t.products.length };
}

export async function readTemplate(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
