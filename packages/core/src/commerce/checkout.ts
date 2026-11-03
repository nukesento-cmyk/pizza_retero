import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { getBranchMenu } from "../catalogue/menu";
import type { MenuSnapshot } from "../catalogue/types";
import { priceLine, vatIncluded, type PricedLine } from "../pricing/engine";
import { isOpenAt } from "../hours";
import { zoneFor } from "./zones";
import { normalizeKenyanMobile } from "./phone";
import { enqueue } from "../outbox";

/*
 * The commerce engine. Web checkout, WhatsApp-assisted and staff orders all
 * go through these functions (README §7: one engine, no parallel pricing).
 * They run on the SYSTEM executor; possession of the cart token (or a staff
 * permission checked by the caller) is the capability.
 */

export const VAT_BPS = 1600;
export const CART_TTL_MS = 3 * 24 * 3600 * 1000;
export const QUOTE_TTL_MS = 10 * 60 * 1000;
export const PAYMENT_WINDOW_MS = 15 * 60 * 1000;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O/1/I/L/U
const reference = () => Array.from(randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");

export type Cart = typeof schema.carts.$inferSelect;

/* ── Carts ──────────────────────────────────────────────────────── */

export async function createCart(tx: Executor, input: { branchId: string; channel?: "web" | "whatsapp" | "staff"; createdByUserId?: string | null }) {
  const [branch] = await tx.select().from(schema.branches).where(eq(schema.branches.id, input.branchId));
  if (!branch || branch.status !== "active") throw notFound("Branch");
  const token = randomBytes(24).toString("base64url");
  for (let i = 0; i < 5; i++) {
    const rows = await tx.insert(schema.carts).values({
      brandId: branch.brandId, branchId: branch.id, tokenHash: sha256(token), reference: reference(),
      channel: input.channel ?? "web", createdByUserId: input.createdByUserId ?? null, expiresAt: new Date(Date.now() + CART_TTL_MS),
    }).onConflictDoNothing().returning();
    if (rows[0]) return { cart: rows[0], token };
  }
  throw new AppError("INTERNAL", "Could not allocate a cart reference.");
}

export async function cartByToken(tx: Executor, token: string): Promise<Cart> {
  const [c] = await tx.select().from(schema.carts).where(and(eq(schema.carts.tokenHash, sha256(token)), gt(schema.carts.expiresAt, new Date())));
  if (!c) throw notFound("Cart");
  if (c.checkedOutAt) throw new AppError("CONFLICT", "This cart has already been checked out.");
  return c;
}

/** Staff open a customer's cart by its WhatsApp reference (caller authorizes order.manage). */
export async function cartByReference(tx: Executor, brandId: string, ref: string): Promise<Cart> {
  const [c] = await tx.select().from(schema.carts).where(and(eq(schema.carts.brandId, brandId), eq(schema.carts.reference, ref.trim().toUpperCase())));
  if (!c) throw notFound("Cart");
  return c;
}

export const lineInput = z.object({
  productId: z.uuid(),
  variantId: z.uuid(),
  optionIds: z.array(z.uuid()).max(30).nullish(),
  quantity: z.coerce.number().int().min(1).max(20),
  notes: z.string().trim().max(200).nullish(),
});

export async function addCartItem(tx: Executor, cart: Cart, raw: unknown) {
  const input = parseInput(lineInput, raw);
  const menu = await getBranchMenu(tx, cart.branchId);
  const r = priceLine(menu, input);
  if (!r.ok) throw new AppError("VALIDATION_FAILED", r.message, { details: [{ path: "line", message: r.message }] });
  const count = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.cartItems).where(eq(schema.cartItems.cartId, cart.id));
  if ((count[0]?.n ?? 0) >= 30) throw new AppError("VALIDATION_FAILED", "That's a big order! Please call the branch for more than 30 lines.");
  const [item] = await tx.insert(schema.cartItems).values({
    brandId: cart.brandId, cartId: cart.id, productId: input.productId, variantId: input.variantId,
    optionIds: input.optionIds ?? null, quantity: input.quantity, notes: input.notes ?? null,
  }).returning();
  return item!;
}

export async function updateCartItem(tx: Executor, cart: Cart, itemId: string, quantity: number) {
  const q = parseInput(z.number().int().min(0).max(20), quantity);
  const where = and(eq(schema.cartItems.id, itemId), eq(schema.cartItems.cartId, cart.id));
  if (q === 0) await tx.delete(schema.cartItems).where(where);
  else await tx.update(schema.cartItems).set({ quantity: q }).where(where);
}

export interface CartView {
  cartId: string;
  reference: string;
  branchId: string;
  currency: string;
  lines: (PricedLine & { itemId: string; notes: string | null })[];
  problems: { itemId: string; message: string }[];
  subtotalMinor: bigint;
}

/** Price the cart against the live menu. Lines that no longer sell are reported, not silently dropped. */
export async function priceCart(tx: Executor, cart: Cart, menu?: MenuSnapshot): Promise<CartView> {
  const m = menu ?? (await getBranchMenu(tx, cart.branchId));
  const items = await tx.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, cart.id)).orderBy(asc(schema.cartItems.createdAt));
  const lines: CartView["lines"] = [];
  const problems: CartView["problems"] = [];
  for (const it of items) {
    const r = priceLine(m, { productId: it.productId, variantId: it.variantId, optionIds: it.optionIds, quantity: it.quantity });
    if (r.ok) lines.push({ ...r.line, itemId: it.id, notes: it.notes });
    else problems.push({ itemId: it.id, message: r.message });
  }
  return {
    cartId: cart.id, reference: cart.reference, branchId: cart.branchId, currency: m.currency, lines, problems,
    subtotalMinor: lines.reduce((s, l) => s + l.lineTotalMinor, 0n),
  };
}

/* ── Quotes ─────────────────────────────────────────────────────── */

export const quoteInput = z.object({
  fulfilment: z.enum(["delivery", "collection"]),
  lat: z.coerce.number().min(-90).max(90).nullish(),
  lng: z.coerce.number().min(-180).max(180).nullish(),
}).refine((v) => v.fulfilment === "collection" || (v.lat != null && v.lng != null), { message: "Pin your delivery location.", path: ["lat"] });

export async function assertBranchOpen(tx: Executor, branchId: string, at = new Date()) {
  const [b] = await tx.select().from(schema.branches).where(eq(schema.branches.id, branchId));
  if (!b || b.status !== "active") throw new AppError("CONFLICT", "This branch isn't taking orders right now.");
  const hours = await tx.select().from(schema.branchHours).where(eq(schema.branchHours.branchId, branchId));
  if (!hours.length) throw new AppError("CONFLICT", "This branch hasn't published its opening hours yet.");
  const closures = await tx.select().from(schema.branchClosures).where(eq(schema.branchClosures.branchId, branchId));
  if (!isOpenAt(hours, closures, b.timezone, at)) throw new AppError("CONFLICT", "The kitchen is closed right now. Check the opening hours and come back soon.");
  return b;
}

export async function createQuote(tx: Executor, cart: Cart, raw: unknown) {
  const input = parseInput(quoteInput, raw);
  const branch = await assertBranchOpen(tx, cart.branchId);
  if (input.fulfilment === "delivery" && !branch.offersDelivery) throw new AppError("VALIDATION_FAILED", "This branch only does collection.");
  if (input.fulfilment === "collection" && !branch.offersCollection) throw new AppError("VALIDATION_FAILED", "This branch only does delivery.");

  const view = await priceCart(tx, cart);
  if (view.problems.length) throw new AppError("CONFLICT", "Some items in your cart are no longer available. Please review your cart.", { details: view.problems });
  if (!view.lines.length) throw new AppError("VALIDATION_FAILED", "Your cart is empty.");

  let deliveryFee = 0n;
  let zone: Awaited<ReturnType<typeof zoneFor>> = null;
  if (input.fulfilment === "delivery") {
    const zones = await tx.select().from(schema.deliveryZones).where(eq(schema.deliveryZones.branchId, branch.id));
    const origin = branch.latitude && branch.longitude ? { lat: Number(branch.latitude), lng: Number(branch.longitude) } : null;
    zone = zoneFor(zones, origin, { lat: input.lat!, lng: input.lng! });
    if (!zone) throw new AppError("VALIDATION_FAILED", "Sorry, that address is outside our delivery area. Collection is available.");
    if (zone.minOrderMinor !== null && view.subtotalMinor < zone.minOrderMinor) {
      throw new AppError("VALIDATION_FAILED", `Delivery to ${zone.name} needs a minimum order of KES ${zone.minOrderMinor / 100n}.`);
    }
    deliveryFee = zone.freeAboveMinor !== null && view.subtotalMinor >= zone.freeAboveMinor ? 0n : zone.feeMinor;
  }

  const discount = 0n; // Coupons apply here (Phase 7).
  const total = view.subtotalMinor + deliveryFee - discount;
  const [q] = await tx.insert(schema.quotes).values({
    brandId: cart.brandId, branchId: cart.branchId, cartId: cart.id, fulfilment: input.fulfilment,
    deliveryZoneId: zone?.id ?? null, deliveryLat: input.lat != null ? input.lat.toFixed(6) : null, deliveryLng: input.lng != null ? input.lng.toFixed(6) : null,
    lines: view.lines.map(serializeLine), currency: view.currency,
    subtotalMinor: view.subtotalMinor, deliveryFeeMinor: deliveryFee, discountMinor: discount, totalMinor: total,
    vatIncludedMinor: vatIncluded(total, VAT_BPS), expiresAt: sql`now() + make_interval(secs => ${QUOTE_TTL_MS / 1000})` as unknown as Date,
  }).returning();
  return { quote: q!, lines: view.lines, etaMinutes: zone?.etaMinutes ?? 20 };
}

const serializeLine = (l: PricedLine & { itemId?: string }) => JSON.parse(JSON.stringify(l, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

/* ── Orders ─────────────────────────────────────────────────────── */

export const placeOrderInput = z.object({
  quoteId: z.uuid(),
  idempotencyKey: z.string().min(16).max(80),
  contact: z.object({ name: z.string().trim().min(2).max(80), phone: z.string().min(9).max(20), email: z.email().nullish() }),
  address: z.object({ line1: z.string().trim().min(3).max(160), area: z.string().trim().max(80).nullish(), city: z.string().trim().min(2).max(60), notes: z.string().trim().max(200).nullish() }).nullish(),
  notes: z.string().trim().max(300).nullish(),
  userId: z.uuid().nullish(),
  channel: z.enum(["web", "whatsapp", "staff"]).default("web"),
  createdByUserId: z.uuid().nullish(),
});

/**
 * Turn a quote into an order. Re-prices the cart against the live menu and
 * refuses if anything changed since the quote (prices never move silently).
 * Idempotent on (brand, idempotencyKey).
 */
export async function placeOrder(tx: Executor, cart: Cart, raw: unknown) {
  const input = parseInput(placeOrderInput, raw);
  const existing = await tx.select().from(schema.orders).where(and(eq(schema.orders.brandId, cart.brandId), eq(schema.orders.idempotencyKey, input.idempotencyKey)));
  if (existing[0]) {
    if (existing[0].quoteId !== input.quoteId) throw conflict("That idempotency key was already used for a different order.");
    return { order: existing[0], trackingToken: null, replayed: true as const };
  }

  const [q] = await tx.select().from(schema.quotes).where(and(eq(schema.quotes.id, input.quoteId), eq(schema.quotes.cartId, cart.id)));
  if (!q) throw notFound("Quote");
  const [age] = await tx.select({ expired: sql<boolean>`${schema.quotes.expiresAt} < now()` }).from(schema.quotes).where(eq(schema.quotes.id, q.id));
  if (age?.expired) throw new AppError("CONFLICT", "Your price check expired. Please review your order again.");
  if (q.fulfilment === "delivery" && !input.address) throw new AppError("VALIDATION_FAILED", "Add a delivery address.", { details: [{ path: "address.line1", message: "Add a delivery address." }] });

  const branch = await assertBranchOpen(tx, cart.branchId);
  const view = await priceCart(tx, cart);
  if (view.problems.length || view.subtotalMinor !== q.subtotalMinor) {
    throw new AppError("CONFLICT", "Prices or availability changed since your price check. Please review your order.");
  }

  const phone = normalizeKenyanMobile(input.contact.phone);
  // Signed-in customers keep one record per brand; guests are matched by phone.
  let customerId: string;
  const byUser = input.userId ? await tx.select().from(schema.customers).where(and(eq(schema.customers.brandId, cart.brandId), eq(schema.customers.userId, input.userId))) : [];
  // Guests are matched by phone; a signed-in customer is never attached to a guest record by phone alone.
  const byPhone = !byUser[0] && !input.userId ? await tx.select().from(schema.customers).where(and(eq(schema.customers.brandId, cart.brandId), eq(schema.customers.phone, phone), isNull(schema.customers.userId), isNull(schema.customers.erasedAt))) : [];
  const found = byUser[0] ?? byPhone[0];
  if (found) {
    customerId = found.id;
    await tx.update(schema.customers).set({ name: input.contact.name, phone, email: input.contact.email ?? found.email }).where(eq(schema.customers.id, found.id));
  } else {
    const [c] = await tx.insert(schema.customers).values({ brandId: cart.brandId, userId: input.userId ?? null, name: input.contact.name, phone, email: input.contact.email ?? null }).returning();
    customerId = c!.id;
  }

  const number = await nextOrderNumber(tx, branch);
  const trackingToken = randomBytes(18).toString("base64url");
  const zone = q.deliveryZoneId ? (await tx.select().from(schema.deliveryZones).where(eq(schema.deliveryZones.id, q.deliveryZoneId)))[0] : undefined;
  const [order] = await tx.insert(schema.orders).values({
    brandId: cart.brandId, franchiseeId: branch.franchiseeId, branchId: branch.id, number, customerId,
    cartId: cart.id, quoteId: q.id, channel: input.channel, fulfilment: q.fulfilment,
    currency: q.currency, subtotalMinor: q.subtotalMinor, deliveryFeeMinor: q.deliveryFeeMinor, discountMinor: q.discountMinor,
    totalMinor: q.totalMinor, vatIncludedMinor: q.vatIncludedMinor, couponCode: q.couponCode,
    contactName: input.contact.name, contactPhone: phone,
    deliveryAddress: q.fulfilment === "delivery" && input.address ? { ...input.address, lat: q.deliveryLat ? Number(q.deliveryLat) : null, lng: q.deliveryLng ? Number(q.deliveryLng) : null } : null,
    deliveryZoneId: q.deliveryZoneId, etaMinutes: zone?.etaMinutes ?? 20, notes: input.notes ?? null,
    idempotencyKey: input.idempotencyKey, trackingTokenHash: sha256(trackingToken),
    createdByUserId: input.createdByUserId ?? null, paymentDueAt: sql`now() + make_interval(secs => ${PAYMENT_WINDOW_MS / 1000})` as unknown as Date,
  }).returning();

  await tx.insert(schema.orderItems).values(view.lines.map((l) => ({
    brandId: cart.brandId, orderId: order!.id, productId: l.productId, variantId: l.variantId,
    productName: l.productName, variantName: l.variantName, sizeCode: l.sizeCode,
    options: l.options.map((o) => ({ ...o, priceMinor: o.priceMinor.toString() })), removed: l.removed, allergens: l.allergens,
    unitPriceMinor: l.unitPriceMinor, quantity: l.quantity, lineTotalMinor: l.lineTotalMinor, notes: l.notes,
  })));
  await tx.insert(schema.orderStatusHistory).values({ brandId: cart.brandId, branchId: branch.id, orderId: order!.id, toStatus: "pending_payment", actorUserId: input.createdByUserId ?? null });
  await tx.update(schema.carts).set({ checkedOutAt: new Date() }).where(eq(schema.carts.id, cart.id));
  await enqueue(tx, { topic: "order.placed", brandId: cart.brandId, aggregateType: "order", aggregateId: order!.id, payload: { number, branchId: branch.id, totalMinor: q.totalMinor.toString() } });
  return { order: order!, trackingToken, replayed: false as const };
}

/** Per-branch sequential human order numbers, e.g. WES-0042. Concurrency-safe (row lock). */
async function nextOrderNumber(tx: Executor, branch: { id: string; brandId: string; slug: string }) {
  await tx.insert(schema.branchOrderCounters).values({ branchId: branch.id, brandId: branch.brandId }).onConflictDoNothing();
  const [row] = await tx.update(schema.branchOrderCounters).set({ nextValue: sql`${schema.branchOrderCounters.nextValue} + 1` })
    .where(eq(schema.branchOrderCounters.branchId, branch.id)).returning({ v: schema.branchOrderCounters.nextValue });
  const prefix = branch.slug.replace(/[^a-z0-9]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${prefix}-${String(row!.v - 1).padStart(4, "0")}`;
}

/* ── Public tracking ────────────────────────────────────────────── */

export async function orderByTracking(tx: Executor, number: string, token: string) {
  const [o] = await tx.select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.trackingTokenHash, sha256(token))));
  if (!o) throw notFound("Order");
  return o;
}

export async function trackingView(tx: Executor, order: typeof schema.orders.$inferSelect) {
  const [items, history, branch] = await Promise.all([
    tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
    tx.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, order.id)).orderBy(asc(schema.orderStatusHistory.at)),
    tx.select({ name: schema.branches.name, phone: schema.branches.phone }).from(schema.branches).where(eq(schema.branches.id, order.branchId)),
  ]);
  return {
    number: order.number, status: order.status, paymentStatus: order.paymentStatus, fulfilment: order.fulfilment,
    totalMinor: order.totalMinor, currency: order.currency, etaMinutes: order.etaMinutes, placedAt: order.placedAt, paymentDueAt: order.paymentDueAt,
    firstName: order.contactName.split(" ")[0], branch: branch[0] ?? null,
    items: items.map((i) => ({ name: i.productName, variant: i.variantName, quantity: i.quantity, lineTotalMinor: i.lineTotalMinor, options: i.options.filter((o) => !o.included).map((o) => o.name), removed: i.removed.map((r) => r.name) })),
    timeline: history.map((h) => ({ status: h.toStatus, at: h.at })),
  };
}
