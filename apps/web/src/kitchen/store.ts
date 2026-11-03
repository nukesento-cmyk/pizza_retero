"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_BUILD, toggleTopping, type BuilderState, type ToppingId } from "./builder";

export type BakeState = "raw" | "baking" | "baked";

export interface KitchenState {
  active: number; // station index the camera is dwelling at
  builder: BuilderState;
  bake: BakeState;
  hovered: string | null;
}

/**
 * Per-frame values the 3D scene reads in useFrame. Mutated directly (no React
 * re-render) so 60fps camera motion never touches React state.
 */
export const runtime = {
  progress: 0, // 0 … STATION_COUNT-1, continuous
  bakeT: 0, // 0 → 1 during the oven sequence
  reducedMotion: false,
  /** Screen position of the active station's panel anchor (written by the 3D scene). */
  anchor: { x: 0, y: 0, visible: false },
};

let state: KitchenState = { active: 0, builder: DEFAULT_BUILD, bake: "raw", hovered: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const kitchen = {
  get: () => state,
  set(patch: Partial<KitchenState>) {
    state = { ...state, ...patch };
    emit();
  },
  build(patch: Partial<BuilderState>) {
    // Any change after baking means it's a new, unbaked pie.
    state = { ...state, builder: { ...state.builder, ...patch }, bake: "raw" };
    runtime.bakeT = 0;
    emit();
  },
  toggleTopping(id: ToppingId) {
    state = { ...state, builder: toggleTopping(state.builder, id), bake: "raw" };
    runtime.bakeT = 0;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useKitchen<T>(select: (s: KitchenState) => T): T {
  return useSyncExternalStore(kitchen.subscribe, () => select(state), () => select(state));
}

/** Navigation is owned by the scroll controller; it registers itself here. */
export const nav: { goTo: (index: number) => void } = {
  goTo: () => {},
};
