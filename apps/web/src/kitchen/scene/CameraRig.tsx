"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { runtime } from "../store";
import { STATIONS } from "../stations";

/**
 * Moves the camera along a spline through every station's pose.
 * Scroll (via ScrollTrigger) writes `runtime.progress`; this reads it each
 * frame and damps toward it, so motion is smooth without React renders.
 * Pointer adds a little parallax, which makes the room feel physical.
 */
export function CameraRig() {
  const size = useThree((st) => st.size);
  const n = STATIONS.length;
  const { posCurve, lookCurve } = useMemo(() => ({
    posCurve: new THREE.CatmullRomCurve3(STATIONS.map((s) => new THREE.Vector3(...s.camera)), false, "centripetal", 0.5),
    lookCurve: new THREE.CatmullRomCurve3(STATIONS.map((s) => new THREE.Vector3(...s.target)), false, "centripetal", 0.5),
  }), []);
  // Scratch vectors live in refs: they are mutated every frame, never rendered.
  const scratch = useRef({
    look: new THREE.Vector3(...STATIONS[0]!.target),
    wantPos: new THREE.Vector3(),
    wantLook: new THREE.Vector3(),
    side: new THREE.Vector3(),
  });

  const portrait = size.width / size.height < 0.9;

  useFrame((state, dt) => {
    const { camera } = state;
    const { look, wantPos, wantLook, side } = scratch.current;
    const t = Math.min(1, Math.max(0, runtime.progress / (n - 1)));
    posCurve.getPoint(t, wantPos);
    lookCurve.getPoint(t, wantLook);

    // Portrait screens: step back along the view direction so the station fits.
    if (portrait) wantPos.sub(wantLook).multiplyScalar(1.45).add(wantLook);

    if (!runtime.reducedMotion) {
      side.subVectors(wantLook, wantPos).cross(camera.up).normalize();
      wantPos.addScaledVector(side, state.pointer.x * 0.22);
      wantPos.y += state.pointer.y * 0.12;
    }

    const k = runtime.reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
    camera.position.lerp(wantPos, k);
    look.lerp(wantLook, k);
    camera.lookAt(look);

    const persp = camera as THREE.PerspectiveCamera;
    const fov = portrait ? 58 : 42;
    if (Math.abs(persp.fov - fov) > 0.01) {
      persp.fov = fov;
      persp.updateProjectionMatrix();
    }
  });
  return null;
}
