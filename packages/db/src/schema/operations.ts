import { sql } from "drizzle-orm";
import {
  boolean, check, foreignKey, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { users } from "./identity";
import { branches, brands, franchisees } from "./tenancy";
import { ingredients } from "./catalogue";
import { orderItems, orders } from "./commerce";

export const ticketStatus = pgEnum("ticket_status", ["NEW", "ACCEPTED", "PREPARING", "BAKING", "READY", "COMPLETED", "CANCELLED"]);
export const movementKind = pgEnum("stock_movement_kind", ["receipt", "consumption", "waste", "count", "reservation", "release", "transfer"]);
export const reservationStatus = pgEnum("stock_reservation_status", ["held", "consumed", "released"]);
export const assignmentStatus = pgEnum("delivery_assignment_status", ["assigned", "picked_up", "delivered", "failed", "cancelled"]);

const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });

/* ── Kitchen ─────────────────────────────────────────────────────── */

export const kitchenTickets = pgTable("kitchen_tickets", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(),
  status: ticketStatus("status").notNull().default("NEW"),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  preparingAt: timestamp("preparing_at", { withTimezone: true }),
  bakingAt: timestamp("baking_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  foreignKey({ name: "kitchen_tickets_order_fk", columns: [t.orderId, t.brandId], foreignColumns: [orders.id, orders.brandId] }).onDelete("restrict"),
  uniqueIndex("kitchen_tickets_order_uq").on(t.orderId),
  index("kitchen_tickets_board_idx").on(t.branchId, t.status, t.createdAt),
]);

export const kitchenTicketItems = pgTable("kitchen_ticket_items", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  ticketId: uuid("ticket_id").notNull().references(() => kitchenTickets.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  detail: text("detail"),
  allergens: text("allergens").array().notNull(),
  quantity: integer("quantity").notNull(),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
}, (t) => [index("kitchen_ticket_items_ticket_idx").on(t.ticketId)]);

/* ── Inventory ───────────────────────────────────────────────────── */

export const suppliers = pgTable("suppliers", {
  id: pk(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
  /** NULL = brand-approved supplier for all franchisees. */
  franchiseeId: uuid("franchisee_id"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "suppliers_franchisee_fk", columns: [t.franchiseeId, t.brandId], foreignColumns: [franchisees.id, franchisees.brandId] }).onDelete("restrict"),
]);

/** Stock of one ingredient at one branch. Only tracked ingredients have a row. */
export const inventoryItems = pgTable("inventory_items", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  ingredientId: uuid("ingredient_id").notNull(),
  onHand: qty("on_hand").notNull().default("0"),
  reserved: qty("reserved").notNull().default("0"),
  reorderLevel: qty("reorder_level").notNull().default("0"),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "inventory_items_branch_fk", columns: [t.branchId, t.brandId], foreignColumns: [branches.id, branches.brandId] }).onDelete("cascade"),
  foreignKey({ name: "inventory_items_ingredient_fk", columns: [t.ingredientId, t.brandId], foreignColumns: [ingredients.id, ingredients.brandId] }).onDelete("restrict"),
  uniqueIndex("inventory_items_branch_ing_uq").on(t.branchId, t.ingredientId),
  check("inventory_nonneg", sql`${t.onHand} >= 0 AND ${t.reserved} >= 0 AND ${t.reorderLevel} >= 0`),
]);

/** Append-only ledger. Every change to on_hand/reserved writes one row. */
export const stockMovements = pgTable("stock_movements", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
  kind: movementKind("kind").notNull(),
  /** Signed change to on_hand (reservation/release change `reserved` and record the reserved delta). */
  quantity: qty("quantity").notNull(),
  orderId: uuid("order_id"),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("stock_movements_item_idx").on(t.itemId, t.createdAt),
  index("stock_movements_branch_idx").on(t.branchId, t.createdAt),
]);

export const stockReservations = pgTable("stock_reservations", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
  quantity: qty("quantity").notNull(),
  status: reservationStatus("status").notNull().default("held"),
  ...timestamps,
}, (t) => [
  uniqueIndex("stock_reservations_order_item_uq").on(t.orderId, t.itemId),
  check("stock_reservations_qty", sql`${t.quantity} > 0`),
]);

/* ── Delivery ────────────────────────────────────────────────────── */

export const deliveryAssignments = pgTable("delivery_assignments", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(),
  riderUserId: uuid("rider_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  status: assignmentStatus("status").notNull().default("assigned"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  foreignKey({ name: "delivery_assignments_order_fk", columns: [t.orderId, t.brandId], foreignColumns: [orders.id, orders.brandId] }).onDelete("restrict"),
  uniqueIndex("delivery_assignments_active_uq").on(t.orderId).where(sql`${t.status} IN ('assigned', 'picked_up')`),
  index("delivery_assignments_rider_idx").on(t.riderUserId, t.status),
]);

export const deliveryEvents = pgTable("delivery_events", {
  id: pk(),
  brandId: uuid("brand_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  assignmentId: uuid("assignment_id").notNull().references(() => deliveryAssignments.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull(),
  kind: text("kind").notNull(), // assigned | picked_up | delivered | failed | note | location
  note: text("note"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("delivery_events_order_idx").on(t.orderId, t.at)]);
