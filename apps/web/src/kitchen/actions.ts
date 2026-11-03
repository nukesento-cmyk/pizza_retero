"use client";

import gsap from "gsap";
import { kitchen, nav, runtime } from "./store";
import { stationIndex } from "./stations";

let bakeTween: gsap.core.Tween | null = null;

/** The oven sequence: slide in → blister → slide out → reveal. */
export function startBake() {
  if (kitchen.get().bake === "baking") return;
  bakeTween?.kill();
  runtime.bakeT = 0;
  kitchen.set({ bake: "baking" });
  bakeTween = gsap.to(runtime, {
    bakeT: 1,
    duration: runtime.reducedMotion ? 1.2 : 5.5,
    ease: "none",
    onComplete: () => {
      kitchen.set({ bake: "baked" });
      gsap.delayedCall(runtime.reducedMotion ? 0.2 : 0.9, () => nav.goTo(stationIndex("reveal")));
    },
  });
}
