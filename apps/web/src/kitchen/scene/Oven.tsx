"use client";

import { Detailed, Text, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { startBake } from "../actions";
import { runtime } from "../store";
import { Interactive } from "./interactive";

const OVEN_Z = -6.4;
const URL0 = "/models/oven.glb";
const URL1 = "/models/oven-lod1.glb";

/** Prepare a cloned GLB scene: shadows, HDR emissives for bloom, named-node lookup. */
function usePrepared(url: string, quality: "high" | "low") {
  const gltf = useGLTF(url, false, true);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = quality === "high" && !/Flame|Mouth|Cavity/.test(m.name);
      m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (/Flame|Ember/.test(mat.name)) {
        m.material = mat.clone();
        (m.material as THREE.MeshStandardMaterial).toneMapped = false;
        (m.material as THREE.MeshStandardMaterial).emissiveIntensity = /Flame/.test(mat.name) ? 2.6 : 1.8;
      }
    });
    return s;
  }, [gltf.scene, quality]);
  return { scene, animations: gltf.animations };
}

function OvenLod({ url, quality }: { url: string; quality: "high" | "low" }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = usePrepared(url, quality);
  const { actions } = useAnimations(animations, group);
  const flames = useMemo(() => scene.getObjectByName("Oven_Flames"), [scene]);
  // Scene objects are three.js state, not React state: keep the material in a ref for per-frame updates.
  const ember = useRef<THREE.MeshStandardMaterial | null>(null);
  useEffect(() => {
    ember.current = ((scene.getObjectByName("Oven_FireBed") as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined) ?? null;
  }, [scene]);

  useEffect(() => {
    const a = actions.fire_loop;
    if (!a) return;
    if (runtime.reducedMotion) { a.stop(); return; }
    a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    return () => { a.stop(); };
  }, [actions]);

  useFrame(() => {
    const b = runtime.bakeT;
    const boost = b > 0 && b < 1 ? Math.sin(Math.min(1, b / 0.85) * Math.PI) : 0;
    if (flames) flames.scale.setScalar(1 + boost * 0.45);
    if (ember.current) ember.current.emissiveIntensity = 1.8 + boost * 1.6;
  });

  return <primitive ref={group} object={scene} />;
}

/** The GLB oven with LOD, plus the parts that stay runtime-only: the mouth hit target, plaque text and fire light. */
export function Oven({ quality }: { quality: "high" | "low" }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const b = runtime.bakeT;
    const boost = b > 0 && b < 1 ? Math.sin(Math.min(1, b / 0.85) * Math.PI) : 0;
    const flicker = runtime.reducedMotion ? 0 : Math.sin(t * 9.1) * 0.6 + Math.sin(t * 23.7) * 0.35 + Math.sin(t * 4.3) * 0.5;
    if (light.current) light.current.intensity = 6 + flicker * 1.2 + boost * 7;
  });
  return (
    <group position={[0, 0, OVEN_Z]}>
      <Detailed distances={[0, quality === "high" ? 11 : 6]}>
        <OvenLod url={URL0} quality={quality} />
        <OvenLod url={URL1} quality={quality} />
      </Detailed>
      {/* Hit area kept in the runtime so it works for every LOD. */}
      <group position={[0, 1, 1.79]}>
        <Interactive id="oven-mouth" label="Bake it" onSelect={startBake} tagOffset={[0, 1.55, 0.3]}>
          <mesh position={[0, 0.6, 0]}>
            <planeGeometry args={[1.44, 1.3]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </Interactive>
      </group>
      <group position={[0, 2.15, 1.45]} rotation-x={-0.35}>
        <Text font="/fonts/Shrikhand-Regular.ttf" fontSize={0.21} position={[0, -0.01, 0.0]} color="#c8402b" anchorX="center" anchorY="middle">Forno</Text>
      </group>
      <pointLight ref={light} position={[0, 1.4, 1.9]} color="#ff8a3d" intensity={6} distance={11} decay={1.6} castShadow={quality === "high"} shadow-mapSize={[512, 512]} />
    </group>
  );
}

useGLTF.preload(URL0, false, true);
