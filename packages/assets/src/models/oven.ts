import * as THREE from "three";
import { brickTexture } from "../textures";

/**
 * The wood-fired oven, authored as a three.js scene for GLB export.
 * Node names are the contract with the runtime (docs/3D_KITCHEN.md §5):
 *   Oven · Oven_Dome · Oven_Arch · Oven_Mouth (hit area) · Oven_Cavity
 *   Oven_FireBed · Oven_Flame_0..3 · Oven_Flue · Oven_Plaque · Oven_Plinth
 * Animation clips: fire_loop.
 */
const GAP = 0.46;

export function buildOven(detail: "lod0" | "lod1" = "lod0") {
  const seg = detail === "lod0" ? 48 : 20;
  const root = new THREE.Group();
  root.name = "Oven";
  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(...pos);
    parent.add(m);
    return m;
  };

  const brick = new THREE.MeshStandardMaterial({ name: "Brick", map: brickTexture(), roughness: 0.85, side: THREE.DoubleSide });
  brick.map!.repeat.set(3, 1.5);
  const tile = new THREE.MeshStandardMaterial({ name: "Tile_Cream", color: "#efe2c8", roughness: 0.3 });
  const enamelCrust = new THREE.MeshStandardMaterial({ name: "Enamel_Crust", color: "#e7a33e", roughness: 0.45 });
  const copper = new THREE.MeshStandardMaterial({ name: "Copper", color: "#c07a44", metalness: 0.85, roughness: 0.3 });
  // glTF has no back-face-only materials: the cavity is an inward-facing box with a single-sided material.
  const soot = new THREE.MeshStandardMaterial({ name: "Soot", color: "#1a0c07", emissive: "#5a1c08", emissiveIntensity: 0.6, roughness: 1 });
  const ember = new THREE.MeshStandardMaterial({ name: "Ember", color: "#2a0d05", emissive: "#ff6a1a", emissiveIntensity: 2 });
  const flame = new THREE.MeshStandardMaterial({ name: "Flame", color: "#000000", emissive: "#ff7a1a", emissiveIntensity: 3, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const plaque = new THREE.MeshPhysicalMaterial({ name: "Enamel_Flour", color: "#fbf6ec", clearcoat: 1, roughness: 0.3 });
  const ink = new THREE.MeshStandardMaterial({ name: "Ink", color: "#2a1a13", roughness: 0.5 });
  const hit = new THREE.MeshBasicMaterial({ name: "HitArea", transparent: true, opacity: 0, depthWrite: false });

  add("Oven_Plinth", new THREE.BoxGeometry(3.6, 0.96, 3), tile, [0, 0.48, 0]);
  add("Oven_Ledge", new THREE.BoxGeometry(3.7, 0.06, 0.5), ink, [0, 0.98, 1.38]);
  add("Oven_Dome", new THREE.SphereGeometry(1.75, seg, seg / 2, Math.PI / 2 + GAP, Math.PI * 2 - GAP * 2, 0, Math.PI / 2), brick, [0, 1, 0]);
  add("Oven_Crown", new THREE.SphereGeometry(1.75, 12, 8, Math.PI / 2 - GAP, GAP * 2, 0, 0.56), brick, [0, 1, 0]);
  add("Oven_Flue", new THREE.CylinderGeometry(0.24, 0.3, 2.7, seg / 2), copper, [0, 3.9, -0.3]);
  add("Oven_Hood", new THREE.CylinderGeometry(0.42, 0.55, 0.22, seg / 2), copper, [0, 2.62, -0.3]);

  const front = new THREE.Group();
  front.name = "Oven_Front";
  front.position.set(0, 1, 1.55);
  root.add(front);
  const arch = new THREE.Shape();
  arch.moveTo(-1, 0); arch.lineTo(-1, 0.55); arch.absarc(0, 0.55, 1, Math.PI, 0, true); arch.lineTo(1, 0);
  arch.lineTo(0.72, 0); arch.lineTo(0.72, 0.55); arch.absarc(0, 0.55, 0.72, 0, Math.PI, false); arch.lineTo(-0.72, 0);
  add("Oven_Arch", new THREE.ExtrudeGeometry(arch, { depth: 0.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: detail === "lod0" ? 24 : 10 }), enamelCrust, [0, 0, 0], front);
  const mouth = new THREE.Shape();
  mouth.moveTo(-0.72, 0); mouth.lineTo(-0.72, 0.55); mouth.absarc(0, 0.55, 0.72, Math.PI, 0, true); mouth.lineTo(0.72, 0); mouth.lineTo(-0.72, 0);
  add("Oven_Mouth", new THREE.ShapeGeometry(mouth, 16), hit, [0, 0, 0.24], front);
  add("Oven_Cavity", inwardBox(1.44, 1.24, 1.3), soot, [0, 0.62, -0.62], front);
  const bed = add("Oven_FireBed", new THREE.CircleGeometry(0.34, 20), ember, [-0.38, 0.03, -1], front);
  bed.rotation.x = -Math.PI / 2;

  const flames = new THREE.Group();
  flames.name = "Oven_Flames";
  flames.position.set(-0.42, 0.02, -1.05);
  front.add(flames);
  [-0.16, -0.05, 0.06, 0.15].forEach((x, i) => {
    add(`Oven_Flame_${i}`, new THREE.ConeGeometry(0.08 + (i % 2) * 0.03, 0.38 + (i % 3) * 0.1, 10, 1, true), flame, [x, 0.22, (i % 2) * 0.12], flames);
  });

  const plaqueGroup = new THREE.Group();
  plaqueGroup.name = "Oven_Plaque";
  plaqueGroup.position.set(0, 2.15, 1.42);
  plaqueGroup.rotation.x = -0.35;
  root.add(plaqueGroup);
  add("Oven_PlaqueBoard", new THREE.BoxGeometry(1.25, 0.38, 0.04), plaque, [0, 0, 0], plaqueGroup);

  // fire_loop: flames breathe at different rates (looped by the runtime).
  const times = [0, 0.4, 0.8, 1.2, 1.6, 2];
  const tracks = [0, 1, 2, 3].map((i) => new THREE.VectorKeyframeTrack(
    `Oven_Flame_${i}.scale`, times,
    times.flatMap((t) => { const k = 1 + Math.sin(t * Math.PI * (1 + i * 0.35) + i) * 0.2; return [1, k, 1]; }),
  ));
  return { root, clips: [new THREE.AnimationClip("fire_loop", 2, tracks)] };
}

/** A box whose faces point inward (flipped winding and normals), seen from inside only. */
function inwardBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = pos.getComponent(i + 1, k), b = pos.getComponent(i + 2, k);
      pos.setComponent(i + 1, k, b); pos.setComponent(i + 2, k, a);
    }
  }
  g.computeVertexNormals();
  return g;
}
