"use server";

import { assisted, delivery, inventory, kitchen, payments } from "@retero/core";
import { AppError } from "@retero/shared/errors";
import { actSystem, formObject, type ActionState } from "@/server/action";
import { paymentDeps, runSystem } from "@/server/payments";

/* Kitchen */
export async function transitionAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return actSystem(async ({ tx, actor }) => {
    const r = await kitchen.transitionOrder(tx, actor, { orderId: o.orderId, to: o.to, reason: o.reason ?? null });
    return { message: `Moved to ${r.to.replace(/_/g, " ")}.` };
  }, { revalidate: [`/ops/br/${String(o.branchId)}/orders/${String(o.orderId)}`, `/ops/br/${String(o.branchId)}/delivery`] });
}

/** Kitchen board buttons call this directly (client component). */
export async function boardTransition(orderId: string, to: string) {
  return actSystem(async ({ tx, actor }) => { await kitchen.transitionOrder(tx, actor, { orderId, to }); });
}
export async function boardToggleItem(ticketItemId: string) {
  return actSystem(async ({ tx, actor }) => { await kitchen.toggleItemDone(tx, actor, ticketItemId); });
}

/* Inventory */
export async function trackIngredientAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return actSystem(async ({ tx, actor }) => { await inventory.trackIngredient(tx, actor, o); return { message: "Now tracking." }; }, { revalidate: `/ops/br/${String(o.branchId)}/inventory` });
}
export async function movementAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return actSystem(async ({ tx, actor }) => { await inventory.recordMovement(tx, actor, o); return { message: "Recorded." }; }, { revalidate: `/ops/br/${String(o.branchId)}/inventory` });
}
export async function supplierAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return actSystem(async ({ tx, actor }) => { await inventory.addSupplier(tx, actor, o); return { message: "Supplier added." }; }, { revalidate: `/ops/br/${String(o.branchId)}/inventory` });
}

/* Delivery */
export async function assignRiderAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return actSystem(async ({ tx, actor }) => { await delivery.assignRider(tx, actor, o); return { message: "Rider assigned." }; }, { revalidate: `/ops/br/${String(o.branchId)}/delivery` });
}
export async function riderAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return actSystem(async ({ tx, actor }) => { await delivery.riderAction(tx, actor, o); return { message: "Updated." }; }, { revalidate: `/ops/br/${String(o.branchId)}/delivery` });
}

/* WhatsApp / phone assisted orders */
export async function openAssistedAction(branchId: string, reference: string | null) {
  let cartId: string | null = null;
  const st = await actSystem(async ({ tx, actor }) => { cartId = (await assisted.openAssistedCart(tx, actor, { branchId, reference })).id; });
  return st?.ok ? { ok: true as const, cartId: cartId! } : { ok: false as const, message: st && !st.ok ? st.message : "Failed" };
}
export async function assistedViewAction(cartId: string) {
  let view: unknown = null;
  const st = await actSystem(async ({ tx, actor }) => { view = await assisted.assistedView(tx, actor, cartId); });
  return st?.ok ? { ok: true as const, view: JSON.parse(JSON.stringify(view, (_k, v) => (typeof v === "bigint" ? Number(v) : v))) } : { ok: false as const, message: st && !st.ok ? st.message : "Failed" };
}
export async function assistedAddAction(cartId: string, line: unknown) {
  const st = await actSystem(async ({ tx, actor }) => { await assisted.assistedAdd(tx, actor, cartId, line); });
  return st?.ok ? { ok: true as const } : { ok: false as const, message: st && !st.ok ? st.message : "Failed" };
}
export async function assistedPlaceAction(input: unknown) {
  let result: { orderId: string; number: string; branchId: string } | null = null;
  const st = await actSystem(async ({ tx, actor }) => {
    const r = await assisted.placeAssistedOrder(tx, actor, input);
    result = { orderId: r.order.id, number: r.order.number, branchId: r.order.branchId };
  });
  if (!st?.ok || !result) return { ok: false as const, message: st && !st.ok ? st.message : "Failed" };
  const { orderId, number, branchId } = result;
  const phone = (input as { contact: { phone: string } }).contact.phone;
  try {
    const p = await payments.initiatePayment(runSystem, paymentDeps(), { orderId, phone });
    return { ok: true as const, number, branchId, orderId, message: `Order ${number} placed. ${p.customerMessage}` };
  } catch (e) {
    return { ok: true as const, number, branchId, orderId, message: `Order ${number} placed, but the M-Pesa prompt failed: ${e instanceof AppError ? e.message : "error"}. Retry from the order page.` };
  }
}
export async function staffRetryPayment(orderId: string, phone: string) {
  try {
    const p = await payments.initiatePayment(runSystem, paymentDeps(), { orderId, phone });
    return { ok: true as const, message: p.customerMessage };
  } catch (e) {
    return { ok: false as const, message: e instanceof AppError ? e.message : "Failed" };
  }
}
