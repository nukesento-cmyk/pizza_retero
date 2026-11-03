import { describe, expect, it } from "vitest";
import { priceLine, vatIncluded } from "../../src/pricing";
import type { MenuSnapshot } from "../../src/catalogue/types";

const opt = (id: string, groupId: string, price: number, extra: Partial<MenuSnapshot["options"][string]> = {}) => ({
  id, code: id, name: id, groupId, priceMinor: BigInt(price), sizePrices: {}, available: true, visualKey: null, color: null,
  ingredientId: null, allergens: [], vegetarian: true, vegan: true, ...extra,
});

function menu(): MenuSnapshot {
  const options = {
    classic: opt("classic", "crust", 0), stuffed: opt("stuffed", "crust", 20000, { allergens: ["milk"], vegan: false }),
    tomato: opt("tomato", "sauce", 0), pesto: opt("pesto", "sauce", 10000, { allergens: ["milk", "nuts"], vegan: false }),
    pepperoni: opt("pepperoni", "top", 15000, { sizePrices: { party: 22000n }, vegetarian: false, vegan: false }),
    basil: opt("basil", "top", 5000),
    mushroom: opt("mushroom", "top", 10000, { available: false }),
  };
  const groups = {
    crust: { id: "crust", code: "crust", name: "Crust", kind: "crust" as const, minSelect: 1, maxSelect: 1, options: [] },
    sauce: { id: "sauce", code: "sauce", name: "Sauce", kind: "sauce" as const, minSelect: 1, maxSelect: 1, options: [] },
    top: { id: "top", code: "top", name: "Toppings", kind: "topping" as const, minSelect: 0, maxSelect: 2, options: [] },
  };
  return {
    brandId: "b", branchId: "br", currency: "KES", options, groups,
    products: [{
      id: "marg", slug: "marg", name: "Margherita", description: null, kind: "pizza", builderEnabled: false, imageKey: null, available: true,
      variants: [{ id: "v-classic", code: "classic", name: "Classic", sizeCode: "classic", priceMinor: 95000n, isDefault: true },
                 { id: "v-party", code: "party", name: "Party", sizeCode: "party", priceMinor: 145000n, isDefault: false }],
      groups: [{ groupId: "crust", minSelect: 1, maxSelect: 1 }, { groupId: "sauce", minSelect: 1, maxSelect: 1 }, { groupId: "top", minSelect: 0, maxSelect: 2 }],
      defaultOptionIds: ["classic", "tomato", "basil"], allergens: ["gluten"], vegetarian: true, vegan: true,
    }, {
      id: "gone", slug: "gone", name: "Gone", description: null, kind: "pizza", builderEnabled: false, imageKey: null, available: false,
      variants: [{ id: "vg", code: "x", name: "x", sizeCode: null, priceMinor: 100n, isDefault: true }], groups: [], defaultOptionIds: [], allergens: [], vegetarian: true, vegan: true,
    }],
  };
}

const ok = (r: ReturnType<typeof priceLine>) => { if (!r.ok) throw new Error(r.message); return r.line; };

describe("pricing engine", () => {
  it("defaults are included in the base price", () => {
    const l = ok(priceLine(menu(), { productId: "marg", variantId: "v-classic", quantity: 1 }));
    expect(l.unitPriceMinor).toBe(95000n);
    expect(l.options.map((o) => [o.id, o.included, o.priceMinor])).toEqual(expect.arrayContaining([["basil", true, 0n], ["tomato", true, 0n]]));
  });

  it("charges extras, swaps, and size-specific prices; never refunds removed defaults", () => {
    const l = ok(priceLine(menu(), { productId: "marg", variantId: "v-party", optionIds: ["stuffed", "pesto", "pepperoni"], quantity: 2 }));
    // 145000 + stuffed 20000 + pesto 10000 + pepperoni (party) 22000
    expect(l.unitPriceMinor).toBe(197000n);
    expect(l.lineTotalMinor).toBe(394000n);
    expect(l.removed.map((r) => r.id).sort()).toEqual(["basil", "classic", "tomato"]);
    expect(l.allergens).toEqual(["gluten", "milk", "nuts"]);
    expect(l.vegetarian).toBe(false);
  });

  it("required groups left empty fall back to defaults; optional groups can be emptied", () => {
    const l = ok(priceLine(menu(), { productId: "marg", variantId: "v-classic", optionIds: [], quantity: 1 }));
    expect(l.options.map((o) => o.id).sort()).toEqual(["classic", "tomato"]);
    expect(l.unitPriceMinor).toBe(95000n);
  });

  it("rejects what can't be sold", () => {
    const m = menu();
    const err = (sel: Parameters<typeof priceLine>[1]) => { const r = priceLine(m, sel); return r.ok ? "OK" : r.error; };
    expect(err({ productId: "gone", variantId: "vg", quantity: 1 })).toBe("PRODUCT_UNAVAILABLE");
    expect(err({ productId: "nope", variantId: "vg", quantity: 1 })).toBe("PRODUCT_UNAVAILABLE");
    expect(err({ productId: "marg", variantId: "vg", quantity: 1 })).toBe("VARIANT_INVALID");
    expect(err({ productId: "marg", variantId: "v-classic", optionIds: ["mushroom"], quantity: 1 })).toBe("OPTION_UNAVAILABLE");
    expect(err({ productId: "marg", variantId: "v-classic", optionIds: ["ghost"], quantity: 1 })).toBe("OPTION_NOT_ALLOWED");
    expect(err({ productId: "marg", variantId: "v-classic", optionIds: ["classic", "stuffed"], quantity: 1 })).toBe("GROUP_MAX");
    expect(err({ productId: "marg", variantId: "v-classic", optionIds: ["pepperoni", "basil", "basil"], quantity: 1 })).toBe("OK"); // dedupe
    expect(err({ productId: "marg", variantId: "v-classic", quantity: 0 })).toBe("QUANTITY");
    expect(err({ productId: "marg", variantId: "v-classic", quantity: 1.5 })).toBe("QUANTITY");
    expect(err({ productId: "marg", variantId: "v-classic", quantity: 21 })).toBe("QUANTITY");
  });

  it("never trusts anything but the menu: a forged price field is ignored", () => {
    const sel = { productId: "marg", variantId: "v-classic", quantity: 1, priceMinor: 1n } as unknown as Parameters<typeof priceLine>[1];
    expect(ok(priceLine(menu(), sel)).unitPriceMinor).toBe(95000n);
  });

  it("extracts inclusive VAT exactly", () => {
    expect(vatIncluded(116000n, 1600)).toBe(16000n);
    expect(vatIncluded(95000n, 1600)).toBe(13103n); // 95000*16/116 = 13103.4
    expect(vatIncluded(0n, 1600)).toBe(0n);
  });
});
