import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { recordAudit } from "../audit";
import { loadScope } from "../tenancy/scope";

/*
 * Inventory. Quantities are numeric(14,3) strings in SQL; arithmetic happens
 * in the database so concurrent orders can't oversell:
 *
 *   UPDATE inventory_items SET reserved = reserved + q
 *    WHERE id = $1 AND on_hand - reserved >= q        ← atomic check-and-set
 *
 * Lifecycle per order: reserve (placed) → consume (kitchen starts preparing)
 * or release (cancelled / expired). Every change writes a stock_movements row.
 */

const { inventoryItems, stockMovements, stockReservations, orderItems, variantRecipes, optionSizes, options, ingredients } = schema;

/** Ingredient → quantity needed for an order: base recipes + option portions. */
export async function requirementsForOrder(tx: Executor, orderId: string): Promise<Map<string, number>> {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const need = new Map<string, number>();
  const add = (ing: string, q: number) => need.set(ing, (need.get(ing) ?? 0) + q);
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => !!v);
  const recipes = variantIds.length ? await tx.select().from(variantRecipes).where(inArray(variantRecipes.variantId, variantIds)) : [];
  const optIds = [...new Set(items.flatMap((i) => i.options.map((o) => o.id)))];
  const opts = optIds.length ? await tx.select().from(options).where(inArray(options.id, optIds)) : [];
  const sizes = optIds.length ? await tx.select().from(optionSizes).where(inArray(optionSizes.optionId, optIds)) : [];
  for (const it of items) {
    for (const r of recipes.filter((r) => r.variantId === it.variantId)) add(r.ingredientId, Number(r.quantity) * it.quantity);
    for (const o of it.options) {
      const opt = opts.find((x) => x.id === o.id);
      if (!opt?.ingredientId) continue;
      const portion = sizes.find((s) => s.optionId === o.id && s.sizeCode === it.sizeCode)?.portionQty;
      if (portion) add(opt.ingredientId, Number(portion) * it.quantity);
    }
  }
  return need;
}

/** Reserve tracked stock for a new order. Throws CONFLICT (and the whole order rolls back) if short. */
export async function reserveForOrder(tx: Executor, order: { id: string; brandId: string; branchId: string }) {
  const need = await requirementsForOrder(tx, order.id);
  if (!need.size) return;
  const tracked = await tx.select({ id: inventoryItems.id, ingredientId: inventoryItems.ingredientId, name: ingredients.name })
    .from(inventoryItems).innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
    .where(and(eq(inventoryItems.branchId, order.branchId), inArray(inventoryItems.ingredientId, [...need.keys()])));
  for (const item of tracked.sort((a, b) => (a.id < b.id ? -1 : 1))) { // fixed lock order avoids deadlocks
    const q = need.get(item.ingredientId)!.toFixed(3);
    const ok = await tx.update(inventoryItems).set({ reserved: sql`${inventoryItems.reserved} + ${q}::numeric` })
      .where(and(eq(inventoryItems.id, item.id), sql`${inventoryItems.onHand} - ${inventoryItems.reserved} >= ${q}::numeric`)).returning({ id: inventoryItems.id });
    if (!ok.length) throw new AppError("CONFLICT", `Sorry, we've just run out of ${item.name.toLowerCase()}. Please adjust your order.`);
    await tx.insert(stockReservations).values({ brandId: order.brandId, branchId: order.branchId, orderId: order.id, itemId: item.id, quantity: q });
    await tx.insert(stockMovements).values({ brandId: order.brandId, branchId: order.branchId, itemId: item.id, kind: "reservation", quantity: q, orderId: order.id });
  }
}

async function settleReservations(tx: Executor, orderId: string, to: "consumed" | "released", actorUserId: string | null) {
  const held = await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "held"))).orderBy(asc(stockReservations.itemId)).for("update");
  for (const r of held) {
    await tx.update(inventoryItems).set(to === "consumed"
      ? { onHand: sql`${inventoryItems.onHand} - ${r.quantity}::numeric`, reserved: sql`${inventoryItems.reserved} - ${r.quantity}::numeric` }
      : { reserved: sql`${inventoryItems.reserved} - ${r.quantity}::numeric` }).where(eq(inventoryItems.id, r.itemId));
    await tx.update(stockReservations).set({ status: to }).where(eq(stockReservations.id, r.id));
    await tx.insert(stockMovements).values({
      brandId: r.brandId, branchId: r.branchId, itemId: r.itemId, orderId, actorUserId,
      kind: to === "consumed" ? "consumption" : "release", quantity: to === "consumed" ? `-${r.quantity}` : r.quantity,
    });
  }
}

export const consumeForOrder = (tx: Executor, orderId: string, actorUserId: string | null = null) => settleReservations(tx, orderId, "consumed", actorUserId);
export const releaseForOrder = (tx: Executor, orderId: string, actorUserId: string | null = null) => settleReservations(tx, orderId, "released", actorUserId);

/* ── Stock admin (inventory.manage) ─────────────────────────────── */

async function branchGuard(tx: Executor, actor: Actor, branchId: string, permission: "inventory.manage" | "inventory.read" = "inventory.manage") {
  const scope = await loadScope(tx, { level: "branch", id: branchId });
  if (scope.level !== "branch") throw notFound("Branch");
  authorize(actor, permission, scope);
  return scope;
}
const QTY = z.coerce.number().positive().max(1_000_000);

export const trackInput = z.object({ branchId: z.uuid(), ingredientId: z.uuid(), reorderLevel: z.coerce.number().min(0).default(0), openingStock: z.coerce.number().min(0).default(0) });

export async function trackIngredient(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(trackInput, raw);
  const scope = await branchGuard(tx, actor, input.branchId);
  const [ing] = await tx.select().from(ingredients).where(and(eq(ingredients.id, input.ingredientId), eq(ingredients.brandId, scope.brandId)));
  if (!ing) throw notFound("Ingredient");
  const [item] = await tx.insert(inventoryItems).values({ brandId: scope.brandId, branchId: input.branchId, ingredientId: ing.id, onHand: input.openingStock.toFixed(3), reorderLevel: input.reorderLevel.toFixed(3) })
    .onConflictDoUpdate({ target: [inventoryItems.branchId, inventoryItems.ingredientId], set: { reorderLevel: input.reorderLevel.toFixed(3) } }).returning();
  if (input.openingStock > 0) await tx.insert(stockMovements).values({ brandId: scope.brandId, branchId: input.branchId, itemId: item!.id, kind: "count", quantity: input.openingStock.toFixed(3), reason: "Opening stock", actorUserId: actor.kind === "user" ? actor.userId : null });
  await recordAudit(tx, actor, { action: "inventory.track", scope, targetType: "inventory_item", targetId: item!.id, metadata: { ingredient: ing.code } });
  return item!;
}

export const movementInput = z.object({
  itemId: z.uuid(),
  kind: z.enum(["receipt", "waste", "count"]),
  quantity: QTY.or(z.literal(0)),
  reason: z.string().trim().max(200).nullish(),
  supplierId: z.uuid().nullish(),
});

/** Receive stock, record waste, or record a physical count (sets on-hand to the counted value). */
export async function recordMovement(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(movementInput, raw);
  const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).for("update");
  if (!item) throw notFound("Stock item");
  const scope = await branchGuard(tx, actor, item.branchId);
  const q = input.quantity.toFixed(3);
  let delta: string;
  if (input.kind === "receipt") {
    delta = q;
    await tx.update(inventoryItems).set({ onHand: sql`${inventoryItems.onHand} + ${q}::numeric` }).where(eq(inventoryItems.id, item.id));
  } else if (input.kind === "waste") {
    if (!input.reason) throw new AppError("VALIDATION_FAILED", "Say why it was wasted.");
    const ok = await tx.update(inventoryItems).set({ onHand: sql`${inventoryItems.onHand} - ${q}::numeric` })
      .where(and(eq(inventoryItems.id, item.id), sql`${inventoryItems.onHand} - ${q}::numeric >= 0`)).returning();
    if (!ok.length) throw new AppError("VALIDATION_FAILED", "That's more than is on hand.");
    delta = `-${q}`;
  } else {
    const [r] = await tx.execute<{ d: string }>(sql`select (${q}::numeric - ${item.onHand}::numeric)::text as d`);
    delta = r!.d;
    if (Number(q) < Number(item.reserved)) throw new AppError("VALIDATION_FAILED", "The count is below what's reserved for open orders. Recount or cancel orders first.");
    await tx.update(inventoryItems).set({ onHand: q }).where(eq(inventoryItems.id, item.id));
  }
  await tx.insert(stockMovements).values({
    brandId: item.brandId, branchId: item.branchId, itemId: item.id, kind: input.kind, quantity: delta,
    reason: input.reason ?? null, supplierId: input.supplierId ?? null, actorUserId: actor.kind === "user" ? actor.userId : null,
  });
  await recordAudit(tx, actor, { action: `inventory.${input.kind}`, scope, targetType: "inventory_item", targetId: item.id, metadata: { quantity: delta, reason: input.reason ?? null } });
}

export async function stockList(tx: Executor, branchId: string) {
  return tx.select({
    id: inventoryItems.id, ingredientId: inventoryItems.ingredientId, name: ingredients.name, unit: ingredients.unit,
    onHand: inventoryItems.onHand, reserved: inventoryItems.reserved, reorderLevel: inventoryItems.reorderLevel,
    available: sql<string>`(${inventoryItems.onHand} - ${inventoryItems.reserved})::text`,
    low: sql<boolean>`${inventoryItems.onHand} - ${inventoryItems.reserved} <= ${inventoryItems.reorderLevel}`,
  }).from(inventoryItems).innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
    .where(eq(inventoryItems.branchId, branchId)).orderBy(asc(ingredients.name));
}

export async function recentMovements(tx: Executor, branchId: string, limit = 50) {
  return tx.select({ m: stockMovements, name: ingredients.name, unit: ingredients.unit }).from(stockMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId)).innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
    .where(eq(stockMovements.branchId, branchId)).orderBy(desc(stockMovements.createdAt)).limit(limit);
}

export const supplierInput = z.object({
  brandId: z.uuid(), franchiseeId: z.uuid().nullish(), name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).nullish(), email: z.email().nullish(), notes: z.string().trim().max(300).nullish(),
});

export async function addSupplier(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(supplierInput, raw);
  const scope: ResourceScope = input.franchiseeId ? await loadScope(tx, { level: "franchisee", id: input.franchiseeId }) : { level: "brand", brandId: input.brandId };
  // Franchisee suppliers: franchise inventory managers. Brand-wide suppliers: the brand catalogue team.
  if (input.franchiseeId) authorize(actor, "inventory.manage", scope);
  else authorize(actor, "catalogue.manage", scope);
  const [s] = await tx.insert(schema.suppliers).values({ ...input, franchiseeId: input.franchiseeId ?? null, phone: input.phone ?? null, email: input.email ?? null, notes: input.notes ?? null }).returning();
  await recordAudit(tx, actor, { action: "supplier.add", scope, targetType: "supplier", targetId: s!.id, metadata: { name: input.name } });
  return s!;
}
