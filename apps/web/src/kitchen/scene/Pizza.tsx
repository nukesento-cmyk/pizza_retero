"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CHEESES, CRUSTS, SAUCES, SIZES, TOPPINGS, type ToppingId } from "../builder";
import { runtime, useKitchen } from "../store";
import { STATIONS, stationIndex } from "../stations";

const I_DOUGH = stationIndex("dough");
const I_SAUCE = stationIndex("sauce");
const I_LINE = stationIndex("ingredients");
const I_OVEN = stationIndex("oven");
const I_REVEAL = stationIndex("reveal");

const RAW_DOUGH = new THREE.Color("#f1dfba");
const BAKED_DOUGH = new THREE.Color("#c98a3e");
const BAKED_CHEESE = new THREE.Color("#e7a54a");

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic scatter so toppings don't jump around between renders. */
function scatter(count: number, radius: number, seed: number) {
  const out: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt((i + 0.5) / count);
    const a = i * golden + seed;
    out.push([Math.cos(a) * r, Math.sin(a) * r, (i * 37 + seed * 11) % 6.28]);
  }
  return out;
}

/**
 * The pie being built. It travels with the visitor from bench to oven,
 * gaining layers at each station, and browns as it bakes.
 */
export function Pizza() {
  const b = useKitchen((s) => s.builder);
  const size = SIZES.find((s) => s.id === b.size)!;
  const crust = CRUSTS.find((c) => c.id === b.crust)!;
  const sauce = SAUCES.find((s) => s.id === b.sauce)!;
  const cheese = CHEESES.find((c) => c.id === b.cheese)!;
  const R = size.radius;

  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const sauceRef = useRef<THREE.Mesh>(null);
  const cheeseRef = useRef<THREE.Mesh>(null);
  const toppingsRef = useRef<THREE.Group>(null);
  const peel = useRef<THREE.Group>(null);
  const stand = useRef<THREE.Group>(null);
  const doughMat = useRef<THREE.MeshStandardMaterial>(null);
  const rimMat = useRef<THREE.MeshStandardMaterial>(null);
  const cheeseMat = useRef<THREE.MeshStandardMaterial>(null);

  const spots = useMemo(() => STATIONS.map((s) => new THREE.Vector3(...s.pizza)), []);
  const scratch = useRef(new THREE.Vector3());
  const cheeseBase = useMemo(() => new THREE.Color(cheese.color), [cheese.color]);

  useFrame(({ clock }, dt) => {
    const tmp = scratch.current;
    const p = runtime.progress;
    const i = Math.min(spots.length - 2, Math.floor(p));
    const f = p - i;
    const e = f * f * (3 - 2 * f);
    tmp.lerpVectors(spots[i]!, spots[i + 1]!, e);
    tmp.y += Math.sin(Math.PI * e) * (spots[i]!.distanceTo(spots[i + 1]!) > 0.5 ? 0.55 : 0);

    // oven sequence: slide in, blister, slide out
    const bt = runtime.bakeT;
    const into = smooth(0, 0.2, bt) - smooth(0.8, 1, bt);
    tmp.z -= into * 1.2;
    tmp.y += into * 0.02;

    const g = root.current;
    if (!g) return;
    const k = runtime.reducedMotion ? 1 : Math.min(1, dt * 10);
    g.position.lerp(tmp, k);
    const appear = smooth(I_DOUGH - 0.7, I_DOUGH - 0.15, p);
    g.scale.setScalar(Math.max(0.0001, appear));

    if (spin.current) {
      const target = p > I_REVEAL - 0.4 && !runtime.reducedMotion ? clock.elapsedTime * 0.35 : 0;
      spin.current.rotation.y = target;
    }
    if (sauceRef.current) sauceRef.current.visible = p > I_SAUCE - 0.45;
    if (cheeseRef.current) cheeseRef.current.visible = p > I_LINE - 0.45 && cheese.coverage > 0;
    if (toppingsRef.current) toppingsRef.current.visible = p > I_LINE - 0.45;
    if (peel.current) peel.current.visible = Math.abs(p - I_OVEN) < 0.5;
    if (stand.current) stand.current.visible = p > I_REVEAL - 0.5;

    const browned = smooth(0.2, 0.8, bt);
    doughMat.current?.color.copy(RAW_DOUGH).lerp(BAKED_DOUGH, browned * 0.8);
    rimMat.current?.color.copy(RAW_DOUGH).lerp(BAKED_DOUGH, browned);
    cheeseMat.current?.color.copy(cheeseBase).lerp(BAKED_CHEESE, browned * 0.55);
  });

  return (
    <>
      <group ref={root} position={spots[0]}>
        <group ref={spin}>
          {/* base */}
          <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[R, R * 0.98, 0.024, 48]} />
            <meshStandardMaterial ref={doughMat} color={RAW_DOUGH} roughness={0.85} />
          </mesh>
          {/* rim */}
          <mesh position={[0, 0.026, 0]} rotation-x={Math.PI / 2} castShadow>
            <torusGeometry args={[R - crust.rim * 0.6, crust.rim, 14, 56]} />
            <meshStandardMaterial ref={rimMat} color={RAW_DOUGH} roughness={0.8} />
          </mesh>
          <mesh ref={sauceRef} position={[0, 0.0255, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[R - crust.rim * 1.2, 48]} />
            <meshStandardMaterial color={sauce.color} roughness={0.4} />
          </mesh>
          <mesh ref={cheeseRef} position={[0, 0.029, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[(R - crust.rim * 1.4) * Math.max(0.01, cheese.coverage), 48]} />
            <meshStandardMaterial ref={cheeseMat} color={cheese.color} roughness={0.55} />
          </mesh>
          <group ref={toppingsRef} position={[0, 0.034, 0]}>
            {b.toppings.map((t, ti) => (
              <ToppingLayer key={t} id={t} radius={R - crust.rim * 2} seed={ti * 1.7 + 0.4} count={Math.round(7 + R * 14)} />
            ))}
          </group>
        </group>
        {/* peel under the pie at the oven */}
        <group ref={peel} position={[0, -0.006, 0]}>
          <mesh>
            <cylinderGeometry args={[R + 0.06, R + 0.06, 0.012, 40]} />
            <meshStandardMaterial color="#b5803f" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, R + 0.55]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.025, 0.025, 1.1, 10]} />
            <meshStandardMaterial color="#8a5a2b" roughness={0.7} />
          </mesh>
        </group>
      </group>

      {/* reveal stand on the island */}
      <group ref={stand} position={[0, 0.95, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.12, 0.32, 20]} />
          <meshStandardMaterial color="#c9c3b8" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.33, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.52, 0.5, 0.025, 48]} />
          <meshStandardMaterial color="#c9c3b8" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </>
  );
}

function ToppingLayer({ id, radius, seed, count }: { id: ToppingId; radius: number; seed: number; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const color = TOPPINGS.find((t) => t.id === id)!.color;
  const pts = useMemo(() => scatter(count, radius, seed), [count, radius, seed]);
  const geo = useMemo(() => {
    switch (id) {
      case "pepperoni": return new THREE.CylinderGeometry(0.038, 0.038, 0.008, 18);
      case "mushroom": return new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      case "olive": return new THREE.TorusGeometry(0.014, 0.007, 6, 14);
      case "basil": return new THREE.SphereGeometry(0.03, 8, 4);
      case "pepper": return new THREE.TorusGeometry(0.024, 0.006, 6, 14, Math.PI * 1.3);
      case "onion": return new THREE.TorusGeometry(0.026, 0.004, 5, 18, Math.PI);
    }
  }, [id]);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    pts.forEach(([x, z, rot], i) => {
      o.position.set(x, 0.004, z);
      o.rotation.set(id === "olive" || id === "pepper" || id === "onion" ? Math.PI / 2 : 0, rot, 0);
      o.scale.set(1, 1, 1);
      if (id === "basil") o.scale.set(1, 0.18, 0.55);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [pts, id]);

  return (
    <instancedMesh ref={ref} args={[geo, undefined, pts.length]} castShadow>
      <meshStandardMaterial color={color} roughness={0.55} />
    </instancedMesh>
  );
}
