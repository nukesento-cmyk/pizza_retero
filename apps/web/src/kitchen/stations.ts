/**
 * The eight stations of the kitchen walk-through, in scroll order.
 * Phase 6 attaches a camera pose and GLB node to each id; the 2D fallback and
 * the storefront index use the same list, so order and copy never drift.
 * This is presentation content. It never carries prices or availability.
 */
export const STATIONS = [
  { id: "entrance", n: 1, title: "The Door", line: "Bell rings, oven's lit, floor still shining from the mop." },
  { id: "dough", n: 2, title: "Dough Bench", line: "48-hour dough, stretched by hand, never by pin when we can help it." },
  { id: "sauce", n: 3, title: "Sauce Pot", line: "Tomatoes, salt, a little basil. One ladle, one spiral." },
  { id: "ingredients", n: 4, title: "The Line", line: "Every topping in its tin, every allergen on its label." },
  { id: "assembly", n: 5, title: "Build Your Pie", line: "Your base, your crust, your rules. The price updates as you build." },
  { id: "oven", n: 6, title: "The Oven", line: "Ninety seconds at 450°. Watch it blister." },
  { id: "reveal", n: 7, title: "Out of the Fire", line: "Onto the peel, under the lights, into the box." },
  { id: "story", n: 8, title: "Our Story", line: "How a back-street parlour learned to be in two places at once." },
] as const;

export type StationId = (typeof STATIONS)[number]["id"];
