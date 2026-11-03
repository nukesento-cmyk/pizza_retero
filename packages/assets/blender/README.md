# Blender sources

The shipped GLBs are currently **authored in code** (`packages/assets/src/models`).
They are real glTF assets with materials, baked textures and animation clips, and
they go through the production optimisation pipeline. When an artist delivers
Blender sources, export them with `export_glb.py` and they replace the authored
models one for one, because the names below are the runtime contract.

| Asset | Required objects | Required actions |
|---|---|---|
| Oven | `Oven_Mouth` (hit area; can be hidden), `Oven_Flames` (group of flame meshes), `Oven_FireBed`, materials `Flame`, `Ember`, `Brick` | `fire_loop` |
| Chef | `Chef_Body`, `Chef_Head`, `Chef_ArmL`, `Chef_ArmR` (pivots at shoulders) | `idle`, `bake`, `celebrate` |

Budgets (enforced by `pnpm --filter @retero/assets check` in CI): ≤ 2 MB per
file, ≤ 6 MB total, LOD1 ≤ 15k triangles. Provide an LOD1 at roughly 40% of the
triangles, or let the pipeline's simplifier generate one.

Art direction: `docs/DESIGN_SYSTEM.md` §6.
