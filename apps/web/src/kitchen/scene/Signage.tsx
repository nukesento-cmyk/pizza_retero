"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { runtime } from "../store";

const FONT = "/fonts/Shrikhand-Regular.ttf";

/** Neon tube colour: HDR values above 1 so the bloom pass picks them up. */
const NEON_RED: [number, number, number] = [5, 1.05, 0.55];
const NEON_GOLD: [number, number, number] = [4.2, 2.4, 0.6];
const NEON_GREEN: [number, number, number] = [0.6, 3.6, 1.6];

function Neon({ text, color, size, position, rotationY = 0, flicker = false }: {
  text: string; color: [number, number, number]; size: number; position: [number, number, number]; rotationY?: number; flicker?: boolean;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!flicker || !mat.current || runtime.reducedMotion) return;
    const t = clock.elapsedTime % 5;
    const off = (t > 2.1 && t < 2.18) || (t > 2.3 && t < 2.34);
    const [r, g, b] = off ? [0.4, 0.1, 0.05] : color;
    mat.current.color.setRGB(r, g, b);
  });
  return (
    <group position={position} rotation-y={rotationY}>
      <Text font={FONT} fontSize={size} anchorX="center" anchorY="middle" maxWidth={6}>
        {text}
        <meshBasicMaterial ref={mat} color={color} toneMapped={false} />
      </Text>
    </group>
  );
}

export function Signage({ brand }: { brand: string }) {
  return (
    <group>
      {/* street-side sign above the door */}
      <mesh position={[0, 4.02, 8.13]}>
        <boxGeometry args={[5.2, 1.1, 0.06]} />
        <meshStandardMaterial color="#15100c" roughness={0.6} />
      </mesh>
      <Neon text={brand} color={NEON_RED} size={0.56} position={[0, 4.05, 8.2]} flicker />
      <Neon text="OPEN" color={NEON_GREEN} size={0.32} position={[3.6, 2.2, 8.16]} />
      {/* inside */}
      <Neon text="Hot Pizza" color={NEON_GOLD} size={0.55} position={[7.92, 3.6, 0.8]} rotationY={-Math.PI / 2} />
      <Neon text="Since 2026" color={NEON_RED} size={0.32} position={[-4.4, 3.55, -7.9]} />
    </group>
  );
}

/** Enamel pendant lamps with warm bulbs; the island lamp casts the hero shadow. */
export function Lamps({ quality }: { quality: "high" | "low" }) {
  const lamps: { pos: [number, number, number]; shadow: boolean }[] = [
    { pos: [0, 3.25, 0], shadow: quality === "high" },
    { pos: [-5, 3.25, 1.2], shadow: false },
    { pos: [-5, 3.25, -1.6], shadow: false },
    { pos: [5, 3.25, 0.8], shadow: false },
  ];
  return (
    <group>
      {lamps.map(({ pos, shadow }) => (
        <Lamp key={pos.join()} position={pos} shadow={shadow} />
      ))}
    </group>
  );
}

function Lamp({ position, shadow }: { position: [number, number, number]; shadow: boolean }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  useFrame(() => {
    if (light.current && target.current && light.current.target !== target.current) light.current.target = target.current;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1.9, 6]} />
        <meshStandardMaterial color="#15100c" />
      </mesh>
      <mesh castShadow>
        <coneGeometry args={[0.34, 0.3, 32, 1, true]} />
        <meshPhysicalMaterial color="#2e6b52" clearcoat={1} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshBasicMaterial color={[4, 2.8, 1.5]} toneMapped={false} />
      </mesh>
      <spotLight
        ref={light}
        position={[0, -0.12, 0]}
        angle={0.75}
        penumbra={0.65}
        intensity={7}
        distance={7}
        decay={1.5}
        color="#ffc98a"
        castShadow={shadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <object3D ref={target} position={[0, -3, 0]} />
    </group>
  );
}
