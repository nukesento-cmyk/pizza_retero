"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { runtime, kitchen } from "../store";

const WHITE = "#f7f1e6";

/**
 * Placeholder chef — stylised primitives with idle, bake and celebrate poses.
 * The Blender character (assets/README.md) replaces this with the same clip
 * names: idle, bake, celebrate.
 */
export function ChefProcedural() {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const bake = kitchen.get().bake;
    const calm = runtime.reducedMotion ? 0 : 1;
    if (body.current) body.current.position.y = Math.sin(t * 1.6) * 0.015 * calm;
    if (head.current) head.current.rotation.z = Math.sin(t * 0.8) * 0.06 * calm;
    if (armR.current) {
      const target = bake === "baking" ? -1.25 : bake === "baked" ? -2.6 + Math.sin(t * 6) * 0.25 * calm : -0.15 + Math.sin(t * 1.3) * 0.05 * calm;
      armR.current.rotation.x += (target - armR.current.rotation.x) * 0.08;
    }
    if (armL.current) {
      const target = bake === "baking" ? -1.1 : -0.1;
      armL.current.rotation.x += (target - armL.current.rotation.x) * 0.08;
    }
  });

  return (
    <group position={[-1.75, 0, -4.7]} rotation-y={0.55}>
      <group ref={body}>
        {/* legs */}
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.42, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.62, 6, 12]} />
            <meshStandardMaterial color="#2a1a13" roughness={0.8} />
          </mesh>
        ))}
        {/* jacket */}
        <mesh position={[0, 1.12, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.55, 8, 20]} />
          <meshStandardMaterial color={WHITE} roughness={0.75} />
        </mesh>
        {/* apron */}
        <mesh position={[0, 0.98, 0.22]} castShadow>
          <boxGeometry args={[0.46, 0.62, 0.04]} />
          <meshStandardMaterial color="#c8402b" roughness={0.7} />
        </mesh>
        {/* neckerchief */}
        <mesh position={[0, 1.5, 0.05]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.13, 0.04, 8, 20]} />
          <meshStandardMaterial color="#e7a33e" roughness={0.6} />
        </mesh>
        {/* head + toque */}
        <group ref={head} position={[0, 1.74, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 24, 18]} />
            <meshStandardMaterial color="#8d5a3b" roughness={0.65} />
          </mesh>
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.03, 0.18]}>
              <sphereGeometry args={[0.022, 10, 8]} />
              <meshStandardMaterial color="#15100c" roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, -0.04, 0.19]} rotation={[0.2, 0, Math.PI]}>
            <torusGeometry args={[0.05, 0.012, 6, 14, Math.PI]} />
            <meshStandardMaterial color="#5a2212" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.19, 0.22, 24]} />
            <meshStandardMaterial color={WHITE} roughness={0.8} />
          </mesh>
          {[[-0.09, 0], [0.09, 0], [0, 0.08], [0, -0.08]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x!, 0.4, z!]} castShadow>
              <sphereGeometry args={[0.13, 16, 12]} />
              <meshStandardMaterial color={WHITE} roughness={0.85} />
            </mesh>
          ))}
        </group>
        {/* arms pivot at the shoulder */}
        {([[armL, -0.33], [armR, 0.33]] as const).map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 1.38, 0]}>
            <mesh position={[0, -0.28, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.42, 6, 12]} />
              <meshStandardMaterial color={WHITE} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.6, 0]} castShadow>
              <sphereGeometry args={[0.07, 12, 10]} />
              <meshStandardMaterial color="#8d5a3b" roughness={0.65} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
