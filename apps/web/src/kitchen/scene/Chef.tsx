"use client";

import { Detailed, useAnimations, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { runtime, useKitchen } from "../store";

const URL0 = "/models/chef.glb";
const URL1 = "/models/chef-lod1.glb";
const CLIP = { raw: "idle", baking: "bake", baked: "celebrate" } as const;

function ChefLod({ url, quality }: { url: string; quality: "high" | "low" }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useGLTF(url, false, true);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = quality === "high"; m.receiveShadow = true; } });
    return s;
  }, [gltf.scene, quality]);
  const { actions } = useAnimations(gltf.animations, group);
  const bake = useKitchen((s) => s.bake);

  // Crossfade between clips as the oven state changes. Reduced motion: hold a still pose.
  useEffect(() => {
    const next = actions[CLIP[bake]];
    if (!next) return;
    if (runtime.reducedMotion) {
      Object.values(actions).forEach((a) => a?.stop());
      next.reset().play().setEffectiveTimeScale(0); // hold the first frame
      return;
    }
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.35).play();
    return () => { next.fadeOut(0.35); };
  }, [actions, bake]);

  return <primitive ref={group} object={scene} />;
}

/** Animated GLB chef (idle / bake / celebrate) with LOD. */
export function Chef({ quality }: { quality: "high" | "low" }) {
  return (
    <group position={[-1.75, 0, -4.7]} rotation-y={0.55}>
      <Detailed distances={[0, quality === "high" ? 9 : 5]}>
        <ChefLod url={URL0} quality={quality} />
        <ChefLod url={URL1} quality={quality} />
      </Detailed>
    </group>
  );
}

useGLTF.preload(URL0, false, true);
