/**
 * Pizza builder state for the kitchen prototype.
 *
 * ⚠ PREVIEW OPTIONS. These are the visual options of the builder, not the menu.
 * Phase 3 replaces them with the branch's live catalogue (option groups,
 * availability, allergens) and the server pricing engine. No prices here.
 */
export const SIZES = [
  { id: "personal", label: "Personal", detail: '9"', radius: 0.26 },
  { id: "classic", label: "Classic", detail: '12"', radius: 0.34 },
  { id: "party", label: "Party", detail: '16"', radius: 0.44 },
] as const;

export const CRUSTS = [
  { id: "classic", label: "Hand-stretched", rim: 0.045 },
  { id: "thin", label: "Thin & crisp", rim: 0.026 },
  { id: "stuffed", label: "Cheese-stuffed", rim: 0.068 },
] as const;

export const SAUCES = [
  { id: "tomato", label: "San Marzano", color: "#b3261b" },
  { id: "white", label: "Garlic cream", color: "#efe4cf" },
  { id: "pesto", label: "Basil pesto", color: "#4f7a2a" },
  { id: "bbq", label: "Smoky BBQ", color: "#5a2212" },
] as const;

export const CHEESES = [
  { id: "mozzarella", label: "Mozzarella", color: "#f6deA0", coverage: 0.9 },
  { id: "extra", label: "Extra mozzarella", color: "#f9e3a6", coverage: 1 },
  { id: "vegan", label: "Plant-based", color: "#f2e7c4", coverage: 0.85 },
  { id: "none", label: "No cheese", color: "#000000", coverage: 0 },
] as const;

export const TOPPINGS = [
  { id: "pepperoni", label: "Pepperoni", color: "#a8321f", allergens: [] as string[], diet: [] as string[] },
  { id: "mushroom", label: "Mushroom", color: "#d9c3a0", allergens: [], diet: ["veg", "vegan"] },
  { id: "olive", label: "Black olive", color: "#1d1712", allergens: [], diet: ["veg", "vegan"] },
  { id: "basil", label: "Fresh basil", color: "#2e6b52", allergens: [], diet: ["veg", "vegan"] },
  { id: "pepper", label: "Green pepper", color: "#3f8a3a", allergens: [], diet: ["veg", "vegan"] },
  { id: "onion", label: "Red onion", color: "#8e3b6e", allergens: [], diet: ["veg", "vegan"] },
] as const;

export type SizeId = (typeof SIZES)[number]["id"];
export type CrustId = (typeof CRUSTS)[number]["id"];
export type SauceId = (typeof SAUCES)[number]["id"];
export type CheeseId = (typeof CHEESES)[number]["id"];
export type ToppingId = (typeof TOPPINGS)[number]["id"];

export interface BuilderState {
  size: SizeId;
  crust: CrustId;
  sauce: SauceId;
  cheese: CheeseId;
  toppings: readonly ToppingId[];
}

export const DEFAULT_BUILD: BuilderState = {
  size: "classic", crust: "classic", sauce: "tomato", cheese: "mozzarella", toppings: ["basil"],
};

export const MAX_TOPPINGS = 5;

export function toggleTopping(state: BuilderState, id: ToppingId): BuilderState {
  const has = state.toppings.includes(id);
  if (!has && state.toppings.length >= MAX_TOPPINGS) return state;
  return { ...state, toppings: has ? state.toppings.filter((t) => t !== id) : [...state.toppings, id] };
}

const find = <T extends { id: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)!;

/** Human summary, used on the reveal ticket and the WhatsApp prefill. */
export function describeBuild(b: BuilderState): string {
  const size = find(SIZES, b.size);
  const parts = [
    `${size.label} (${size.detail}) ${find(CRUSTS, b.crust).label.toLowerCase()}`,
    `${find(SAUCES, b.sauce).label} sauce`,
    find(CHEESES, b.cheese).label,
    ...b.toppings.map((t) => find(TOPPINGS, t).label),
  ];
  return parts.join(", ");
}

export function isVegetarian(b: BuilderState): boolean {
  return b.toppings.every((t) => (find(TOPPINGS, t).diet as readonly string[]).includes("veg"));
}
export function isVegan(b: BuilderState): boolean {
  return (b.cheese === "vegan" || b.cheese === "none") && b.sauce !== "white" &&
    b.toppings.every((t) => (find(TOPPINGS, t).diet as readonly string[]).includes("vegan"));
}
