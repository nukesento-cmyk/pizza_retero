import { and, asc, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { recordAudit } from "../audit";
import { enqueue } from "../outbox";
import { edge, type OrderStatus } from "../orders/state";
import { consumeForOrder, releaseForOrder } from "../inventory";

const { orders, kitchenTickets, kitchenTicketItems, orderItems, orderStatusHistory, payments, refunds, deliveryAssignments } = schema;

type Ticket = typeof kitchenTickets.$inferSelect;
const TICKET_FOR: Partial<Record<OrderStatus, { status: Ticket["status"]; at?: keyof Ticket }>> = {
  accepted: { status: "ACCEPTED", at: "acceptedAt" },
  preparing: { status: "PREPARING", at: "preparingAt" },
  baking: { status: "BAKING", at: "bakingAt" },
  ready: { status: "READY", at: "readyAt" },
  out_for_delivery: { status: "COMPLETED", at: "completedAt" },
  collected: { status: "COMPLETED", at: "completedAt" },
  cancelled: { status: "CANCELLED" },
};

/** Create the kitchen ticket for a paid order (called inside the payment-confirmation transaction). */
export async function createTicket(tx: Executor, orderId: string) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw notFound("Order");
  const existing = await tx.select({ id: kitchenTickets.id }).from(kitchenTickets).where(eq(kitchenTickets.orderId, orderId));
  if (existing[0]) return existing[0].id;
  const [t] = await tx.insert(kitchenTickets).values({ brandId: o.brandId, branchId: o.branchId, orderId: o.id }).returning();
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length) {
    await tx.insert(kitchenTicketItems).values(items.map((i) => ({
      brandId: o.brandId, ticketId: t!.id, orderItemId: i.id, quantity: i.quantity, allergens: i.allergens,
      name: `${i.productName} · ${i.variantName}`,
      detail: [
        ...i.options.filter((x) => !x.included).map((x) => `+ ${x.name}`),
        ...i.removed.map((r) => `NO ${r.name}`),
        ...(i.notes ? [`“${i.notes}”`] : []),
      ].join(" · ") || null,
    })));
  }
  return t!.id;
}

export const transitionInput = z.object({
  orderId: z.uuid(),
  to: z.enum(["accepted", "preparing", "baking", "ready", "out_for_delivery", "delivered", "collected", "completed", "cancelled"]),
  reason: z.string().trim().max(300).nullish(),
});

const scopeOf = (o: { brandId: string; franchiseeId: string; branchId: string }): ResourceScope => ({ level: "branch", brandId: o.brandId, franchiseeId: o.franchiseeId, branchId: o.branchId });

/**
 * Move an order through the workflow (README §8). Validates the edge for the
 * order's fulfilment type, enforces the permission the edge requires, and
 * applies side-effects atomically: ticket status/timestamps, stock
 * consumption (preparing) or release (cancelled), automatic refund request
 * for a cancelled paid order, history and an outbox event.
 *
 * Runs on the system executor after authorizing `actor` against the order's
 * stored scope (D-025).
 */
export async function transitionOrder(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(transitionInput, raw);
  const [o] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!o) throw notFound("Order");
  const scope = scopeOf(o);
  const e = edge(o.status, input.to, o.fulfilment);
  if (!e) throw conflict(`An order that is ${o.status.replace(/_/g, " ")} can't go to ${input.to.replace(/_/g, " ")}.`);
  if (e.permission === "system") throw new AppError("FORBIDDEN", "Only payment confirmation can do that.");
  authorize(actor, e.permission, scope);
  if (input.to === "cancelled" && !input.reason) throw new AppError("VALIDATION_FAILED", "Give a reason for cancelling.");
  if (input.to === "out_for_delivery" || input.to === "delivered") {
    const [a] = await tx.select().from(deliveryAssignments).where(and(eq(deliveryAssignments.orderId, o.id), inArray(deliveryAssignments.status, ["assigned", "picked_up"])));
    if (!a) throw conflict("Assign a rider first.");
  }
  const actorId = actor.kind === "user" ? actor.userId : null;
  const now = new Date();
  await tx.update(orders).set({ status: input.to, ...(input.to === "cancelled" ? { cancelledAt: now, cancelReason: input.reason ?? null } : {}) }).where(eq(orders.id, o.id));
  await tx.insert(orderStatusHistory).values({ brandId: o.brandId, branchId: o.branchId, orderId: o.id, fromStatus: o.status, toStatus: input.to, actorUserId: actorId, reason: input.reason ?? null });

  const t = TICKET_FOR[input.to];
  if (t) await tx.update(kitchenTickets).set({ status: t.status, ...(t.at ? { [t.at]: now } : {}) }).where(eq(kitchenTickets.orderId, o.id));
  if (input.to === "preparing") await consumeForOrder(tx, o.id, actorId);
  if (input.to === "cancelled") {
    await releaseForOrder(tx, o.id, actorId);
    const [p] = await tx.select().from(payments).where(eq(payments.orderId, o.id));
    if (p?.status === "succeeded" && p.refundedMinor < p.amountMinor) {
      await tx.insert(refunds).values({
        brandId: o.brandId, branchId: o.branchId, orderId: o.id, paymentId: p.id, amountMinor: p.amountMinor - p.refundedMinor,
        reason: `Order cancelled: ${input.reason}`, method: p.refundedMinor === 0n ? "mpesa_reversal" : "manual", status: "requested", requestedByUserId: actorId,
      });
    }
  }
  await enqueue(tx, { topic: "order.status", brandId: o.brandId, aggregateType: "order", aggregateId: o.id, payload: { from: o.status, to: input.to, number: o.number } });
  await recordAudit(tx, actor, { action: "order.transition", scope, targetType: "order", targetId: o.id, metadata: { from: o.status, to: input.to } });
  return { from: o.status, to: input.to };
}

export async function toggleItemDone(tx: Executor, actor: Actor, ticketItemId: string) {
  const id = parseInput(z.uuid(), ticketItemId);
  const [row] = await tx.select({ item: kitchenTicketItems, ticket: kitchenTickets }).from(kitchenTicketItems)
    .innerJoin(kitchenTickets, eq(kitchenTickets.id, kitchenTicketItems.ticketId)).where(eq(kitchenTicketItems.id, id));
  if (!row) throw notFound("Ticket item");
  const [o] = await tx.select().from(orders).where(eq(orders.id, row.ticket.orderId));
  authorize(actor, "kitchen.ticket.update", scopeOf(o!));
  await tx.update(kitchenTicketItems).set({ done: !row.item.done, doneAt: row.item.done ? null : new Date() }).where(eq(kitchenTicketItems.id, id));
}

/** The live board: open tickets, plus those finished in the last 20 minutes. Read through RLS. */
export async function board(tx: Executor, branchId: string) {
  const tickets = await tx.select({ t: kitchenTickets, o: orders }).from(kitchenTickets).innerJoin(orders, eq(orders.id, kitchenTickets.orderId))
    .where(and(eq(kitchenTickets.branchId, branchId), or(notInArray(kitchenTickets.status, ["COMPLETED", "CANCELLED"]), gt(kitchenTickets.completedAt, sql`now() - interval '20 minutes'`))))
    .orderBy(asc(kitchenTickets.priority), asc(kitchenTickets.createdAt));
  const items = tickets.length ? await tx.select().from(kitchenTicketItems).where(inArray(kitchenTicketItems.ticketId, tickets.map((x) => x.t.id))) : [];
  const [clock] = await tx.execute<{ now: string }>(sql`select now()::text as now`);
  return {
    now: clock!.now,
    tickets: tickets.map(({ t, o }) => ({
      id: t.id, orderId: o.id, number: o.number, status: t.status, orderStatus: o.status, fulfilment: o.fulfilment, channel: o.channel,
      createdAt: t.createdAt, etaMinutes: o.etaMinutes, notes: o.notes, customer: o.contactName.split(" ")[0],
      items: items.filter((i) => i.ticketId === t.id).map((i) => ({ id: i.id, name: i.name, detail: i.detail, quantity: i.quantity, allergens: i.allergens, done: i.done })),
    })),
  };
}
