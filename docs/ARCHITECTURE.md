# Retero Pizza Co. — System Architecture

> Status: **living document**. Written during Phase 0 (2026-11-03). Each later phase
> updates the section it touches. Decisions that need owner sign-off are in
> [`DECISIONS.md`](./DECISIONS.md) under *Open questions*.

---

## 1. Repository inspection (starting point)

| Finding | Consequence |
|---|---|
| `pizza_retero/` contained only `README.md` (the master prompt). No code, no schema, no assets. | Greenfield. Nothing to preserve or migrate. |
| The folder sat inside a git repository rooted at the user's home directory (`/Users/mac100`), whose history belongs to an unrelated project (`ecommerce1`). | Initialised a **dedicated git repository** in `pizza_retero/` so this project's history, CI and secrets never mix with the home-level repo. |
| Toolchain on the dev machine: Node 24, pnpm 12, Docker (Colima), Homebrew Postgres 18 (password-protected, not ours). | Local dev/test Postgres runs in Docker on port **54329** to avoid colliding with the Homebrew instance. |
| No Blender CLI, no gltf-transform installed. | 3D asset pipeline (Phase 6) will add `@gltf-transform/cli` as a dev dependency; Blender is an artist-side tool, not a CI dependency. |

---

## 2. System architecture

A **modular monolith**: one deployable Next.js application, one PostgreSQL
database, business logic in framework-free workspace packages.

```
                    ┌──────────────────────────────────────────────────────┐
  brand.com  ─┐     │                apps/web  (Next.js App Router)        │
  nbo.brand ──┼──▶  │  proxy.ts ── host → TenantContext (routing only)     │
  wl.brand  ──┘     │                                                      │
                    │  (storefront)   (account)   (ops)        api/*       │
                    │   retro + 3D     customer    admin/      route       │
                    │   R3F · GSAP     dashboard   kitchen     handlers    │
                    │        │              │          │          │        │
                    │        └──────────────┴────┬─────┴──────────┘        │
                    │                    server actions / handlers         │
                    │                    (thin: parse → authorize → call)  │
                    └────────────────────────────┬─────────────────────────┘
                                                 │
            ┌────────────────────────────────────▼───────────────────────────┐
            │ packages/core — domain modules (no React, no Next)             │
            │  identity · tenancy · rbac · audit │ catalogue · pricing ·     │
            │  (Phase 1)                         │ cart · orders · payments  │
            │                                    │ kitchen · inventory ·     │
            │                                    │ delivery · whatsapp (P3+) │
            └───────────────┬──────────────────────────────┬─────────────────┘
                            │                              │
            ┌───────────────▼──────────┐     ┌─────────────▼──────────────────┐
            │ packages/db  (Drizzle)   │     │ adapters (isolated)            │
            │ schema · migrations ·    │     │  Supabase Auth  · S3 storage   │
            │ withActor() RLS context  │     │  M-Pesa Daraja  · WhatsApp link│
            └───────────────┬──────────┘     └────────────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │ PostgreSQL (RLS on) │
                 └─────────────────────┘
```

### Layer rules (enforced by package boundaries)

1. **`packages/shared`** — pure utilities: `Money` (integer minor units), typed
   errors, Zod env loader, id helpers. Depends on nothing internal.
2. **`packages/db`** — Drizzle schema, migrations, DB client, `withActor()`.
   Knows SQL, knows nothing about HTTP or React.
3. **`packages/core`** — business rules. Every public function takes an
   explicit `Actor` (who is calling) and validates input with Zod. It is the
   *only* layer allowed to make authorization decisions.
4. **`apps/web`** — UI, routing, request parsing, auth session handling, 3D.
   Server actions/handlers are thin: parse → resolve actor → call core.
   The 3D scene reads catalogue data through the same core read models and
   never computes prices or availability.

### Why a monolith (not services)

Single team, single database, strong transactional needs (order + payment +
stock reservation in one transaction). Module boundaries live in packages, so a
module can be extracted later if one genuinely needs independent scaling (the
most likely candidate is the M-Pesa callback ingestor).

### Background work

Phase 0–3 need none. Phase 4 adds a **transactional outbox** table plus a small
worker process (same repo, `apps/worker`) for payment-status polling,
reconciliation and notifications. It's deferred until it's needed, per rule 7
(*avoid unnecessary dependencies*).

---

## 3. Monorepo structure

```
pizza_retero/
├── apps/
│   └── web/                       Next.js 16 · App Router · Tailwind 4
│       ├── src/app/
│       │   ├── (storefront)/      public retro site, 3D kitchen (P6–7)
│       │   ├── (auth)/            sign-in, callback
│       │   ├── (account)/         customer area (P7)
│       │   ├── ops/               all staff dashboards, one shell (P2+)
│       │   └── api/               health, webhooks (M-Pesa P4)
│       ├── src/server/            auth adapter, actor resolution, tenant ctx
│       ├── src/components/        ui/ (shadcn), retro/ (brand components)
│       ├── src/kitchen/           3D kitchen: R3F scene, camera rig, stations, panels (see 3D_KITCHEN.md)
│       └── e2e/                   Playwright
├── packages/
│   ├── shared/                    money, errors, env, ids
│   ├── db/                        drizzle schema, migrations, client, RLS ctx
│   └── core/                      domain modules (identity, tenancy, rbac, audit, …)
├── assets/                        Blender sources + export pipeline (P6)
├── infra/
│   └── docker-compose.yml         local Postgres
├── docs/                          architecture, decisions, design system, runbooks
└── .github/workflows/ci.yml
```

---

## 4. Database entity–relationship design

All money: `bigint` **minor units** (cents) + `char(3)` currency. All ids:
`uuid` (v7-style, time-ordered, generated in app). All tenant tables carry
`brand_id`; branch-scoped tables also carry `branch_id`, with **composite
foreign keys** so a row cannot claim a branch that belongs to a different brand.

### 4.1 Identity & tenancy (Phase 1 — implemented)

```
brands ─┬─< brand_settings (1:1)
        ├─< franchisees ─< branches
        ├─< domains  (→ brand, optional → branch)
        ├─< roles (brand_id NULL = system role) ─< role_permissions >─ permissions
        └─< audit_logs
users ─< memberships  (user × role × scope{platform|brand|franchisee|branch})
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id` (= managed-auth subject), `email`, `phone`, `display_name` | No passwords. Managed auth is the only credential store. |
| `brands` | `slug`, `name`, `status` | Top of the hierarchy. |
| `brand_settings` | `brand_id` PK, `currency`, `timezone`, `whatsapp_number`, `theme` (jsonb, Zod-validated) | Central branding. |
| `franchisees` | `brand_id`, `legal_name`, `trading_name`, `status` | `UNIQUE(id, brand_id)` so children can composite-FK. |
| `branches` | `brand_id`, `franchisee_id`, `slug`, address, `latitude`/`longitude` (numeric), `timezone`, `status` | `FK (franchisee_id, brand_id) → franchisees(id, brand_id)`. |
| `domains` | `hostname` UNIQUE, `brand_id`, `branch_id?`, `is_primary`, `verified_at` | Routing input only. One primary per target → canonical URL. |
| `permissions` | `key` (e.g. `branch.update`) | Seeded from the code catalogue; code is the source of truth. |
| `roles` | `key`, `brand_id?`, `scope_type` | System roles seeded; brand-custom roles possible later. |
| `role_permissions` | `role_id`, `permission_key` | |
| `memberships` | `user_id`, `role_id`, `scope_type`, `brand_id?`, `franchisee_id?`, `branch_id?`, `revoked_at` | CHECK constraint makes scope columns consistent with `scope_type`. |
| `audit_logs` | `actor_user_id`, `action`, `brand_id?`, `branch_id?`, `target_type`, `target_id`, `diff` jsonb, `ip_hash` | Append-only: app role has no UPDATE/DELETE grant. |

### 4.2 Later phases (designed, not built)

```
Catalogue (P3)
  products ─< product_variants (size)          brand-level catalogue
  ingredients ─< allergen links                brand-level
  option_groups (base/crust/sauce/cheese/topping) ─< options ─> ingredient
  product_option_groups (which groups a product allows, min/max)
  branch_products (availability, price override in minor units)
  branch_option_prices (topping price overrides)

Commerce (P4)
  customers (→ users? guest allowed) ─< customer_addresses
  carts ─< cart_items (config jsonb validated against catalogue)
  quotes (server-calculated, signed, expires)  ← client totals never trusted
  orders ─< order_items (frozen product/price snapshot) ─< order_status_history
  payments ─< payment_attempts (STK push, CheckoutRequestID UNIQUE)
           ─< mpesa_callbacks (raw payload persisted before processing)
           ─< refunds
  outbox_events

Operations (P5)
  kitchen_tickets ─< kitchen_ticket_items
  inventory_items (branch × ingredient) ─< stock_movements (signed qty, reason)
  stock_reservations (order-scoped, released on cancel/expiry)
  suppliers
  delivery_zones (polygon or radius + fee schedule)
  delivery_assignments ─< delivery_events

Marketing / content (P5–7)
  promotions ─< coupons ─< coupon_redemptions
  reviews, loyalty_accounts ─< loyalty_ledger
  content_pages, banners, scene_assets (GLB keys in S3, LOD variants)
```

---

## 5. Critical security boundaries

| # | Boundary | Control |
|---|---|---|
| B1 | **Browser → server** | Every mutation goes through a server action or route handler that Zod-parses input. No client-side role checks are trusted; UI hiding is cosmetic. |
| B2 | **Identity** | Supabase Auth issues sessions in httpOnly cookies (`@supabase/ssr`). The server verifies the token with Supabase on every request (`auth.getUser()`), never by decoding the cookie alone. |
| B3 | **Host header → tenant** | `proxy.ts` maps hostname → brand/branch for *routing and rendering only*. Authorization never reads the host. A user with a Westlands membership visiting `nairobi.brand.com` gets no extra rights. |
| B4 | **Application → database (authorization)** | `core` checks `Actor` permissions against the target's scope (`rbac.authorize`). |
| B5 | **Application → database (isolation, defence in depth)** | The runtime DB role `retero_app` is **not** the table owner and has `NOBYPASSRLS`. `withActor()` sets `app.user_id` per transaction (`set_config(..., true)`), and RLS policies on tenant tables call `SECURITY DEFINER` helpers that read memberships. A bug in B4 still cannot leak another franchisee's rows. |
| B6 | **M-Pesa → server** (P4) | Callback URL carries an unguessable per-attempt token. The raw payload is persisted first, then checked against the attempt row and confirmed with a Daraja STK *query* before any order goes to PAID. Processing is idempotent on `CheckoutRequestID`. |
| B7 | **Uploads → storage** (P2+) | Signed upload URLs, MIME and size allow-lists, server-generated keys, tenant-prefixed paths, no public write buckets. |
| B8 | **Secrets** | Env only, validated by Zod at boot; `.env*` git-ignored; sandbox credentials in dev; CI uses GitHub encrypted secrets. |
| B9 | **Audit** | Privileged mutations write `audit_logs` inside the same transaction as the change. The table is append-only at the grant level. |

---

## 6. API contract

Internal calls are **server actions** that call `core`. HTTP endpoints exist only
where something outside the browser session calls in, or where caching matters.
All bodies are JSON and Zod-validated, and errors follow one shape:

```json
{ "error": { "code": "FORBIDDEN", "message": "…", "requestId": "…" } }
```

Codes: `VALIDATION_FAILED` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 ·
`NOT_FOUND` 404 · `CONFLICT` 409 · `RATE_LIMITED` 429 · `INTERNAL` 500.

| Method & path | Phase | Auth | Purpose |
|---|---|---|---|
| `GET /api/health` | 0 ✅ | none | Liveness + DB reachability. |
| `GET /auth/callback` | 1 ✅ | none | Supabase code → session exchange. |
| `GET /api/tenant` | 1 ✅ | none | Resolved brand/branch for current host (public fields only). |
| `GET /api/branches?near=lat,lng` | 2 | none | Branch picker. |
| `GET /api/menu?branch=` | 3 | none | Branch menu read model (prices in minor units). |
| `POST /api/quotes` | 3–4 | optional | Cart → signed server quote `{lines, subtotal, deliveryFee, discount, total, expiresAt}`. |
| `POST /api/orders` | 4 | optional (guest) | Create order from quote id. `Idempotency-Key` header required. |
| `POST /api/orders/:id/pay/mpesa` | 4 | order token | Start STK push. Idempotent per order. |
| `POST /api/webhooks/mpesa/stk/:token` | 4 | Daraja | Callback ingest. Always `200` after persisting. |
| `GET /api/orders/:id/track` | 4–5 | order token / owner | Status timeline (SSE in P5). |
| `POST /api/whatsapp/handoff` | 5 | optional | Creates a draft cart reference and returns a `wa.me` link with prefilled text. |
| Server actions under `/ops/*` | 2–5 | staff | Franchise, branch, staff, menu, kitchen, inventory, delivery admin. |

---

## 7. Implementation roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 Foundation** ✅ | pnpm monorepo, Next.js, shared packages, env, Docker Postgres, Vitest, Playwright, CI, retro design system shell | `pnpm lint typecheck test build e2e` green locally and in CI |
| **1 Identity** ✅ | Drizzle schemas (4.1), versioned migrations, RBAC catalogue, memberships, RLS, `withActor`, Supabase auth adapter, domain resolution, audit log | Cross-tenant RLS tests pass; RBAC unit tests pass |
| **2 Franchise admin** ✅ | `/ops` shell, franchisee/branch CRUD, staff invites, domains (DNS TXT verification), brand settings, operating hours + closures | Brand admin can onboard franchisee → branch → staff end to end |
| **3 Catalogue** ✅ | Products, ingredients, allergens, option groups, branch pricing/availability, **pricing engine**, photo uploads, menu API, starter template | Property tests on pricing; no float anywhere |
| **4 Commerce** ✅ | Cart, quotes, checkout, orders, M-Pesa STK, callbacks (persist → verify → apply), reconciliation, expiry, maker-checker refunds, delivery zones, outbox + worker | Sandbox STK end to end; duplicate/delayed callback tests |
| **5 Operations** ✅ | Kitchen ticket board, order state machine, inventory (reserve/consume/release, waste, counts, suppliers), rider dispatch + delivery events, collection, WhatsApp/phone assisted orders, branch sales report | Concurrency tests on stock |
| **6 3D** ✅ | Kitchen scene, camera rig, 8 interactive stations, fallbacks; GLB pipeline (author → GLTFExporter → gltf-transform meshopt/WebP/LOD → manifest + CI budgets); GLB oven + animated chef with LOD and procedural fallback; topping drop-in; render pause when hidden; JS budget tests. Pending: artist Blender sources | Mobile perf budget met; no-WebGL path works |
| 7 Customer UX | Storefront, menu, builder, accounts, tracking | Playwright purchase journey |
| 8 Launch | Security review, perf, a11y, SEO, monitoring, backups | Launch checklist signed off |

---

## 8. First implementation tasks (dependency order)

1. Dedicated git repo; pnpm workspace; strict TS base config.
2. `packages/shared`: Money, errors, env loader (+ tests).
3. `infra/docker-compose.yml`: Postgres with separate owner/app roles.
4. `packages/db`: Drizzle config, identity/tenancy schema, generated migration.
5. Custom migration: grants, RLS policies, `SECURITY DEFINER` helpers, append-only audit.
6. `withActor()` transaction context (+ RLS isolation tests).
7. `packages/core`: permission catalogue, role definitions, `authorize()`, scope covering (+ tests).
8. `core/tenancy`: hostname normalisation, domain resolution, canonical URL (+ tests).
9. `core/audit`: `recordAudit()` in-transaction helper.
10. Seed: permissions and system roles. This is reference data, not mock data.
11. `apps/web`: env, health route, Supabase auth adapter, sign-in, actor resolution, `proxy.ts` tenant routing.
12. Retro design tokens + storefront shell + styleguide route.
13. Playwright smoke; GitHub Actions pipeline.

Unresolved business decisions: see [`DECISIONS.md`](./DECISIONS.md#open-questions).
