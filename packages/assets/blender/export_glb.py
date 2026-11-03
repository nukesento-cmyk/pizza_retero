"""
Blender → Retero GLB export (run headless):

    blender kitchen.blend --background --python packages/assets/blender/export_glb.py -- \
        --collection Oven --out packages/assets/build/raw/oven.glb

Then optimise with the same pipeline as the authored assets:

    pnpm --filter @retero/assets build   # (add the raw file to MODELS in src/build.ts)

Contract (docs/3D_KITCHEN.md §5):
  * 1 Blender unit = 1 metre, Y-up on export, transforms applied.
  * Object names match the runtime contract (Oven_Mouth, Oven_Flames, Chef_ArmR …).
  * Actions named exactly: fire_loop | idle | bake | celebrate (NLA strips or actions).
  * Materials named as in the authored assets; emissive strength via the
    Principled BSDF emission strength (exported as KHR_materials_emissive_strength).

NOTE: written against the Blender 4.x glTF exporter API; it has not been run
in this repository's environment (Blender isn't installed locally).
"""
import argparse
import sys

import bpy  # type: ignore[import-not-found]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--collection", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


REQUIRED = {
    "Oven": ["Oven_Mouth", "Oven_Flames", "Oven_FireBed"],
    "Chef": ["Chef_Body", "Chef_Head", "Chef_ArmL", "Chef_ArmR"],
}
CLIPS = {"Oven": ["fire_loop"], "Chef": ["idle", "bake", "celebrate"]}


def main():
    args = parse_args()
    col = bpy.data.collections.get(args.collection)
    if col is None:
        raise SystemExit(f"collection {args.collection!r} not found")

    names = {o.name for o in col.all_objects}
    missing = [n for n in REQUIRED.get(args.collection, []) if n not in names]
    if missing:
        raise SystemExit(f"missing required objects: {missing}")
    actions = {a.name for a in bpy.data.actions}
    missing_clips = [c for c in CLIPS.get(args.collection, []) if c not in actions]
    if missing_clips:
        raise SystemExit(f"missing required actions: {missing_clips}")

    bpy.ops.object.select_all(action="DESELECT")
    for o in col.all_objects:
        o.select_set(True)
        if o.type == "MESH":
            bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.export_scene.gltf(
        filepath=args.out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=False,
        export_force_sampling=True,
        export_draco_mesh_compression_enable=False,  # compression happens in the pipeline (meshopt)
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_extras=True,
    )
    print(f"exported {args.collection} → {args.out}")


main()
