"use server";

import { revalidatePath } from "next/cache";
import { commerce, payments } from "@retero/core";
import { isAppError } from "@retero/shared/errors";
import { Money } from "@retero/shared";
import { act, formObject, type ActionState } from "@/server/action";
import { getSession } from "@/server/auth/session";
import { paymentDeps, runSystem } from "@/server/payments";
import { log } from "@/server/log";

const kes = (v: unknown) => (v === undefined || v === "" ? undefined : Money.parseDecimal(String(v), "KES").amount);

export async function upsertMpesaAccountAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await payments.upsertAccount(tx, actor, { ...o, franchiseeId: o.franchiseeId || null });
    return { message: "Payment settings saved." };
  }, { revalidate: `/ops/b/${String(o.brandId)}/payments` });
}

export async function upsertZoneAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await commerce.upsertZone(tx, actor, {
      branchId: o.branchId, zoneId: o.zoneId, name: o.name, radiusM: o.radiusKm ? Math.round(Number(o.radiusKm) * 1000) : null,
      feeMinor: kes(o.fee) ?? 0n, freeAboveMinor: kes(o.freeAbove) ?? null, minOrderMinor: kes(o.minOrder) ?? null, etaMinutes: o.etaMinutes, active: o.active !== false,
    });
    return { message: "Zone saved." };
  }, { revalidate: `/ops/br/${String(o.branchId)}/zones` });
}

export async function requestRefundAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await payments.requestRefund(tx, actor, { orderId: o.orderId, reason: o.reason, method: o.method, amountMinor: kes(o.amount) });
    return { message: "Refund requested. Someone with refund rights must approve it." };
  }, { revalidate: `/ops/br/${String(o.branchId)}/orders/${String(o.orderId)}` });
}

/** Approval calls M-Pesa, so it runs outside the staff RLS transaction (system runner + verified actor). */
export async function approveRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const o = formObject(fd);
  const s = await getSession();
  if (s.actor.kind !== "user") return { ok: false, message: "Please sign in again." };
  try {
    const r = await payments.approveRefund(runSystem, paymentDeps(), s.actor, { refundId: o.refundId, manualReference: o.manualReference });
    revalidatePath(`/ops/br/${String(o.branchId)}/orders/${String(o.orderId)}`);
    return { ok: true, message: r.status === "succeeded" ? "Refund recorded." : "Reversal sent to M-Pesa. It completes when Safaricom confirms." };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    log.error("refund.approve.failed", { err: e });
    return { ok: false, message: "Something went wrong." };
  }
}
