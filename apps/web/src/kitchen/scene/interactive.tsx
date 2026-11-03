"use client";

import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, type ReactNode } from "react";
import { kitchen, useKitchen } from "../store";

/**
 * Wraps a 3D object so it can be pointed at and clicked. Shows a floating
 * tag while hovered. Every 3D action is mirrored by a DOM control in the
 * station panel, so keyboard and screen-reader users lose nothing.
 */
export function Interactive({
  id, label, onSelect, children, tagOffset = [0, 0.35, 0], selected = false,
}: {
  id: string;
  label: string;
  onSelect: () => void;
  children: ReactNode;
  tagOffset?: [number, number, number];
  selected?: boolean;
}) {
  const hovered = useKitchen((s) => s.hovered === id);
  const over = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    kitchen.set({ hovered: id });
    document.body.style.cursor = "pointer";
  }, [id]);
  const out = useCallback(() => {
    if (kitchen.get().hovered === id) kitchen.set({ hovered: null });
    document.body.style.cursor = "";
  }, [id]);
  const click = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  return (
    <group onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
      {hovered ? (
        <Html position={tagOffset} center zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap rounded-full border-2 border-espresso bg-flour px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-espresso shadow-print-sm">
            {selected ? "✓ " : ""}{label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}
