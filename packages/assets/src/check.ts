/** CI budget check for shipped 3D assets (docs/3D_KITCHEN.md §5). */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../../../apps/web/public/models");
const BUDGET = { totalBytes: 6 * 1024 * 1024, perModelBytes: 2 * 1024 * 1024, lod1Triangles: 15_000 };

const manifest = JSON.parse(await readFile(path.join(DIR, "manifest.json"), "utf8")) as { models: Record<string, { bytes: number; triangles: number; clips: string[] }> };
let total = 0;
const problems: string[] = [];
for (const [file, m] of Object.entries(manifest.models)) {
  const s = await stat(path.join(DIR, file)).catch(() => null);
  if (!s) { problems.push(`${file}: missing`); continue; }
  if (s.size !== m.bytes) problems.push(`${file}: size changed (${s.size} vs manifest ${m.bytes}); rebuild assets`);
  if (s.size > BUDGET.perModelBytes) problems.push(`${file}: ${s.size} bytes exceeds ${BUDGET.perModelBytes}`);
  if (file.includes("-lod1") && m.triangles > BUDGET.lod1Triangles) problems.push(`${file}: ${m.triangles} triangles exceeds ${BUDGET.lod1Triangles}`);
  total += s.size;
}
if (!manifest.models["chef.glb"]?.clips.includes("celebrate")) problems.push("chef.glb: missing celebrate clip");
if (total > BUDGET.totalBytes) problems.push(`total ${total} bytes exceeds ${BUDGET.totalBytes}`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`assets ok: ${Object.keys(manifest.models).length} files, ${(total / 1024).toFixed(0)} KB`);
