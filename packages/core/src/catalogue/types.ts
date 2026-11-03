/** Branch menu read model: what one branch sells right now, at its prices. */
export interface MenuOption {
  id: string;
  code: string;
  name: string;
  groupId: string;
  /** Effective price at this branch when no size-specific price applies. */
  priceMinor: bigint;
  /** Size-specific effective prices (size code → price). */
  sizePrices: Record<string, bigint>;
  available: boolean;
  visualKey: string | null;
  color: string | null;
  ingredientId: string | null;
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
}

export interface MenuGroup {
  id: string;
  code: string;
  name: string;
  kind: "crust" | "sauce" | "cheese" | "topping" | "extra";
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
}

export interface MenuVariant {
  id: string;
  code: string;
  name: string;
  sizeCode: string | null;
  priceMinor: bigint;
  isDefault: boolean;
}

export interface MenuProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "pizza" | "side" | "drink" | "dessert";
  builderEnabled: boolean;
  imageKey: string | null;
  available: boolean;
  variants: MenuVariant[];
  /** Groups this product allows, with effective selection bounds. */
  groups: { groupId: string; minSelect: number; maxSelect: number }[];
  defaultOptionIds: string[];
  /** Allergens of the base recipe (variant-independent union). */
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
}

export interface MenuSnapshot {
  brandId: string;
  branchId: string;
  currency: string;
  products: MenuProduct[];
  groups: Record<string, MenuGroup>;
  options: Record<string, MenuOption>;
}
