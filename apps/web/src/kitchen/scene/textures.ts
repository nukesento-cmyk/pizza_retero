"use client";

import * as THREE from "three";

/**
 * Procedural canvas textures. Stand-ins until the Blender texture set
 * lands (assets/README.md): same UV conventions, so swapping is a material change.
 */
function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  return tex;
}

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const cache = new Map<string, THREE.Texture>();
const memo = (key: string, make: () => THREE.Texture) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

export const checkerFloor = () =>
  memo("checker", () =>
    canvasTexture(512, (ctx, s) => {
      const n = 4, q = s / n;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          ctx.fillStyle = (x + y) % 2 ? "#221611" : "#efe2c8";
          ctx.fillRect(x * q, y * q, q, q);
        }
      // grout + scuffs so it reads as a used floor
      ctx.strokeStyle = "rgba(0,0,0,.25)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(i * q, 0); ctx.lineTo(i * q, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * q); ctx.lineTo(s, i * q); ctx.stroke();
      }
      const r = rng(7);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(120,90,60,${r() * 0.08})`;
        ctx.fillRect(r() * s, r() * s, r() * 6, r() * 2);
      }
    }, [10, 10]),
  );

export const wallTiles = () =>
  memo("tiles", () =>
    canvasTexture(256, (ctx, s) => {
      const n = 4, q = s / n;
      ctx.fillStyle = "#cdbb98";
      ctx.fillRect(0, 0, s, s);
      const r = rng(3);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const shade = 236 - Math.floor(r() * 10);
          ctx.fillStyle = `rgb(${shade},${shade - 12},${shade - 30})`;
          ctx.fillRect(x * q + 2, y * q + 2, q - 4, q - 4);
        }
    }, [16, 2]),
  );

export const terrazzo = () =>
  memo("terrazzo", () =>
    canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(0, 0, s, s);
      const r = rng(11);
      const chips = ["#c8402b", "#e7a33e", "#2e6b52", "#2a1a13", "#d9c6a5", "#8f2a1c"];
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = chips[Math.floor(r() * chips.length)]!;
        ctx.beginPath();
        const x = r() * s, y = r() * s, rad = 1 + r() * 5;
        ctx.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }, [2, 1]),
  );

export const bricks = () =>
  memo("bricks", () =>
    canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = "#4a1d13";
      ctx.fillRect(0, 0, s, s);
      const rows = 16, bw = s / 6, bh = s / rows;
      const r = rng(5);
      for (let y = 0; y < rows; y++)
        for (let x = -1; x < 7; x++) {
          const off = y % 2 ? bw / 2 : 0;
          const g = 0.75 + r() * 0.35;
          ctx.fillStyle = `rgb(${Math.floor(165 * g)},${Math.floor(58 * g)},${Math.floor(38 * g)})`;
          ctx.fillRect(x * bw + off + 2, y * bh + 2, bw - 4, bh - 4);
        }
      // soot gradient near the top
      const grd = ctx.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, "rgba(20,12,8,.55)");
      grd.addColorStop(0.5, "rgba(20,12,8,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, s, s);
    }, [3, 1.5]),
  );

export const wood = () =>
  memo("wood", () =>
    canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = "#a8743a";
      ctx.fillRect(0, 0, s, s);
      const r = rng(9);
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(80,45,20,${0.15 + r() * 0.2})`;
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        const y = r() * s;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y + r() * 8, s * 0.7, y - r() * 8, s, y);
        ctx.stroke();
      }
    }),
  );

/** A printed poster for the story wall. */
export const poster = (kind: "since" | "sunburst" | "slice") =>
  memo(`poster-${kind}`, () =>
    canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = "#f6ecd9";
      ctx.fillRect(0, 0, s, s);
      if (kind === "sunburst") {
        const cx = s / 2, cy = s * 0.62;
        const cols = ["#c8402b", "#f06a2e", "#e7a33e"];
        for (let i = 0; i < 18; i++) {
          ctx.fillStyle = cols[i % 3]!;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, s, (i / 18) * Math.PI * 2, ((i + 0.5) / 18) * Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#2a1a13";
        ctx.font = "bold 64px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("HOT & FRESH", cx, 90);
      } else if (kind === "since") {
        ctx.fillStyle = "#2a1a13";
        ctx.fillRect(24, 24, s - 48, s - 48);
        ctx.fillStyle = "#e7a33e";
        ctx.textAlign = "center";
        ctx.font = "italic 54px Georgia, serif";
        ctx.fillText("the parlour", s / 2, s * 0.38);
        ctx.font = "bold 120px Georgia, serif";
        ctx.fillStyle = "#c8402b";
        ctx.fillText("EST.", s / 2, s * 0.62);
        ctx.font = "bold 72px Georgia, serif";
        ctx.fillStyle = "#f6ecd9";
        ctx.fillText("2026", s / 2, s * 0.8);
      } else {
        ctx.fillStyle = "#2e6b52";
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = "#e7a33e";
        ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.15); ctx.lineTo(s * 0.85, s * 0.8); ctx.lineTo(s * 0.15, s * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#c8402b";
        for (const [x, y] of [[0.45, 0.5], [0.58, 0.65], [0.38, 0.7]] as const) {
          ctx.beginPath(); ctx.arc(s * x, s * y, 22, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "#f6ecd9";
        ctx.font = "bold 56px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("BY THE SLICE", s / 2, s * 0.94);
      }
    }),
  );
