/**
 * Asset pipeline: author → export GLB → optimize → publish + manifest.
 *
 *   pnpm --filter @retero/assets build
 *
 * Authoring happens in three.js (src/models) until the Blender sources land
 * (blender/README.md); Blender exports enter at step 2 with the same names.
 */
import "./node-env";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureTransform } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { buildChef } from "./models/chef";
import { buildOven } from "./models/oven";

const OUT = path.resolve(import.meta.dirname, "../../../apps/web/public/models");

const MODELS = [
  { name: "oven", build: buildOven },
  { name: "chef", build: buildChef },
] as const;

/** Detach procedurally baked textures (GLTFExporter can't encode them headless). */
function detachTextures(root: THREE.Object3D) {
  const textures = new Map<string, { png: Buffer; repeat: [number, number] }>();
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!mat?.map?.userData.png) return;
    textures.set(mat.name, { png: mat.map.userData.png as Buffer, repeat: [mat.map.repeat.x, mat.map.repeat.y] });
    mat.map = null;
  });
  return textures;
}

async function exportGlb(root: THREE.Object3D, clips: THREE.AnimationClip[]): Promise<Uint8Array> {
  const out = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: false });
  return new Uint8Array(out as ArrayBuffer);
}

function attachTextures(doc: Document, textures: Map<string, { png: Buffer; repeat: [number, number] }>) {
  const ext = doc.createExtension(KHRTextureTransform);
  for (const mat of doc.getRoot().listMaterials()) {
    const t = textures.get(mat.getName());
    if (!t) continue;
    const tex = doc.createTexture(`${mat.getName()}_baseColor`).setImage(new Uint8Array(t.png)).setMimeType("image/png");
    mat.setBaseColorTexture(tex);
    mat.getBaseColorTextureInfo()!.setExtension("KHR_texture_transform", ext.createTransform().setScale(t.repeat));
  }
}

function triangles(doc: Document) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    n += (idx ? idx.getCount() : p.getAttribute("POSITION")!.getCount()) / 3;
  }
  return Math.round(n);
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
await mkdir(OUT, { recursive: true });

const manifest: Record<string, unknown> = { generatedAt: new Date().toISOString(), models: {} };
for (const m of MODELS) {
  for (const lod of ["lod0", "lod1"] as const) {
    const { root, clips } = m.build(lod);
    const textures = detachTextures(root);
    const raw = await exportGlb(root, clips);
    const doc = await io.readBinary(raw);
    attachTextures(doc, textures);
    await doc.transform(
      dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(), quantize(),
      textureCompress({ encoder: sharp, targetFormat: "webp", resize: lod === "lod0" ? [512, 512] : [256, 256] }),
      meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    );
    const bytes = await io.writeBinary(doc);
    const file = lod === "lod0" ? `${m.name}.glb` : `${m.name}-lod1.glb`;
    await writeFile(path.join(OUT, file), bytes);
    (manifest.models as Record<string, unknown>)[file] = {
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex").slice(0, 16),
      triangles: triangles(doc),
      clips: doc.getRoot().listAnimations().map((a) => a.getName()),
      nodes: doc.getRoot().listNodes().length,
    };
    console.log(`${file.padEnd(16)} ${(bytes.byteLength / 1024).toFixed(1).padStart(7)} KB  ${String(triangles(doc)).padStart(6)} tris`);
  }
}
await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
