import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { users } from "./identity";
import { branches, brands, franchisees } from "./tenancy";
import { productVariants, products } from "./catalogue";

const money = (name: string) => bigint(name, { mode: "bigint" });

export const fulfilment = pgEnum("fulfilment", ["delivery", "collection"]);
export const orderChannel = pgEnum("order_channel", ["web", "whatsapp", "staff"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment", "new", "accepted", "preparing", "baking", "ready",
  "out_for_delivery", "delivered", "collected", "completed", "cancelled",
]);
export const orderPaymentStatus = pgEnum("order_payment_status", ["unpaid", "pending", "paid", "refunded", "partially_refunded"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "cancelled"]);
export const attemptStatus = pgEnum("payment_attempt_status", ["initiating", "initiated", "succeeded", "failed", "cancelled", "timeout", "error"]);
export const refundStatus = pgEnum("refund_status", ["requested", "approved", "processing", "succeeded", "failed", "rejected"]);
export const mpesaEnv = pgEnum("mpesa_environment", ["sandbox", "production", "simulator"]);

/* ── Delivery zones ─────────────────────────────────────────────── */

export const deliveryZones = pgTable("delivery_zones", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(),
  /** Circle around the branch, in metres. */
  radiusM: integer("radius_m"),
  /** Optional polygon [[lat,lng],…] — takes precedence over radius. */
  polygon: jsonb("polygon").$type<[number, number][]>(),
  feeMinor: money("fee_minor").notNull(),
  freeAboveMinor: money("free_above_minor"),
  minOrderMinor: money("min_order_minor"),
  etaMinutes: integer("eta_minutes").notNull().default(40),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "delivery_zones_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
  unique("delivery_zones_id_brand_uq").on(t.id, t.brandId),
  check("delivery_zones_shape", sql`${t.radiusM} IS NOT NULL OR ${t.polygon} IS NOT NULL`),
  check("delivery_zones_radius", sql`${t.radiusM} IS NULL OR ${t.radiusM} BETWEEN 100 AND 50000`),
  check("delivery_zones_fee", sql`${t.feeMinor} >= 0`),
]);

/* ── Customers ──────────────────────────────────────────────────── */

export const customers = pgTable("customers", {
  id: pk(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(), // E.164
  email: text("email"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  /** Set when the customer asks for erasure (Kenya DPA). PII fields are blanked. */
  erasedAt: timestamp("erased_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  unique("customers_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("customers_brand_user_uq").on(t.brandId, t.userId).where(sql`${t.userId} IS NOT NULL`),
  index("customers_brand_phone_idx").on(t.brandId, t.phone),
  check("customers_phone_e164", sql`${t.phone} ~ '^\\+[1-9][0-9]{6,14}$' OR ${t.erasedAt} IS NOT NULL`),
]);

export const customerAddresses = pgTable("customer_addresses", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  label: text("label").notNull().default("Home"),
  line1: text("line1").notNull(),
  area: text("area"),
  city: text("city").notNull(),
  notes: text("notes"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "customer_addresses_customer_fk", columns: [t.customerId, t.brandId], foreignColumns: [customers.id, customers.brandId] }).onDelete("cascade"),
]);

/* ── Carts & quotes ─────────────────────────────────────────────── */

export const carts = pgTable("carts", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  /** SHA-256 of the bearer token held by the browser (or by staff for assisted orders). */
  tokenHash: text("token_hash").notNull(),
  /** Short human reference for WhatsApp hand-off, e.g. K7M2QX. */
  reference: text("reference").notNull(),
  channel: orderChannel("channel").notNull().default("web"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "carts_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
  uniqueIndex("carts_token_uq").on(t.tokenHash),
  uniqueIndex("carts_reference_uq").on(t.brandId, t.reference),
]);

export const cartItems = pgTable("cart_items", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  /** NULL = product defaults. */
  optionIds: jsonb("option_ids").$type<string[] | null>(),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  check("cart_items_qty", sql`${t.quantity} BETWEEN 1 AND 20`),
  index("cart_items_cart_idx").on(t.cartId),
]);

/** A server-calculated price for a cart, valid briefly. Orders are created only from quotes. */
export const quotes = pgTable("quotes", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  fulfilment: fulfilment("fulfilment").notNull(),
  deliveryZoneId: uuid("delivery_zone_id"),
  deliveryLat: numeric("delivery_lat", { precision: 9, scale: 6 }),
  deliveryLng: numeric("delivery_lng", { precision: 9, scale: 6 }),
  couponCode: text("coupon_code"),
  lines: jsonb("lines").$type<unknown[]>().notNull(),
  currency: text("currency").notNull(),
  subtotalMinor: money("subtotal_minor").notNull(),
  deliveryFeeMinor: money("delivery_fee_minor").notNull(),
  discountMinor: money("discount_minor").notNull(),
  totalMinor: money("total_minor").notNull(),
  vatIncludedMinor: money("vat_included_minor").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("quotes_total", sql`${t.totalMinor} = ${t.subtotalMinor} + ${t.deliveryFeeMinor} - ${t.discountMinor} AND ${t.totalMinor} >= 0`),
]);

/* ── Orders ─────────────────────────────────────────────────────── */

export const branchOrderCounters = pgTable("branch_order_counters", {
  branchId: uuid("branch_id").primaryKey().references(() => branches.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull(),
  nextValue: integer("next_value").notNull().default(1),
});

export const orders = pgTable("orders", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  franchiseeId: uuid("franchisee_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  number: text("number").notNull(),
  customerId: uuid("customer_id").notNull(),
  cartId: uuid("cart_id").references(() => carts.id, { onDelete: "set null" }),
  quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  channel: orderChannel("channel").notNull(),
  fulfilment: fulfilment("fulfilment").notNull(),
  status: orderStatus("status").notNull().default("pending_payment"),
  paymentStatus: orderPaymentStatus("payment_status").notNull().default("unpaid"),
  currency: text("currency").notNull(),
  subtotalMinor: money("subtotal_minor").notNull(),
  deliveryFeeMinor: money("delivery_fee_minor").notNull(),
  discountMinor: money("discount_minor").notNull(),
  totalMinor: money("total_minor").notNull(),
  vatIncludedMinor: money("vat_included_minor").notNull(),
  couponCode: text("coupon_code"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  deliveryAddress: jsonb("delivery_address").$type<{ line1: string; area?: string | null; city: string; notes?: string | null; lat?: number | null; lng?: number | null } | null>(),
  deliveryZoneId: uuid("delivery_zone_id"),
  etaMinutes: integer("eta_minutes"),
  notes: text("notes"),
  idempotencyKey: text("idempotency_key").notNull(),
  trackingTokenHash: text("tracking_token_hash").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
  paymentDueAt: timestamp("payment_due_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "orders_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("restrict"),
  foreignKey({ name: "orders_franchisee_fk", columns: [t.franchiseeId, t.brandId], foreignColumns: [franchisees.id, franchisees.brandId] }).onDelete("restrict"),
  foreignKey({ name: "orders_customer_fk", columns: [t.customerId, t.brandId], foreignColumns: [customers.id, customers.brandId] }).onDelete("restrict"),
  unique("orders_id_brand_uq").on(t.id, t.brandId),
  // Human numbers are per branch (prefix + sequence); public lookups also require the tracking token.
  uniqueIndex("orders_branch_number_uq").on(t.branchId, t.number),
  uniqueIndex("orders_brand_idem_uq").on(t.brandId, t.idempotencyKey),
  uniqueIndex("orders_tracking_uq").on(t.trackingTokenHash),
  index("orders_branch_status_idx").on(t.branchId, t.status, t.placedAt),
  index("orders_customer_idx").on(t.customerId),
  index("orders_pending_due_idx").on(t.paymentDueAt).where(sql`${t.status} = 'pending_payment'`),
  check("orders_total", sql`${t.totalMinor} = ${t.subtotalMinor} + ${t.deliveryFeeMinor} - ${t.discountMinor} AND ${t.totalMinor} >= 0`),
  check("orders_delivery_address", sql`${t.fulfilment} = 'collection' OR ${t.deliveryAddress} IS NOT NULL`),
]);

/** Frozen copy of what was sold, at the price it was sold for. Never re-priced. */
export const orderItems = pgTable("order_items", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  orderId: uuid("order_id").notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  variantName: text("variant_name").notNull(),
  sizeCode: text("size_code"),
  options: jsonb("options").$type<{ id: string; name: string; groupCode: string; included: boolean; priceMinor: string; visualKey: string | null }[]>().notNull(),
  removed: jsonb("removed").$type<{ id: string; name: string }[]>().notNull(),
  allergens: text("allergens").array().notNull(),
  unitPriceMinor: money("unit_price_minor").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotalMinor: money("line_total_minor").notNull(),
  notes: text("notes"),
}, (t) => [
  foreignKey({ name: "order_items_order_fk", columns: [t.orderId, t.brandId], foreignColumns: [orders.id, orders.brandId] }).onDelete("cascade"),
  index("order_items_order_idx").on(t.orderId),
  check("order_items_line", sql`${t.lineTotalMinor} = ${t.unitPriceMinor} * ${t.quantity}`),
]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(),
  fromStatus: orderStatus("from_status"),
  toStatus: orderStatus("to_status").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "osh_order_fk", columns: [t.orderId, t.brandId], foreignColumns: [orders.id, orders.brandId] }).onDelete("cascade"),
  index("osh_order_idx").on(t.orderId, t.at),
]);

/* ── Payments (M-Pesa) ──────────────────────────────────────────── */

/**
 * Settlement configuration. One row per brand (franchisee_id NULL = default)
 * or per franchisee (Q2). Secrets are NOT stored here: `credentials_ref` names
 * the env/secret-manager prefix holding consumer key/secret, passkey, etc.
 */
export const mpesaAccounts = pgTable("mpesa_accounts", {
  id: pk(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
  franchiseeId: uuid("franchisee_id"),
  environment: mpesaEnv("environment").notNull().default("sandbox"),
  shortcode: text("shortcode").notNull(),
  /** Till number for Buy Goods (PartyB); NULL for Paybill (PartyB = shortcode). */
  tillNumber: text("till_number"),
  transactionType: text("transaction_type").notNull().default("CustomerPayBillOnline"),
  credentialsRef: text("credentials_ref").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "mpesa_accounts_franchisee_fk", columns: [t.franchiseeId, t.brandId], foreignColumns: [franchisees.id, franchisees.brandId] }).onDelete("restrict"),
  uniqueIndex("mpesa_accounts_active_uq").on(t.brandId, sql`coalesce(${t.franchiseeId}, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`${t.active}`),
  check("mpesa_accounts_txn_type", sql`${t.transactionType} IN ('CustomerPayBillOnline', 'CustomerBuyGoodsOnline')`),
  check("mpesa_accounts_ref", sql`${t.credentialsRef} ~ '^[A-Z][A-Z0-9_]{2,40}$'`),
]);

export const payments = pgTable("payments", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(),
  accountId: uuid("account_id").notNull().references(() => mpesaAccounts.id, { onDelete: "restrict" }),
  provider: text("provider").notNull().default("mpesa"),
  amountMinor: money("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: paymentStatus("status").notNull().default("pending"),
  refundedMinor: money("refunded_minor").notNull().default(sql`0`),
  mpesaReceipt: text("mpesa_receipt"),
  payerPhoneMasked: text("payer_phone_masked"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "payments_order_fk", columns: [t.orderId, t.brandId], foreignColumns: [orders.id, orders.brandId] }).onDelete("restrict"),
  unique("payments_id_brand_uq").on(t.id, t.brandId),
  uniqueIndex("payments_order_uq").on(t.orderId),
  uniqueIndex("payments_receipt_uq").on(t.mpesaReceipt),
  check("payments_amount_pos", sql`${t.amountMinor} > 0`),
  check("payments_refund_bounds", sql`${t.refundedMinor} >= 0 AND ${t.refundedMinor} <= ${t.amountMinor}`),
]);

export const paymentAttempts = pgTable("payment_attempts", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  paymentId: uuid("payment_id").notNull(),
  status: attemptStatus("status").notNull().default("initiating"),
  callbackTokenHash: text("callback_token_hash").notNull(),
  checkoutRequestId: text("checkout_request_id"),
  merchantRequestId: text("merchant_request_id"),
  amountMinor: money("amount_minor").notNull(),
  phoneMasked: text("phone_masked").notNull(),
  resultCode: integer("result_code"),
  resultDesc: text("result_desc"),
  mpesaReceipt: text("mpesa_receipt"),
  queryCount: integer("query_count").notNull().default(0),
  lastQueriedAt: timestamp("last_queried_at", { withTimezone: true }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
}, (t) => [
  foreignKey({ name: "payment_attempts_payment_fk", columns: [t.paymentId, t.brandId], foreignColumns: [payments.id, payments.brandId] }).onDelete("restrict"),
  uniqueIndex("payment_attempts_checkout_uq").on(t.checkoutRequestId),
  uniqueIndex("payment_attempts_token_uq").on(t.callbackTokenHash),
  index("payment_attempts_open_idx").on(t.requestedAt).where(sql`${t.status} IN ('initiating', 'initiated')`),
  index("payment_attempts_payment_idx").on(t.paymentId),
]);

/** Every callback body, persisted BEFORE processing (README §6). */
export const mpesaCallbacks = pgTable("mpesa_callbacks", {
  id: pk(),
  kind: text("kind").notNull(), // stk | reversal_result | reversal_timeout
  tokenHash: text("token_hash").notNull(),
  attemptId: uuid("attempt_id"),
  refundId: uuid("refund_id"),
  checkoutRequestId: text("checkout_request_id"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  sourceIpHash: text("source_ip_hash"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  outcome: text("outcome"),
  error: text("error"),
}, (t) => [
  index("mpesa_callbacks_unprocessed_idx").on(t.receivedAt).where(sql`${t.processedAt} IS NULL`),
  index("mpesa_callbacks_checkout_idx").on(t.checkoutRequestId),
]);

export const refunds = pgTable("refunds", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(),
  paymentId: uuid("payment_id").notNull(),
  amountMinor: money("amount_minor").notNull(),
  reason: text("reason").notNull(),
  method: text("method").notNull().default("mpesa_reversal"), // mpesa_reversal | manual
  status: refundStatus("status").notNull().default("requested"),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  callbackTokenHash: text("callback_token_hash"),
  providerRef: text("provider_ref"),
  manualReference: text("manual_reference"),
  resultCode: integer("result_code"),
  resultDesc: text("result_desc"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "refunds_payment_fk", columns: [t.paymentId, t.brandId], foreignColumns: [payments.id, payments.brandId] }).onDelete("restrict"),
  check("refunds_amount_pos", sql`${t.amountMinor} > 0`),
  check("refunds_method", sql`${t.method} IN ('mpesa_reversal', 'manual')`),
  uniqueIndex("refunds_token_uq").on(t.callbackTokenHash),
  index("refunds_order_idx").on(t.orderId),
]);

/* ── Outbox ─────────────────────────────────────────────────────── */

/** Transactional outbox: events written with the change, delivered by the worker. */
export const outboxEvents = pgTable("outbox_events", {
  id: pk(),
  topic: text("topic").notNull(),
  brandId: uuid("brand_id"),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [
  index("outbox_pending_idx").on(t.availableAt).where(sql`${t.publishedAt} IS NULL`),
]);
