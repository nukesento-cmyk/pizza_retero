"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { startBake } from "../actions";
import { runtime } from "../store";
import { bricks } from "./textures";
import { Interactive } from "./interactive";

const OVEN_Z = -6.4;
/** Half-angle of the doorway cut into the dome. */
const GAP = 0.46;

/** Wood-fired dome oven with a living fire. The light it throws is the room's key light. */
export function Oven({ quality }: { quality: "high" | "low" }) {
  const light = useRef<THREE.PointLight>(null);
  const flames = useRef<THREE.Group>(null);
  const embers = useRef<THREE.MeshStandardMaterial>(null);

  const arch = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-1.0, 0); s.lineTo(-1.0, 0.55); s.absarc(0, 0.55, 1.0, Math.PI, 0, true); s.lineTo(1.0, 0);
    s.lineTo(0.72, 0); s.lineTo(0.72, 0.55); s.absarc(0, 0.55, 0.72, 0, Math.PI, false); s.lineTo(-0.72, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  }, []);
  const mouth = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.72, 0); s.lineTo(-0.72, 0.55); s.absarc(0, 0.55, 0.72, Math.PI, 0, true); s.lineTo(0.72, 0); s.lineTo(-0.72, 0);
    return new THREE.ShapeGeometry(s, 24);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const b = runtime.bakeT;
    const boost = b > 0 && b < 1 ? Math.sin(Math.min(1, b / 0.85) * Math.PI) : 0;
    const flicker = Math.sin(t * 9.1) * 0.6 + Math.sin(t * 23.7) * 0.35 + Math.sin(t * 4.3) * 0.5;
    if (light.current) light.current.intensity = 6 + flicker * 1.2 + boost * 7;
    if (flames.current) {
      flames.current.children.forEach((f, i) => {
        const k = 1 + Math.sin(t * (7 + i * 1.7) + i) * 0.18 + boost * 0.4;
        f.scale.set(1 + boost * 0.2, k, 1 + boost * 0.2);
      });
    }
    if (embers.current) embers.current.emissiveIntensity = 1.8 + flicker * 0.25 + boost * 1.6;
  });

  return (
    <group position={[0, 0, OVEN_Z]}>
      {/* tiled plinth */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.96, 3]} />
        <meshStandardMaterial color="#efe2c8" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.98, 1.38]} receiveShadow>
        <boxGeometry args={[3.7, 0.06, 0.5]} />
        <meshStandardMaterial color="#2a1a13" roughness={0.5} />
      </mesh>

      {/* brick dome with a real doorway cut into the front (+z) */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[1.75, 48, 24, Math.PI / 2 + GAP, Math.PI * 2 - GAP * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial map={bricks()} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* crown over the doorway */}
      <mesh position={[0, 1.0, 0]}>
        <sphereGeometry args={[1.75, 12, 8, Math.PI / 2 - GAP, GAP * 2, 0, 0.56]} />
        <meshStandardMaterial map={bricks()} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* copper flue to the ceiling */}
      <mesh position={[0, 3.9, -0.3]} castShadow>
        <cylinderGeometry args={[0.24, 0.3, 2.7, 24]} />
        <meshStandardMaterial color="#c07a44" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.62, -0.3]}>
        <cylinderGeometry args={[0.42, 0.55, 0.22, 24]} />
        <meshStandardMaterial color="#a8653a" metalness={0.85} roughness={0.35} />
      </mesh>

      {/* arch frame + mouth (clickable) */}
      <group position={[0, 1.0, 1.55]}>
        <mesh geometry={arch} castShadow>
          <meshStandardMaterial color="#e7a33e" roughness={0.45} />
        </mesh>
        {/* open mouth: an invisible hit area, so the pie stays visible inside */}
        <Interactive id="oven-mouth" label="Bake it" onSelect={startBake} tagOffset={[0, 1.55, 0.3]}>
          <mesh geometry={mouth} position={[0, 0, 0.24]}>
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </Interactive>
        {/* soot-dark cavity, lit from within by the fire */}
        <mesh position={[0, 0.62, -0.62]}>
          <boxGeometry args={[1.44, 1.24, 1.3]} />
          <meshStandardMaterial color="#1a0c07" emissive="#5a1c08" emissiveIntensity={0.6} roughness={1} side={THREE.BackSide} />
        </mesh>
        {/* fire bed + flames, deep in the mouth */}
        <mesh position={[-0.38, 0.03, -1.0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.34, 24]} />
          <meshStandardMaterial ref={embers} color="#2a0d05" emissive="#ff6a1a" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <group ref={flames} position={[-0.42, 0.02, -1.05]}>
          {[-0.16, -0.05, 0.06, 0.15].map((x, i) => (
            <mesh key={x} position={[x, 0.22, (i % 2) * 0.12]}>
              <coneGeometry args={[0.08 + (i % 2) * 0.03, 0.38 + (i % 3) * 0.1, 12, 1, true]} />
              <meshBasicMaterial color={i % 2 ? [2.2, 0.95, 0.2] : [2.6, 0.6, 0.12]} toneMapped={false} transparent opacity={0.85} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      </group>

      {/* enamel plaque */}
      <group position={[0, 2.15, 1.42]} rotation-x={-0.35}>
        <mesh>
          <boxGeometry args={[1.25, 0.38, 0.04]} />
          <meshPhysicalMaterial color="#fbf6ec" clearcoat={1} roughness={0.3} />
        </mesh>
        <Text font="/fonts/Shrikhand-Regular.ttf" fontSize={0.21} position={[0, -0.01, 0.03]} color="#c8402b" anchorX="center" anchorY="middle">
          Forno
        </Text>
      </group>

      <pointLight
        ref={light}
        position={[0, 1.4, 1.9]}
        color="#ff8a3d"
        intensity={14}
        distance={11}
        decay={1.6}
        castShadow={quality === "high"}
        shadow-mapSize={[512, 512]}
      />
    </group>
  );
}
