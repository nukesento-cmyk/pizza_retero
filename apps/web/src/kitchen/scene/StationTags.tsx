"use client";

import { Html } from "@react-three/drei";
import { nav, useKitchen } from "../store";
import { STATIONS } from "../stations";
import { cn } from "@/lib/utils";

/**
 * Floating enamel tags pinned to each station in world space. From the door
 * you see them all (a map of the kitchen); inside, only nearby ones show.
 * Clicking one walks you there.
 */
export function StationTags() {
  const active = useKitchen((s) => s.active);
  return (
    <>
      {STATIONS.map((s, i) => {
        const near = active === 0 ? i > 0 : Math.abs(i - active) === 1;
        const here = i === active && i > 0;
        if (!near && !here) return null;
        return (
          <Html key={s.id} position={s.label} center zIndexRange={[25, 10]}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => nav.goTo(i)}
              className={cn(
                "group flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-espresso px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider shadow-print-sm transition-all duration-200",
                here ? "pointer-events-none scale-110 bg-sauce text-flour" : "bg-flour/95 text-espresso hover:-translate-y-0.5 hover:bg-crust",
              )}
            >
              <span className={cn("grid size-4 place-items-center rounded-full text-[9px]", here ? "bg-flour text-sauce" : "bg-espresso text-flour")}>
                {s.n}
              </span>
              {s.title}
              {!here ? <span aria-hidden className="motion-safe:animate-pulse">●</span> : null}
            </button>
          </Html>
        );
      })}
    </>
  );
}
