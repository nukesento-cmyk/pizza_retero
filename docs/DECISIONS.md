# Decisions

## Decision log (made during implementation)

Each entry records a choice the README left open. Entries marked **⚠ review**
materially affect security, cost, franchise operations or scalability, and the
owner should confirm them.

### D-001 Dedicated git repository
The folder lived inside a home-directory repo belonging to another project. We
initialised `pizza_retero/.git`. *Trade-off:* none of significance.

### D-002 RLS context via `set_config`, not Supabase `auth.uid()` ⚠ review
Drizzle connects directly to Postgres, so Supabase's PostgREST JWT context isn't
present. `withActor()` sets `app.user_id` inside each transaction, and
policies read it through `app.current_user_id()`.
*Why:* this works on any Postgres (Supabase, RDS, Neon, local), keeps the
database portable, and keeps the app on one connection pool.
*Trade-off:* the app role must be trusted to set the user id honestly, since it
comes from a server-verified Supabase session and never from the client. RLS
here is **defence in depth** behind `core` authorization, not the only line.
*Alternative:* pass the Supabase JWT to Postgres (`request.jwt.claims`). That
ties us to Supabase's Postgres and complicates pooling.

### D-003 Two database roles
`retero_owner` owns tables and runs migrations; `retero_app` is the runtime
role, `NOBYPASSRLS`, no DDL, no UPDATE/DELETE on `audit_logs`. On Supabase
these become two Postgres roles created by a bootstrap SQL (see
`infra/postgres/init/`).

### D-004 Permission catalogue in code, mirrored to DB
`packages/core/src/rbac/catalogue.ts` is the source of truth; a seed syncs it
to `permissions`/`roles`/`role_permissions` so SQL policies and admin UIs can
join on it. *Trade-off:* adding a permission needs a deploy, which is fine for
security-relevant changes.

### D-005 Scope model for memberships
A membership grants a role at exactly one scope: `platform`, `brand`,
`franchisee` or `branch`. Higher scopes cover their descendants. A user may
hold many memberships (e.g. kitchen staff at two branches).

### D-006 IDs are UUIDv7 generated in the app
Time-ordered (index-friendly), non-enumerable, and safe to expose in URLs.

### D-007 Next.js 16 `proxy.ts` for host resolution
The proxy only rewrites/annotates. It never authorizes (README §3).

### D-008 TypeScript 5.9 pinned (not 7.x)
TS 7 (native) is out, but Next.js/ESLint tooling compatibility isn't proven yet.
Revisit in Phase 8.

### D-009 Visual identity: "Retero Pizza Co." ⚠ review
Working brand name derived from the project folder. Every brand-visible string
comes from `brands`/`brand_settings`, so renaming touches no code. See
[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

### D-010 Sign-in method: email OTP (magic link) first ⚠ review
Phone OTP is the natural fit for Kenya (M-Pesa users all have a phone number)
but needs an SMS provider configured in Supabase (Twilio/Africa's Talking via
hook), which costs money per SMS. Email OTP ships first; phone OTP is a config
switch once a provider is chosen. Guest checkout (P4) needs no account at all.

### D-011 Branches are opened by the brand
`branch.create` is a brand-level permission; franchise admins run their
branches but cannot open new ones. *Trade-off:* the brand approves every new
location (franchise control) at the cost of one extra step for franchisees.
Flip by adding `branch.create` to `franchise_admin` (catalogue + seed).

### D-012 Storefront is the 3D kitchen; Phase 6 prototype pulled forward ⚠ review
Per `correctUI.md`, the storefront home is a walk-through 3D kitchen rather
than stacked sections. A working prototype was built before Phases 2–5 so the
interaction model is proven early. The previous 2D page is kept as the
no-WebGL / simple-view fallback. See [`3D_KITCHEN.md`](./3D_KITCHEN.md).

### D-013 Procedural geometry until Blender assets exist
No Blender assets or artist yet (Q10). The prototype uses procedural R3F
geometry and canvas textures, structured so each component maps to a planned
GLB (3D_KITCHEN.md §5). This is a stand-in, not the final art.

### D-014 Panels are DOM, anchored to 3D
Station panels render as normal DOM positioned from projected 3D anchors,
not inside the WebGL canvas, for accessibility, crisp text and Motion
transitions. Only small tags use drei `<Html>`.

### D-015 Local Playwright uses installed Chrome on macOS 13
Playwright's bundled Chromium no longer supports macOS 13. Set
`E2E_BROWSER_CHANNEL=chrome` locally; CI (Ubuntu) uses bundled Chromium.

---

## Open questions

These need a business answer. Work continues with the default shown, and every
default is reversible.

| # | Question | Why it matters | Default until answered |
|---|---|---|---|
| Q1 | **Final brand name, logo and domain.** | SEO, signage in the 3D scene, legal. | "Retero Pizza Co.", `retero.test` locally |
| Q2 | **M-Pesa settlement:** one brand Paybill, or one Paybill/Till per franchisee? | Determines whether Daraja credentials live per brand or per franchisee, plus reconciliation and payouts. | Schema supports **per-franchisee credentials**, with fallback to brand |
| Q3 | Royalty / fee model (percentage of sales, flat fee)? | Reporting, possible automated splits. | Reports only, no automated splits |
| Q4 | Can franchisees **add** products, or only toggle and price brand products? | Catalogue permission design (P3). | Toggle + price within brand-set min/max |
| Q5 | Price override bounds: may a branch price above or below brand RRP freely? | Pricing engine guards. | Brand sets optional min/max per product |
| Q6 | Delivery: own riders only, or also 3rd-party (Glovo/Uber Eats/Bolt)? | Delivery module scope. | Own riders only |
| Q7 | Delivery fee model: flat per zone, distance-based, or free above threshold? | Quote engine. | Flat fee per zone + free-above threshold |
| Q8 | SMS provider for phone OTP and order notifications? | Cost, deliverability. | None. Email + WhatsApp links |
| Q9 | VAT: are menu prices VAT-inclusive (16%)? eTIMS invoicing required? | Receipts, KRA compliance. | Prices VAT-inclusive; eTIMS deferred |
| Q10 | Who produces the Blender assets: in-house artist or contractor? Target art style references? | Phase 6 schedule. | We define the asset spec and placeholder geometry; artists replace it |
| Q11 | Data retention for customer PII and payment payloads? | Kenya Data Protection Act 2019. | Payment payloads 7 years; PII deletable on request |
| Q12 | Loyalty: points per KES, or stamp-card style? | P7 schema. | Stamp card (retro fit), schema neutral |
