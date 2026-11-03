# The 3D Kitchen: Direction, Architecture, Status

The brief (`correctUI.md`) replaces the conventional storefront with a
**walk-through retro kitchen**. This document records the research, the
visual direction, how the prototype is built, and exactly what is still a
placeholder.

---

## 1. Research summary

| Question | Finding | What we did |
|---|---|---|
| How to drive a camera from scroll in R3F? | Common patterns: (a) GSAP ScrollTrigger in an effect tweening the camera, (b) drei `ScrollControls`/`useScroll` read in `useFrame`. Forum guidance: give the camera a real path *and* an aim target, not just a position tween. | ScrollTrigger writes a progress number to a plain object. A `CameraRig` reads it in `useFrame` and samples **two Catmull-Rom splines** (position and look-at) through every station's pose, then damps toward them. No React re-render per frame. ScrollTrigger's **snap** makes the camera dwell at stations. |
| Station snapping? | No canonical recipe found. | Track height = 8 × 100svh, so station *i* sits at progress *i*/7. Snap to `1/(n-1)`. `nav.goTo(i)` uses ScrollToPlugin, so scroll, clicks, the rail and the keyboard all drive the **same** state. |
| UI inside a 3D scene? | drei `<Html>` docs: `occlude`, `transform`, `distanceFactor`. A March 2026 forum thread reports `distanceFactor` scale freezing during camera transitions. | Station tags use `<Html center>` (screen-space, no `distanceFactor`). **Panels are normal DOM** for accessibility and Motion transitions, positioned each frame from the **projected 3D anchor** with a leader line, so they read as attached to the station without living inside the canvas. |
| Asset pipeline | Blender: apply transforms, 1 unit = 1 m, export GLB. Optimise with gltf-transform: resize textures, then Meshopt (fast decode) or Draco (smaller, heavier decoder); KTX2 for GPU-friendly textures on phones; set texture format explicitly. | See §5. Meshopt is the default and Draco is opt-in; `useGLTF` loads both. |

Sources:
[GSAP forum: ScrollTrigger with R3F](https://greensock.com/forums/topic/29651-scroll-trigger-with-react-three-fiber/) ·
[GSAP forum: scroll-based three.js](https://gsap.com/community/forums/topic/27515-scroll-based-animate-using-scrolltrigger-with-threejs/) ·
[drei Html docs](https://drei.docs.pmnd.rs/misc/html) ·
[drei Html source](https://github.com/pmndrs/drei/blob/3569f065bc12cc6bb2ca80164b35ebcc60dc579f/src/web/Html.tsx) ·
[three.js forum: distanceFactor during transitions](https://discourse.threejs.org/t/r3f-react-three-drei-html-distancefactor-scaling-breaks-during-camera-transitions/90429.md) ·
[Optimize GLB for web](https://app.cinevva.com/guides/optimize-glb-for-web) ·
[Unity glTF export guidelines (KTX2 + Draco)](https://docs.unity.com/en-us/asset-transformer-sdk/2026.4/manual/sdktips/export-guidelines)

Not yet done: a structured review of Awwwards/Codrops showcase sites and Three.js Journey material. That belongs to the art-direction pass with the Blender artist (open question Q10).

## 2. Visual direction

*After-Hours Parlour* (see `DESIGN_SYSTEM.md`), translated to 3D:

- **Warm, low-key lighting.** The oven is the key light (flickering orange point light), enamel pendants give pools of tungsten, and the hemisphere fill is warm. ACES tone mapping at 0.92 exposure.
- **Neon is the only thing that blooms.** Neon tubes and bulbs use HDR colours above 1.0 with `toneMapped={false}`, and Bloom's threshold is 1.0, so everything else stays crisp.
- **Wet checkerboard floor** (reflector on capable devices), tiled wainscot with the sauce/oven/crust racing stripe, terrazzo counters, clear-coated enamel cabinets.
- **The pizza travels with you.** Bench → pots → line → island → oven → stand. It gains layers as you go and browns as it bakes. This is the narrative spine.
- **Direct interaction over menus.** Pick a dough ball (size), click a pot (sauce), click tins (toppings), click the oven mouth (bake). Every 3D action has a DOM equivalent.

## 3. Architecture

```
apps/web/src/kitchen/
├── stations.ts            8 stations: camera pose, look target, pizza spot, tag + panel anchors
├── builder.ts             PREVIEW options + pure helpers (no prices)
├── store.ts               tiny external store (React) + `runtime` (per-frame, no React)
├── actions.ts             bake sequence (GSAP tween on runtime.bakeT)
├── KitchenExperience.tsx  scroll track, ScrollTrigger, rail, panels, loader, fallbacks
├── ui/panels.tsx          per-station contextual panels (DOM, accessible)
└── scene/                 R3F only
    ├── KitchenCanvas.tsx  canvas, lights, offline Environment, post-processing, quality tiers
    ├── CameraRig.tsx      spline camera + pointer parallax + portrait framing
    ├── AnchorProjector.tsx projects the active panel anchor to screen space
    ├── Room / Oven / Stations / Pizza / Chef / Signage / StationTags
    └── textures.ts        procedural canvas textures (stand-ins for the texture set)
```

**Data flow.** Scroll → `runtime.progress` (camera, pizza position, layer
visibility in `useFrame`) and `kitchen.active` (panels, tags, rail via React).
The 3D layer only *reads* builder state; it is never the source of truth for
products, prices, stock or orders (README §9).

## 4. Accessibility, motion and fallbacks

| Concern | Behaviour |
|---|---|
| Keyboard | Arrow keys / PageUp/PageDown / Home/End step between stations; every 3D action has a DOM button/radio; the rail is a `<nav>` with `aria-current="step"`. |
| Screen readers | Canvas is `aria-hidden`; panels are labelled regions; station changes announced via `aria-live`. |
| Reduced motion | Camera and pizza jump instead of flying, the bake shortens to ~1s, parallax/flicker/idle animation off, snap is instant. |
| No WebGL | Detected on mount; renders the 2D storefront (same stations, same data). Also used in `<noscript>`. |
| "Simple view" | Visitors can opt out of 3D; the choice is remembered per browser. |
| Mobile / low power | `quality: low` (≤820px, coarse pointer, ≤4 cores, or PerformanceMonitor decline): no reflector, no shadows, lower DPR and bloom. Panels become a bottom sheet (≤44svh); the camera steps back and widens FOV in portrait. |

## 5. Asset pipeline (Phase 6)

```
packages/assets/src/models/*.ts  ─┐  (or Blender: blender/export_glb.py)
                                  ├─► GLTFExporter (headless) ─► gltf-transform:
                                  │     dedup · prune · weld · quantize ·
                                  │     textures → WebP (512 / 256) · meshopt
                                  └─► apps/web/public/models/{name}.glb, {name}-lod1.glb + manifest.json
runtime: useGLTF(meshopt) → <Detailed> LOD → useAnimations crossfades
budget gate: pnpm --filter @retero/assets check (CI)
```

**Shipped as GLB now:** the oven (brick texture, inward-facing fire cavity,
`fire_loop`) and the chef (`idle`, `bake`, `celebrate` clips, crossfaded by
the oven state), each with LOD0 + LOD1, 175 KB total. If a GLB fails to load,
an error boundary swaps in the procedural version, so the scene never breaks.

**Still procedural (planned GLB slots):**

| Component | GLB (planned) | Animation clips |
|---|---|---|
| `Room` | `kitchen-interior.glb` (walls, counters, shelves, baked lightmap) | — |
| `Oven` | `oven.glb` (dome, arch, flue, door cavity) | `fire_loop` |
| `Chef` | `chef.glb` (rigged) | `idle`, `bake`, `celebrate` |
| `Stations` | `dough-bench.glb`, `sauce-pots.glb`, `topping-tins.glb` | `lift` |
| `Pizza` | `pizza-kit.glb` (base, rim LODs, topping instances) | — |

Rules: 1 unit = 1 m, transforms applied, Y-up on export, named nodes matching
station ids, ≤ 2048² textures (1024² on low tier), lightmaps baked for the
static set. Optimise with
`gltf-transform optimize in.glb out.glb --texture-compress ktx2 --compress meshopt`,
keep LOD0/LOD1, and load with drei `useGLTF` (Meshopt/Draco decoders) under
`Suspense` so the existing loader covers it. Budget: ≤ 6 MB first load on
desktop, ≤ 3 MB on the low tier.

## 6. Status: done vs placeholder

| Done (working, tested) | Placeholder / pending |
|---|---|
| Scroll-driven camera through 8 stations with snap | Blender-modelled art: hero assets are GLB with clips, but authored in code; an artist's Blender export drops in via `blender/export_glb.py` (script not yet run, as Blender isn't installed locally) |
| Direct 3D interaction: dough balls, sauce pots, topping tins, oven mouth, station tags | Builder options are **preview** values (Phase 3 catalogue replaces them) |
| Live pizza preview that travels, layers and bakes | Prices: none shown by design; the server pricing engine arrives in Phase 3 |
| Bake sequence (slide in, flare, brown, slide out, auto-reveal) | Real food photography: a slot is reserved on the reveal panel until menu products exist |
| Contextual panels anchored to stations, Motion transitions | Ordering: the button is disabled until Phase 4 checkout; WhatsApp prefill works when the brand sets a number |
| Keyboard, reduced motion, no-WebGL fallback, simple view, mobile sheet | Audio (oven crackle, bell), haptics |
| E2E: full journey on desktop + mobile, fallback, rail/keyboard | Performance budget measured on real mid-range Android hardware |
