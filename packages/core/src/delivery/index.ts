import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, forbidden, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize, can } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { recordAudit } from "../audit";
import { transitionOrder } from "../kitchen";

const { orders, deliveryAssignments, deliveryEvents, memberships, roles, users } = schema;
const scopeOf = (o: { brandId: string; franchiseeId: string; branchId: string }): ResourceScope => ({ level: "branch", brandId: o.brandId, franchiseeId: o.franchiseeId, branchId: o.branchId });

export const assignInput = z.object({ orderId: z.uuid(), riderUserId: z.uuid() });

/** Assign a rider (order.manage). The rider must hold delivery_staff at this branch. */
export async function assignRider(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(assignInput, raw);
  const [o] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!o) throw notFound("Order");
  const scope = scopeOf(o);
  authorize(actor, "order.manage", scope);
  if (o.fulfilment !== "delivery") throw conflict("This is a collection order.");
  if (!["accepted", "preparing", "baking", "ready"].includes(o.status)) throw conflict("Only orders in the kitchen can be assigned.");
  const rider = await tx.select({ id: memberships.id }).from(memberships).innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.userId, input.riderUserId), eq(memberships.branchId, o.branchId), eq(roles.key, "delivery_staff"), isNull(memberships.revokedAt)));
  if (!rider.length) throw new AppError("VALIDATION_FAILED", "That person isn't a rider at this branch.");
  await tx.update(deliveryAssignments).set({ status: "cancelled" }).where(and(eq(deliveryAssignments.orderId, o.id), inArray(deliveryAssignments.status, ["assigned"])));
  const [a] = await tx.insert(deliveryAssignments).values({ brandId: o.brandId, branchId: o.branchId, orderId: o.id, riderUserId: input.riderUserId, assignedByUserId: actor.kind === "user" ? actor.userId : null }).returning();
  await tx.insert(deliveryEvents).values({ brandId: o.brandId, branchId: o.branchId, assignmentId: a!.id, orderId: o.id, kind: "assigned", actorUserId: actor.kind === "user" ? actor.userId : null });
  await recordAudit(tx, actor, { action: "delivery.assign", scope, targetType: "order", targetId: o.id, metadata: { riderUserId: input.riderUserId } });
  return a!;
}

export const riderActionInput = z.object({
  assignmentId: z.uuid(),
  action: z.enum(["pick_up", "deliver", "fail"]),
  note: z.string().trim().max(300).nullish(),
  lat: z.coerce.number().min(-90).max(90).nullish(),
  lng: z.coerce.number().min(-180).max(180).nullish(),
});

/** Rider actions. Only the assigned rider (or someone with order.manage) may act on an assignment. */
export async function riderAction(tx: Executor, actor: Actor, raw: unknown) {
  if (actor.kind !== "user") throw forbidden();
  const input = parseInput(riderActionInput, raw);
  const [a] = await tx.select().from(deliveryAssignments).where(eq(deliveryAssignments.id, input.assignmentId)).for("update");
  if (!a) throw notFound("Assignment");
  const [o] = await tx.select().from(orders).where(eq(orders.id, a.orderId));
  const scope = scopeOf(o!);
  authorize(actor, "delivery.update", scope);
  if (a.riderUserId !== actor.userId && !can(actor, "order.manage", scope)) throw forbidden("This delivery is assigned to someone else.");
  const now = new Date();
  const loc = input.lat != null && input.lng != null ? { latitude: input.lat.toFixed(6), longitude: input.lng.toFixed(6) } : {};
  if (input.action === "pick_up") {
    if (a.status !== "assigned") throw conflict("Already picked up.");
    await transitionOrder(tx, actor, { orderId: o!.id, to: "out_for_delivery" });
    await tx.update(deliveryAssignments).set({ status: "picked_up", pickedUpAt: now }).where(eq(deliveryAssignments.id, a.id));
  } else if (input.action === "deliver") {
    if (a.status !== "picked_up") throw conflict("Pick it up first.");
    await transitionOrder(tx, actor, { orderId: o!.id, to: "delivered" });
    await tx.update(deliveryAssignments).set({ status: "delivered", deliveredAt: now }).where(eq(deliveryAssignments.id, a.id));
  } else {
    if (!input.note) throw new AppError("VALIDATION_FAILED", "Say what went wrong.");
    await tx.update(deliveryAssignments).set({ status: "failed" }).where(eq(deliveryAssignments.id, a.id));
  }
  await tx.insert(deliveryEvents).values({ brandId: a.brandId, branchId: a.branchId, assignmentId: a.id, orderId: a.orderId, kind: input.action === "pick_up" ? "picked_up" : input.action === "deliver" ? "delivered" : "failed", note: input.note ?? null, actorUserId: actor.userId, ...loc });
}

/** Riders at a branch (for the assign dropdown). Read through RLS. */
export async function riders(tx: Executor, branchId: string) {
  return tx.select({ userId: users.id, name: users.displayName, email: users.email }).from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId)).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.branchId, branchId), eq(roles.key, "delivery_staff"), isNull(memberships.revokedAt)));
}

export async function myDeliveries(tx: Executor, riderUserId: string) {
  return tx.select({ a: deliveryAssignments, o: orders }).from(deliveryAssignments).innerJoin(orders, eq(orders.id, deliveryAssignments.orderId))
    .where(and(eq(deliveryAssignments.riderUserId, riderUserId), inArray(deliveryAssignments.status, ["assigned", "picked_up"])))
    .orderBy(desc(deliveryAssignments.assignedAt));
}
