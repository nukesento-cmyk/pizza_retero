MASTER ENGINEERING PROMPT — RETRO IMMERSIVE PIZZA KITCHEN PLATFORM

Act as a principal software architect, senior full-stack engineer, 3D web developer, database architect, and application security engineer.

Your task is to design and build a production-ready, franchise-based pizza ordering platform with an immersive retro kitchen experience.

Do not produce a generic restaurant template. Build a distinctive, technically robust product with a premium interactive experience and a complete operational backend.

1. LOCKED PRODUCT DECISIONS

These decisions are final. Do not change them without explicit approval.

- Business model: Franchise.
- Fulfilment: Delivery and collection.
- Payments: M-Pesa.
- Ordering: Website checkout and WhatsApp-assisted ordering.
- Experience: Hybrid 3D kitchen environment and real food photography.
- 3D assets: Custom Blender models and animations.
- Visual personality: Retro.
- Camera: Interactive.
- Interactions: Scroll-driven and direct user interactions.
- Architecture: Modular monolith.
- Database: PostgreSQL.
- ORM: Drizzle.
- Validation: Zod.
- Monorepo: pnpm.
- Frontend/backend: Next.js and TypeScript.
- UI: Tailwind CSS and shadcn/ui.
- Authentication: Managed authentication.
- Storage: S3-compatible storage.
- Testing: Vitest and Playwright.
- CI/CD: GitHub Actions.

2. TECHNICAL ARCHITECTURE

Use:

- Next.js App Router.
- TypeScript with strict mode.
- PostgreSQL.
- Drizzle ORM and migrations.
- Zod validation.
- Supabase Auth and Storage.
- Tailwind CSS and shadcn/ui.
- Three.js and React Three Fiber.
- GSAP for scroll-driven animation.
- Motion for interface transitions.
- Blender-exported GLB/glTF assets.
- Vitest for unit and integration testing.
- Playwright for end-to-end testing.
- pnpm workspaces.

Use a modular monolith. Do not introduce unnecessary microservices.

Keep business logic separate from UI components and 3D rendering.

3. FRANCHISE ARCHITECTURE

Build a multi-tenant franchise system.

Hierarchy:

Brand → Franchisees → Branches → Staff and Customers.

Support:

- Multiple franchisees.
- Multiple branches per franchisee.
- Branch-specific menus, pricing, stock, operating hours and delivery zones.
- Central brand catalogue and branding.
- Controlled branch-level overrides.
- Franchise and branch administration.
- Role-based permissions.
- Domain-based brand and branch resolution.

Example domains:

- brand.com
- nairobi.brand.com
- westlands.brand.com

Domains are routing inputs, never authorization mechanisms. Implement tenant isolation, canonical SEO URLs and secure authentication/session handling.

4. DATABASE DESIGN

Design normalized Drizzle schemas for:

- Users, brands, franchisees, branches and memberships.
- Roles, permissions and audit logs.
- Domains and brand settings.
- Products, variants, ingredients and customization options.
- Branch product availability and pricing.
- Customers and addresses.
- Carts and cart items.
- Orders, order items and order history.
- Payments, transactions, callbacks and refunds.
- Kitchen tickets and ticket items.
- Inventory, stock movements and suppliers.
- Delivery zones, assignments and delivery events.
- Promotions and coupons.
- Reviews and loyalty.
- Content pages, banners and 3D scene assets.

Use integer minor currency units or exact decimal representations. Never use floating-point arithmetic for financial calculations.

Preserve product and pricing snapshots in orders.

Implement tenant-aware queries and PostgreSQL Row Level Security where appropriate.

5. COMMERCE AND ORDERING

Implement the complete customer journey:

1. Select a branch.
2. Explore the interactive kitchen.
3. Browse the menu.
4. Customize a pizza.
5. Add products to cart.
6. Choose delivery or collection.
7. Enter customer details.
8. Receive a server-calculated price quote.
9. Initiate M-Pesa payment.
10. Receive confirmation.
11. Track the order.

Support guest checkout and customer accounts.

Pizza customization should support:

- Base.
- Size.
- Crust.
- Sauce.
- Cheese.
- Toppings.
- Allergens and dietary information.
- Live pricing.
- Visual preview.

The server must calculate prices, validate availability, calculate delivery fees and validate all order details. Never trust client-submitted totals.

6. M-PESA INTEGRATION

Implement an isolated M-Pesa Daraja integration module.

Requirements:

- STK Push.
- Server-side credentials.
- Payment initiation.
- Callback processing.
- Callback persistence.
- Transaction verification.
- Idempotency.
- Duplicate callback handling.
- Delayed callback handling.
- Payment reconciliation.
- Refund workflow.
- Transaction audit trail.

Never treat a browser redirect or client-side success message as proof of payment.

Keep settlement configuration flexible because franchise payment arrangements may differ.

Use sandbox credentials during development. Never commit secrets.

7. WHATSAPP ORDERING

Implement WhatsApp click-to-chat with prefilled order or enquiry references.

Staff-assisted orders must use the same backend commerce engine as website orders.

Do not create a separate pricing, inventory or order-processing system for WhatsApp.

Keep automated WhatsApp Business API integration as a future extension.

8. KITCHEN AND FRANCHISE OPERATIONS

Build separate dashboards for:

- Platform owner.
- Brand administrator.
- Franchise administrator.
- Branch manager.
- Kitchen staff.
- Inventory manager.
- Delivery staff.
- Customers.

Kitchen workflow:

NEW → ACCEPTED → PREPARING → BAKING → READY → COMPLETED.

Delivery workflow:

READY → OUT_FOR_DELIVERY → DELIVERED.

Collection workflow:

READY → COLLECTED.

Implement valid state transitions, timestamps, order history and role restrictions.

Inventory must support stock movements, ingredient consumption, waste, stock reservations and concurrency-safe updates.

9. IMMERSIVE 3D EXPERIENCE

This is a defining product feature.

Create a retro kitchen environment with distinct interactive stations:

1. Kitchen entrance.
2. Dough preparation.
3. Sauce station.
4. Ingredient station.
5. Pizza assembly.
6. Oven.
7. Finished pizza reveal.
8. Brand story.

Use custom Blender assets.

Required assets may include:

- Retro kitchen interior.
- Oven.
- Chef character.
- Dough.
- Rolling pin.
- Sauce containers.
- Cheese and toppings.
- Pizza peel.
- Pizza cutter.
- Tables and kitchen equipment.
- Retro signage and lighting.

Use GLB/glTF exports, reusable materials, animation clips, optimized textures, Draco compression, KTX2 where appropriate and level-of-detail strategies.

Implement:

- Interactive camera movement.
- Scroll-triggered camera transitions.
- Direct station interactions.
- Animated kitchen objects.
- Pizza assembly interactions.
- Oven reveal.
- Real food photography for actual menu products.

The 3D experience must never become the source of truth for products, prices, stock or orders.

Provide mobile fallbacks, reduced-motion support and graceful loading when WebGL is unavailable.

10. DESIGN SYSTEM

Create a coherent retro visual identity.

Avoid generic SaaS dashboards and generic restaurant templates.

The storefront should feel like entering a carefully designed retro pizza kitchen.

Use:

- Distinctive typography.
- Thoughtful color palette.
- Warm lighting.
- Retro signage.
- Tactile interactions.
- High-quality food photography.
- Intentional transitions.
- Consistent spacing and responsive layouts.

The admin experience should prioritize clarity, speed and operational efficiency rather than unnecessary visual effects.

11. SECURITY

Treat security as a core architectural requirement.

Implement:

- Server-side authorization.
- Tenant isolation.
- Role and permission enforcement.
- Secure authentication.
- Input validation.
- Rate limiting.
- Secure payment callbacks.
- Idempotent payment and order operations.
- Audit logs.
- Data minimization.
- Secure file uploads.
- Environment-based secrets.
- Backup and recovery procedures.

Test cross-tenant access attempts explicitly.

Never rely on hidden buttons or frontend role checks for security.

12. DEVELOPMENT RULES

Follow these rules throughout implementation:

1. Inspect the existing repository before changing anything.
2. Produce an architecture and implementation plan before coding.
3. Never overwrite existing working functionality without justification.
4. Never use destructive database resets.
5. Use versioned migrations.
6. Avoid duplicated business logic.
7. Avoid unnecessary dependencies.
8. Keep components modular and reusable.
9. Use strict TypeScript.
10. Validate inputs using Zod.
11. Write tests alongside features.
12. Document important architectural decisions.
13. Do not hardcode production secrets.
14. Do not use mock data as a substitute for implemented production functionality.
15. Clearly distinguish completed features from placeholders.

For every module, implement its schema, validation, business logic, authorization, error handling, tests and documentation.

13. IMPLEMENTATION PHASES

Work in this order:

Phase 0 — Foundation

- Repository inspection.
- pnpm monorepo.
- Next.js setup.
- Shared packages.
- Environment configuration.
- CI/CD.
- Testing foundation.

Phase 1 — Database and identity

- Drizzle schemas.
- Authentication.
- Roles and permissions.
- Franchise hierarchy.
- Tenant isolation.
- RLS policies.

Phase 2 — Franchise administration

- Franchisee management.
- Branch management.
- Domain resolution.
- Brand configuration.
- Staff management.

Phase 3 — Catalogue

- Products.
- Ingredients.
- Customization.
- Branch pricing.
- Availability.
- Server-side pricing engine.

Phase 4 — Commerce

- Cart.
- Checkout.
- Orders.
- M-Pesa integration.
- Payment reconciliation.

Phase 5 — Operations

- Kitchen dashboard.
- Inventory.
- Delivery.
- Collection.
- WhatsApp-assisted ordering.

Phase 6 — 3D production

- Blender asset pipeline.
- Kitchen environment.
- Camera system.
- Animation system.
- Interactive stations.
- Performance optimization.

Phase 7 — Customer experience

- Storefront.
- Menu.
- Pizza builder.
- Customer accounts.
- Order tracking.
- Responsive experience.

Phase 8 — Quality and launch

- Security testing.
- Performance testing.
- Accessibility.
- SEO.
- End-to-end tests.
- Deployment.
- Monitoring.
- Backup verification.

14. FIRST TASK

Do not immediately generate the entire application.

Start by:

1. Inspecting the repository and existing files.
2. Identifying existing functionality and constraints.
3. Producing the complete system architecture.
4. Producing the monorepo folder structure.
5. Producing the database entity relationship design.
6. Identifying critical security boundaries.
7. Producing the API contract.
8. Producing the implementation roadmap.
9. Identifying unresolved business decisions.
10. Listing the first implementation tasks in dependency order.

Then implement Phase 0 and Phase 1 incrementally.

After each phase, run tests, report results, document changed files and identify remaining work.

Do not silently make major architectural decisions. Present trade-offs when a decision materially affects security, cost, franchise operations or future scalability.

Final objective: Build a secure, scalable franchise pizza platform where the immersive retro kitchen attracts customers, the ordering engine converts them, and the operational system allows the business to scale across multiple franchisees and branches.