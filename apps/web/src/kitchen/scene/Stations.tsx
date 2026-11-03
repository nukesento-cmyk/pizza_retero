"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SAUCES, SIZES, TOPPINGS, type SauceId, type SizeId, type ToppingId } from "../builder";
import { kitchen, useKitchen } from "../store";
import { Interactive } from "./interactive";
import { wood } from "./textures";

const TOP = 0.95; // counter top height

/** Ease an object toward a target y each frame (selected items lift). */
function useLift(selected: boolean, base: number) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = base + (selected ? 0.08 : 0);
    ref.current.position.y += (target - ref.current.position.y) * Math.min(1, dt * 8);
  });
  return ref;
}

/* ── Dough bench: three dough balls = three sizes ─────────────────── */

export function DoughBench() {
  const size = useKitchen((s) => s.builder.size);
  return (
    <group>
      {/* flour dusting */}
      <mesh position={[-5.15, TOP + 0.002, 2.6]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.55, 32]} />
        <meshStandardMaterial color="#fffaf0" transparent opacity={0.18} roughness={1} depthWrite={false} />
      </mesh>
      {SIZES.map((s, i) => (
        <DoughBall key={s.id} id={s.id} label={`${s.label} ${s.detail}`} r={0.1 + i * 0.035} z={2.15 + i * 0.5} selected={size === s.id} />
      ))}
      {/* rolling pin */}
      <group position={[-5.35, TOP + 0.045, 0.2]} rotation={[0, 0.3, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.6, 20]} />
          <meshStandardMaterial map={wood()} roughness={0.6} />
        </mesh>
        {[-0.38, 0.38].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.18, 12]} />
            <meshStandardMaterial color="#6b4423" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* proofing bowl */}
      <mesh position={[-5.55, TOP + 0.12, 3.45]} castShadow>
        <cylinderGeometry args={[0.32, 0.2, 0.24, 28, 1, true]} />
        <meshPhysicalMaterial color="#2e6b52" clearcoat={1} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function DoughBall({ id, label, r, z, selected }: { id: SizeId; label: string; r: number; z: number; selected: boolean }) {
  const ref = useLift(selected, TOP + r * 0.62);
  return (
    <Interactive id={`dough-${id}`} label={label} selected={selected} onSelect={() => kitchen.build({ size: id })} tagOffset={[0, r + 0.25, 0]}>
      <group ref={ref} position={[-5.25, TOP + r * 0.62, z]}>
        <mesh scale={[1, 0.68, 1]} castShadow>
          <sphereGeometry args={[r, 32, 20]} />
          <meshStandardMaterial color="#f3e2c0" roughness={0.92} emissive="#e7a33e" emissiveIntensity={selected ? 0.25 : 0} />
        </mesh>
      </group>
    </Interactive>
  );
}

/* ── Sauce pots ───────────────────────────────────────────────────── */

export function SaucePots() {
  const sauce = useKitchen((s) => s.builder.sauce);
  const profile = useMemo(
    () => [
      new THREE.Vector2(0.0, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0.2, 0.03),
      new THREE.Vector2(0.21, 0.24), new THREE.Vector2(0.235, 0.26), new THREE.Vector2(0.22, 0.27),
    ],
    [],
  );
  return (
    <group>
      {SAUCES.map((s, i) => (
        <SaucePot key={s.id} id={s.id} label={s.label} color={s.color} z={-0.95 - i * 0.55} profile={profile} selected={sauce === s.id} />
      ))}
      {/* tomato tins */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[-5.65, TOP + 0.09 + (i === 2 ? 0.18 : 0), -3.0 + (i === 2 ? 0.1 : i * 0.22)]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.18, 20]} />
            <meshStandardMaterial color="#c9c3b8" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.082, 0.082, 0.12, 20]} />
            <meshStandardMaterial color="#c8402b" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SaucePot({ id, label, color, z, profile, selected }: { id: SauceId; label: string; color: string; z: number; profile: THREE.Vector2[]; selected: boolean }) {
  const ref = useLift(selected, TOP);
  return (
    <Interactive id={`sauce-${id}`} label={label} selected={selected} onSelect={() => kitchen.build({ sauce: id })} tagOffset={[0, 0.55, 0]}>
      <group ref={ref} position={[-5.3, TOP, z]}>
        <mesh castShadow>
          <latheGeometry args={[profile, 32]} />
          <meshPhysicalMaterial color="#fbf6ec" clearcoat={1} roughness={0.25} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.215, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.2, 32]} />
          <meshStandardMaterial color={color} roughness={0.35} emissive={color} emissiveIntensity={selected ? 0.35 : 0.05} />
        </mesh>
        {/* enamel colour band */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.212, 0.212, 0.05, 32, 1, true]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
        {selected ? (
          <group position={[0.06, 0.32, 0]} rotation-z={-0.5}>
            <mesh castShadow>
              <cylinderGeometry args={[0.012, 0.012, 0.5, 8]} />
              <meshStandardMaterial color="#c9c3b8" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        ) : null}
      </group>
    </Interactive>
  );
}

/** Deterministic pile of topping pieces inside a tin. */
function tinBits(seed0: number) {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 22 }, () => [(rnd() - 0.5) * 0.4, 0.13 + rnd() * 0.04, (rnd() - 0.5) * 0.4] as const);
}

/* ── Topping tins on the line ─────────────────────────────────────── */

export function ToppingLine() {
  const toppings = useKitchen((s) => s.builder.toppings);
  return (
    <group>
      {TOPPINGS.map((t, i) => (
        <ToppingTin key={t.id} id={t.id} label={t.label} color={t.color} z={-1.9 + i * 0.62} selected={toppings.includes(t.id)} />
      ))}
    </group>
  );
}

function ToppingTin({ id, label, color, z, selected }: { id: ToppingId; label: string; color: string; z: number; selected: boolean }) {
  const ref = useLift(selected, TOP);
  const bits = useMemo(() => tinBits(id.length * 97 + z * 13), [id, z]);
  return (
    <Interactive id={`top-${id}`} label={`${selected ? "Remove" : "Add"} ${label}`} selected={selected} onSelect={() => kitchen.toggleTopping(id)} tagOffset={[0, 0.5, 0]}>
      <group ref={ref} position={[5.4, TOP, z]}>
        <mesh position={[0, 0.08, 0]} castShadow>
          <boxGeometry args={[0.5, 0.16, 0.5]} />
          <meshStandardMaterial color="#c9c3b8" metalness={0.85} roughness={0.28} emissive="#e7a33e" emissiveIntensity={selected ? 0.18 : 0} />
        </mesh>
        {bits.map(([x, y, bz], k) => (
          <mesh key={k} position={[x, y, bz]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        ))}
        {/* label strip — the floating tag carries the name */}
        <mesh position={[-0.252, 0.08, 0]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[0.36, 0.08]} />
          <meshStandardMaterial color={selected ? "#e7a33e" : "#fbf6ec"} roughness={0.6} />
        </mesh>
      </group>
    </Interactive>
  );
}
