import type { Permission } from "../rbac/catalogue";

/**
 * Order lifecycle (README §8).
 *   pending_payment → new                          (payments module only)
 *   new → accepted → preparing → baking → ready    (kitchen)
 *   ready → out_for_delivery → delivered → completed   (delivery)
 *   ready → collected → completed                  (collection)
 *   pending_payment | new | accepted → cancelled   (order.manage; payment expiry)
 */
export type OrderStatus =
  | "pending_payment" | "new" | "accepted" | "preparing" | "baking" | "ready"
  | "out_for_delivery" | "delivered" | "collected" | "completed" | "cancelled";

interface Edge { to: OrderStatus; permission: Permission | "system"; fulfilment?: "delivery" | "collection" }

const EDGES: Record<OrderStatus, Edge[]> = {
  pending_payment: [{ to: "new", permission: "system" }, { to: "cancelled", permission: "order.manage" }],
  new: [{ to: "accepted", permission: "kitchen.ticket.update" }, { to: "cancelled", permission: "order.manage" }],
  accepted: [{ to: "preparing", permission: "kitchen.ticket.update" }, { to: "cancelled", permission: "order.manage" }],
  preparing: [{ to: "baking", permission: "kitchen.ticket.update" }],
  baking: [{ to: "ready", permission: "kitchen.ticket.update" }],
  ready: [
    { to: "out_for_delivery", permission: "delivery.update", fulfilment: "delivery" },
    { to: "collected", permission: "order.manage", fulfilment: "collection" },
  ],
  out_for_delivery: [{ to: "delivered", permission: "delivery.update", fulfilment: "delivery" }],
  delivered: [{ to: "completed", permission: "order.manage" }],
  collected: [{ to: "completed", permission: "order.manage" }],
  completed: [],
  cancelled: [],
};

export const KITCHEN_FLOW: OrderStatus[] = ["new", "accepted", "preparing", "baking", "ready"];
export const TERMINAL: OrderStatus[] = ["completed", "cancelled"];

export function edge(from: OrderStatus, to: OrderStatus, fulfilment: "delivery" | "collection"): Edge | null {
  return EDGES[from].find((e) => e.to === to && (!e.fulfilment || e.fulfilment === fulfilment)) ?? null;
}

export function nextStatuses(from: OrderStatus, fulfilment: "delivery" | "collection"): Edge[] {
  return EDGES[from].filter((e) => !e.fulfilment || e.fulfilment === fulfilment);
}
