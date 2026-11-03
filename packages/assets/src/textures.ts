import * as THREE from "three";
import { encodePng, rng } from "./png";

/**
 * Bake a procedural texture into a THREE.Texture whose image is a PNG. The
 * exporter writes the PNG into the GLB; the optimizer converts it to WebP.
 */
function texture(name: string, size: number, paint: (px: (x: number, y: number, r: number, g: number, b: number) => void) => void) {
  const rgba = new Uint8Array(size * size * 4).fill(255);
  paint((x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  });
  const png = encodePng(size, size, rgba);
  // GLTFExporter accepts an image-like object with toDataURL / a canvas; we hand it a PNG via userData.
  const tex = new THREE.Texture();
  tex.name = name;
  tex.userData.png = png;
  tex.userData.size = size;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function brickTexture() {
  const S = 256, rows = 16, bw = S / 6, bh = S / rows;
  const r = rng(5);
  return texture("bricks", S, (px) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, 74, 29, 19); // mortar
    for (let row = 0; row < rows; row++) {
      for (let col = -1; col < 7; col++) {
        const off = row % 2 ? bw / 2 : 0;
        const g = 0.75 + r() * 0.35;
        const soot = 1 - Math.max(0, 1 - (row * bh) / (S * 0.5)) * 0.45;
        const [R, G, B] = [165 * g * soot, 58 * g * soot, 38 * g * soot].map((v) => Math.round(v));
        for (let y = Math.round(row * bh + 1.5); y < Math.round((row + 1) * bh - 1.5); y++)
          for (let x = Math.round(col * bw + off + 1.5); x < Math.round((col + 1) * bw + off - 1.5); x++) px(x, y, R!, G!, B!);
      }
    }
  });
}
