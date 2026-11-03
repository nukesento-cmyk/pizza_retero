import * as THREE from "three";

/**
 * The chef: a stylised, original character, rigged as a node hierarchy with
 * pivots at the joints so the clips export as plain TRS tracks.
 *   Chef · Chef_Body · Chef_Head · Chef_ArmL · Chef_ArmR · …
 * Clips: idle (loop), bake (loop, arms forward with the peel), celebrate (loop, wave).
 */
export function buildChef(detail: "lod0" | "lod1" = "lod0") {
  const s = detail === "lod0" ? 1 : 0.5;
  const seg = (n: number) => Math.max(6, Math.round(n * s));
  const root = new THREE.Group(); root.name = "Chef";
  const body = new THREE.Group(); body.name = "Chef_Body"; root.add(body);

  const white = new THREE.MeshStandardMaterial({ name: "Chef_White", color: "#f7f1e6", roughness: 0.78 });
  const skin = new THREE.MeshStandardMaterial({ name: "Chef_Skin", color: "#8d5a3b", roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ name: "Chef_Trousers", color: "#2a1a13", roughness: 0.8 });
  const apron = new THREE.MeshStandardMaterial({ name: "Chef_Apron", color: "#c8402b", roughness: 0.7 });
  const scarf = new THREE.MeshStandardMaterial({ name: "Chef_Scarf", color: "#e7a33e", roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ name: "Chef_Eye", color: "#15100c", roughness: 0.3 });
  const lip = new THREE.MeshStandardMaterial({ name: "Chef_Mouth", color: "#5a2212", roughness: 0.6 });

  const mesh = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], parent: THREE.Object3D, rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(...pos); if (rot) m.rotation.set(...rot); parent.add(m); return m;
  };

  [-0.12, 0.12].forEach((x, i) => mesh(`Chef_Leg${i ? "R" : "L"}`, new THREE.CapsuleGeometry(0.085, 0.62, 4, seg(12)), dark, [x, 0.42, 0], body));
  mesh("Chef_Jacket", new THREE.CapsuleGeometry(0.27, 0.55, 6, seg(20)), white, [0, 1.12, 0], body);
  mesh("Chef_ApronMesh", new THREE.BoxGeometry(0.46, 0.62, 0.04), apron, [0, 0.98, 0.22], body);
  mesh("Chef_Neckerchief", new THREE.TorusGeometry(0.13, 0.04, 6, seg(20)), scarf, [0, 1.5, 0.05], body, [Math.PI / 2, 0, 0]);

  const head = new THREE.Group(); head.name = "Chef_Head"; head.position.set(0, 1.74, 0); body.add(head);
  mesh("Chef_Face", new THREE.SphereGeometry(0.2, seg(24), seg(18)), skin, [0, 0, 0], head);
  [-0.07, 0.07].forEach((x, i) => mesh(`Chef_Eye${i ? "R" : "L"}`, new THREE.SphereGeometry(0.022, 8, 6), eye, [x, 0.03, 0.18], head));
  mesh("Chef_Smile", new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI), lip, [0, -0.04, 0.19], head, [0.2, 0, Math.PI]);
  mesh("Chef_ToqueBand", new THREE.CylinderGeometry(0.17, 0.19, 0.22, seg(24)), white, [0, 0.24, 0], head);
  ([[-0.09, 0], [0.09, 0], [0, 0.08], [0, -0.08]] as const).forEach(([x, z], i) => mesh(`Chef_ToquePuff_${i}`, new THREE.SphereGeometry(0.13, seg(16), seg(12)), white, [x, 0.4, z], head));

  const arm = (side: "L" | "R", x: number) => {
    const pivot = new THREE.Group(); pivot.name = `Chef_Arm${side}`; pivot.position.set(x, 1.38, 0); body.add(pivot);
    mesh(`Chef_Sleeve${side}`, new THREE.CapsuleGeometry(0.075, 0.42, 4, seg(12)), white, [0, -0.28, 0], pivot);
    mesh(`Chef_Hand${side}`, new THREE.SphereGeometry(0.07, seg(12), seg(10)), skin, [0, -0.6, 0], pivot);
  };
  arm("L", -0.33); arm("R", 0.33);

  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
  const rot = (name: string, times: number[], eulers: [number, number?, number?][]) =>
    new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, eulers.flatMap(([x, y, z]) => q(x, y ?? 0, z ?? 0)));
  const bob = (times: number[], ys: number[]) => new THREE.VectorKeyframeTrack("Chef_Body.position", times, ys.flatMap((y) => [0, y, 0]));

  const T = [0, 1, 2, 3, 4];
  const idle = new THREE.AnimationClip("idle", 4, [
    bob(T, [0, 0.015, 0, 0.015, 0]),
    rot("Chef_Head", T, [[0, 0, 0.06], [0, 0.1, 0], [0, 0, -0.06], [0, -0.1, 0], [0, 0, 0.06]]),
    rot("Chef_ArmR", T, [[-0.15], [-0.1], [-0.15], [-0.2], [-0.15]]),
    rot("Chef_ArmL", T, [[-0.1], [-0.15], [-0.1], [-0.05], [-0.1]]),
  ]);
  const B = [0, 0.6, 1.2];
  const bake = new THREE.AnimationClip("bake", 1.2, [
    rot("Chef_ArmR", B, [[-1.25], [-1.35], [-1.25]]),
    rot("Chef_ArmL", B, [[-1.1], [-1.2], [-1.1]]),
    rot("Chef_Head", B, [[0.15], [0.2], [0.15]]),
    bob(B, [0, 0.01, 0]),
  ]);
  const W = [0, 0.25, 0.5, 0.75, 1];
  const celebrate = new THREE.AnimationClip("celebrate", 1, [
    rot("Chef_ArmR", W, [[-2.6, 0, 0.25], [-2.6, 0, -0.25], [-2.6, 0, 0.25], [-2.6, 0, -0.25], [-2.6, 0, 0.25]]),
    rot("Chef_ArmL", W, [[-0.1], [-0.15], [-0.1], [-0.15], [-0.1]]),
    rot("Chef_Head", W, [[0, 0, 0.1], [0, 0, -0.05], [0, 0, 0.1], [0, 0, -0.05], [0, 0, 0.1]]),
    bob(W, [0, 0.04, 0, 0.04, 0]),
  ]);
  return { root, clips: [idle, bake, celebrate] };
}
