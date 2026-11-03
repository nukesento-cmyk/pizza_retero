"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { kitchen, runtime } from "../store";
import { STATIONS } from "../stations";

/** Projects the active station's panel anchor to screen space for the DOM panel. */
export function AnchorProjector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const s = STATIONS[kitchen.get().active]!;
    v.set(...s.panel).project(camera);
    runtime.anchor.x = (v.x * 0.5 + 0.5) * size.width;
    runtime.anchor.y = (-v.y * 0.5 + 0.5) * size.height;
    runtime.anchor.visible = v.z < 1;
  });
  return null;
}
