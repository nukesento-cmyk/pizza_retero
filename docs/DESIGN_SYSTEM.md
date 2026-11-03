# Design System — "After-Hours Parlour"

The concept: a **late-1970s pizza parlour, ten minutes before opening**. The
oven is already glowing, the enamel signs are lit, flour is on the counter and
the floor is still wet-shiny checkerboard. The storefront should feel like
walking into that room. It shouldn't feel like browsing a template.

The ops side is the **same building, back of house**. It uses the same palette
and type, but is calm, dense and fast. The ticket rail stays and the neon goes.

---

## 1. Palette

Named after things in the kitchen. Tokens live in
`apps/web/src/app/globals.css` (`@theme`).

| Token | Hex | Role |
|---|---|---|
| `sauce` | `#C8402B` | Primary. CTAs, the main sign, active states. San Marzano red. |
| `sauce-deep` | `#8F2A1C` | Pressed states, text on cream when red is needed. |
| `crust` | `#E7A33E` | Accent. Prices, highlights, the "golden" moment. |
| `oven` | `#F06A2E` | Glow. Only for light: hover halos, oven mouth, live badges. |
| `basil` | `#2E6B52` | Secondary. Veg/dietary marks, success, "open now". |
| `dough` | `#F6ECD9` | Light surface (default storefront background). |
| `flour` | `#FBF6EC` | Raised light surface (cards, tickets). |
| `tile` | `#E9D9BC` | Checkerboard light square, dividers. |
| `espresso` | `#2A1A13` | Ink. Body text on light, dark-mode background. |
| `char` | `#15100C` | Deepest dark: night storefront, 3D scene fog. |

Rules:
- **Never place `oven` text on `dough`**. It fails contrast. `oven` is light, not ink.
- Text on `sauce` is always `flour`. Text on `crust` is always `espresso`.
- Dark mode swaps surfaces (`char` / `espresso`) and keeps the brand hues. Red
  and mustard stay red and mustard, since the sign doesn't change colour at night.
- Kitchen status colours (ops) come from the same palette:
  `NEW` crust · `ACCEPTED` espresso outline · `PREPARING` basil · `BAKING` oven ·
  `READY` sauce · `COMPLETED / DELIVERED / COLLECTED` muted tile.

## 2. Typography

| Role | Family | Use |
|---|---|---|
| Display | **Shrikhand** | Signs, hero words, station titles. Never below 28px, never for paragraphs. |
| Heading / menu | **Fraunces** (soft, high optical size) | Section heads, product names, the menu-board feel. |
| Body / UI | **Work Sans** | Everything readable. Ops uses only this and mono. |
| Ticket | **IBM Plex Mono** | Prices, order numbers, kitchen tickets, receipts, M-Pesa refs. |

All loaded through `next/font/google` (self-hosted at build, no runtime Google
request). Prices always use tabular numerals (`font-variant-numeric: tabular-nums`).

## 3. Motifs (use deliberately, one or two per screen)

- **Sunburst stripes**: three bands `sauce / oven / crust`, the 70s racing stripe.
  Used as a horizon line, never as wallpaper.
- **Checkerboard**: `tile`/`dough`, perspective-skewed as a floor, flat as a band.
- **Enamel sign**: rounded rect, thick outer stroke, thin inner keyline, slight
  inner shadow. Used for primary buttons and station labels.
- **Order ticket**: `flour` paper, mono type, zigzag torn bottom edge. Cart,
  quote, receipt, kitchen tickets.
- **Grain**: 4% SVG noise over large surfaces so flat colour feels printed.
- **Warm light**: radial `oven` glow behind focal objects, as if the oven light
  falls on them.

## 4. Motion

- Storefront: GSAP ScrollTrigger drives the camera between the 8 stations;
  Motion handles UI transitions (cart drawer, builder steps). Easing feels
  like weight: `cubic-bezier(.2,.8,.2,1)` for arrivals, quick settle and no bounce.
  The one exception is the pizza landing on the peel, which gets a single soft
  overshoot.
- `prefers-reduced-motion`: scroll still moves between stations, but as
  crossfades. No camera flight, no parallax.
- Ops: 120ms fades only. Nothing moves that a busy cook didn't ask to move.

## 5. Spacing, shape, elevation

- 4px base grid. Section rhythm 96 / 64 / 40px (desktop / tablet / phone).
- Radii: `sign` 18px, `card` 12px, `chip` 999px. Tickets have square tops.
- Elevation is **printed, not floating**: hard offset shadows
  (`4px 4px 0 espresso`) on the storefront, hairline borders in ops.

## 6. The 3D kitchen (Phase 6 art direction)

- Low-to-mid poly, hand-painted feel, **baked lighting** (lightmaps) plus one
  dynamic warm point light at the oven mouth. Cheap on mobile, rich in look.
- Materials: enamel (glossy, chipped edges), terrazzo counter, copper hood,
  cream tiles with dark grout, warm tungsten bulbs.
- The chef character is stylised (rounded, no uncanny realism) with a
  moustache-free, original design and idle / toss / slide-to-oven clips.
- Real photography appears **inside** the scene as the menu board and the
  "finished pizza reveal". The 3D pizza is the experience and the photo is the truth.
- Fallback (no WebGL / low-power / reduced data): an illustrated 2D parlour
  using the same palette, with station sections in the same order.

## 7. Ops (admin) principles

- Density over decoration. 14px base, 32px row height, keyboard first.
- The **ticket rail** is the main kitchen layout: columns by status, cards are
  tickets with the elapsed timer in mono.
- Colour only carries status. No gradients, no grain, no display font
  except the brand mark in the top-left.
