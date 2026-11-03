import type { MenuOption, MenuProduct, MenuSnapshot } from "../catalogue/types";

/**
 * The pricing engine. Pure and deterministic: given the branch menu and what
 * the customer picked, it returns the exact price or a typed reason the line
 * can't be sold. Every price the customer sees or pays comes from here;
 * client-submitted totals are never used.
 *
 * Rules
 * - Base price = the variant's effective branch price.
 * - Default options are included in the base price. Removing one never refunds.
 * - Any other selected option is charged: branch override, else size price, else base price.
 * - `optionIds` omitted → the product's defaults. Provided → exactly those
 *   options, except a group with a minimum that was left empty falls back to
 *   its defaults (so "Margherita, large" works without restating the sauce).
 */

export interface LineSelection {
  productId: string;
  variantId: string;
  optionIds?: readonly string[] | null;
  quantity: number;
}

export type LineError =
  | "PRODUCT_UNAVAILABLE" | "VARIANT_INVALID" | "OPTION_UNAVAILABLE" | "OPTION_NOT_ALLOWED"
  | "GROUP_MIN" | "GROUP_MAX" | "QUANTITY";

export interface PricedOption { id: string; code: string; name: string; groupCode: string; included: boolean; priceMinor: bigint; visualKey: string | null }

export interface PricedLine {
  productId: string;
  productName: string;
  productKind: MenuProduct["kind"];
  variantId: string;
  variantName: string;
  sizeCode: string | null;
  options: PricedOption[];
  /** Defaults the customer removed (shown on tickets as "no X"). */
  removed: { id: string; name: string }[];
  basePriceMinor: bigint;
  unitPriceMinor: bigint;
  quantity: number;
  lineTotalMinor: bigint;
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
}

export type LineResult = { ok: true; line: PricedLine } | { ok: false; error: LineError; message: string };

export const MAX_QUANTITY = 20;

const fail = (error: LineError, message: string): LineResult => ({ ok: false, error, message });

export function optionPrice(o: MenuOption, sizeCode: string | null): bigint {
  if (sizeCode && o.sizePrices[sizeCode] !== undefined) return o.sizePrices[sizeCode]!;
  return o.priceMinor;
}

export function priceLine(menu: MenuSnapshot, sel: LineSelection): LineResult {
  if (!Number.isInteger(sel.quantity) || sel.quantity < 1 || sel.quantity > MAX_QUANTITY) {
    return fail("QUANTITY", `Quantity must be between 1 and ${MAX_QUANTITY}.`);
  }
  const product = menu.products.find((p) => p.id === sel.productId);
  if (!product || !product.available) return fail("PRODUCT_UNAVAILABLE", "That item isn't available at this branch right now.");
  const variant = product.variants.find((v) => v.id === sel.variantId);
  if (!variant) return fail("VARIANT_INVALID", "Choose a size for this item.");

  const allowed = new Map(product.groups.map((g) => [g.groupId, g]));
  const defaults = new Set(product.defaultOptionIds);
  const requested = sel.optionIds === undefined || sel.optionIds === null ? [...defaults] : [...new Set(sel.optionIds)];

  // Validate requested options exist, are allowed for this product and available.
  const chosen: MenuOption[] = [];
  for (const id of requested) {
    const o = menu.options[id];
    if (!o || !allowed.has(o.groupId)) return fail("OPTION_NOT_ALLOWED", "One of the choices doesn't apply to this item.");
    if (!o.available) return fail("OPTION_UNAVAILABLE", `${o.name} is sold out at this branch.`);
    chosen.push(o);
  }

  // Enforce per-group bounds; empty required groups fall back to defaults.
  for (const [groupId, bounds] of allowed) {
    const group = menu.groups[groupId];
    if (!group) continue;
    let inGroup = chosen.filter((o) => o.groupId === groupId);
    if (inGroup.length === 0 && bounds.minSelect > 0) {
      const fallback = [...defaults].map((id) => menu.options[id]).filter((o): o is MenuOption => !!o && o.groupId === groupId);
      for (const o of fallback) {
        if (!o.available) return fail("OPTION_UNAVAILABLE", `${o.name} is sold out at this branch.`);
        chosen.push(o);
      }
      inGroup = fallback;
    }
    if (inGroup.length < bounds.minSelect) return fail("GROUP_MIN", `Choose at least ${bounds.minSelect} ${group.name.toLowerCase()}.`);
    if (inGroup.length > bounds.maxSelect) return fail("GROUP_MAX", `Choose at most ${bounds.maxSelect} ${group.name.toLowerCase()}.`);
  }

  const priced: PricedOption[] = chosen
    .map((o) => {
      const included = defaults.has(o.id);
      return {
        id: o.id, code: o.code, name: o.name, groupCode: menu.groups[o.groupId]!.code, included,
        priceMinor: included ? 0n : optionPrice(o, variant.sizeCode), visualKey: o.visualKey,
      };
    })
    .sort((a, b) => (menu.groups[menu.options[a.id]!.groupId]!.code < menu.groups[menu.options[b.id]!.groupId]!.code ? -1 : 1));

  const chosenIds = new Set(chosen.map((o) => o.id));
  const removed = [...defaults].filter((id) => !chosenIds.has(id)).map((id) => ({ id, name: menu.options[id]?.name ?? "item" }));

  const unit = priced.reduce((sum, o) => sum + o.priceMinor, variant.priceMinor);
  const allergens = new Set(product.allergens);
  for (const o of chosen) o.allergens.forEach((a) => allergens.add(a));

  return {
    ok: true,
    line: {
      productId: product.id, productName: product.name, productKind: product.kind,
      variantId: variant.id, variantName: variant.name, sizeCode: variant.sizeCode,
      options: priced, removed,
      basePriceMinor: variant.priceMinor, unitPriceMinor: unit, quantity: sel.quantity,
      lineTotalMinor: unit * BigInt(sel.quantity),
      allergens: [...allergens].sort(),
      vegetarian: product.vegetarian && chosen.every((o) => o.vegetarian),
      vegan: product.vegan && chosen.every((o) => o.vegan),
    },
  };
}

/** Tax-inclusive VAT extraction, in basis points (1600 = 16%). Half-up to the minor unit. */
export function vatIncluded(totalMinor: bigint, rateBps: number): bigint {
  const r = BigInt(rateBps);
  const num = totalMinor * r;
  const den = 10_000n + r;
  return (num * 2n + den) / (den * 2n);
}
