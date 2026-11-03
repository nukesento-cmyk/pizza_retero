/**
 * The eight stations of the kitchen walk-through, in scroll order.
 *
 * `camera` / `target`: where the camera stands and looks when dwelling here.
 * `pizza`: where the pizza being built sits at this station (it travels with you).
 * `label`: world position of the floating station label.
 * `panel`: world anchor for the station's contextual panel (desktop).
 *
 * Presentation only — never carries prices or availability.
 */
export type Vec3 = readonly [number, number, number];

export interface Station {
  id: "entrance" | "dough" | "sauce" | "ingredients" | "assembly" | "oven" | "reveal" | "story";
  n: number;
  title: string;
  line: string;
  hint: string;
  camera: Vec3;
  target: Vec3;
  pizza: Vec3;
  label: Vec3;
  panel: Vec3;
}

export const STATIONS: readonly Station[] = [
  {
    id: "entrance", n: 1, title: "The Door",
    line: "Bell rings, oven's lit, floor still shining from the mop.",
    hint: "Scroll to walk in, or click a station tag.",
    camera: [0, 2.15, 14.2], target: [0, 2.55, 0], pizza: [-4.7, 0.98, 2.2],
    label: [0, 3.9, 7.2], panel: [-2.8, 2.2, 6.5],
  },
  {
    id: "dough", n: 2, title: "Dough Bench",
    line: "48-hour dough, stretched by hand. Pick a dough ball. That's your size.",
    hint: "Click a dough ball on the bench.",
    camera: [-2.1, 2.05, 4.1], target: [-4.9, 1.0, 1.8], pizza: [-4.7, 0.98, 1.2],
    label: [-4.9, 1.9, 2.4], panel: [-4.6, 1.6, 0.0],
  },
  {
    id: "sauce", n: 3, title: "Sauce Pots",
    line: "One ladle, one spiral. Choose what goes down first.",
    hint: "Click a pot to ladle its sauce.",
    camera: [-2.0, 2.05, 1.0], target: [-4.9, 1.0, -1.3], pizza: [-4.6, 0.98, -0.3],
    label: [-4.9, 1.95, -1.6], panel: [-4.6, 1.6, -2.8],
  },
  {
    id: "ingredients", n: 4, title: "The Line",
    line: "Every topping in its tin, every allergen on its label.",
    hint: "Click tins to add or remove toppings.",
    camera: [2.0, 2.1, 3.4], target: [4.9, 1.0, 1.0], pizza: [4.4, 0.98, 2.6],
    label: [4.9, 1.95, 0.6], panel: [4.6, 1.7, -0.6],
  },
  {
    id: "assembly", n: 5, title: "Build Your Pie",
    line: "Here's everything you picked, on the bench under the lamp.",
    hint: "Move your pointer to look around. Check it over before it bakes.",
    camera: [1.6, 2.5, 2.6], target: [0, 1.0, 0], pizza: [0, 0.98, 0],
    label: [-0.95, 1.55, 0.35], panel: [1.9, 1.5, -0.4],
  },
  {
    id: "oven", n: 6, title: "The Oven",
    line: "Ninety seconds at 450°. Slide it in and watch it blister.",
    hint: "Press Bake, or click the oven mouth.",
    camera: [1.9, 2.05, -0.4], target: [-0.1, 1.35, -5.6], pizza: [0, 1.06, -4.72],
    label: [0, 3.05, -5.0], panel: [1.9, 1.7, -4.4],
  },
  {
    id: "reveal", n: 7, title: "Out of the Fire",
    line: "Onto the stand, under the lights.",
    hint: "Your pie, done. Order it or keep exploring.",
    camera: [1.3, 1.75, 1.9], target: [0, 1.25, 0], pizza: [0, 1.32, 0],
    label: [1.05, 1.75, 0.35], panel: [1.6, 1.6, -0.6],
  },
  {
    id: "story", n: 8, title: "Our Story",
    line: "How a back-street parlour learned to be in two places at once.",
    hint: "Find your nearest branch.",
    camera: [-3.1, 2.45, -3.3], target: [-4.6, 2.45, -7.9], pizza: [0, 1.32, 0],
    label: [-6.15, 2.0, -7.6], panel: [-2.8, 2.2, -7.4],
  },
];

export type StationId = Station["id"];
export const STATION_COUNT = STATIONS.length;
export const stationIndex = (id: StationId) => STATIONS.findIndex((s) => s.id === id);
