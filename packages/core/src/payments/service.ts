import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, forbidden, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize, can } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { recordAudit } from "../audit";
import { enqueue } from "../outbox";
import { maskPhone, normalizeKenyanMobile } from "../commerce/phone";
import { gatewayFor, resolveAccount, type GatewayDeps } from "./mpesa/accounts";
import { classifyResult, GatewayError, type MpesaGateway } from "./mpesa/gateway";
import { onOrderPaid } from "./hooks";

/*
 * Payments. Rules (README §6):
 * - A browser redirect or client message is never proof of payment.
 * - Every callback is persisted before it is processed.
 * - Success is only applied after STK Query confirms it (transaction verification).
 * - Everything is idempotent on CheckoutRequestID / attempt id.
 * Network calls happen OUTSIDE database transactions.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export type RunTx = <T>(fn: (tx: Executor) => Promise<T>) => Promise<T>;

export interface PaymentDeps extends GatewayDeps {
  /** Public HTTPS base for callbacks, e.g. https://pay.retero.co.ke */
  callbackBaseUrl: string;
  /** Override gateway resolution (tests). */
  gateway?: (acct: Awaited<ReturnType<typeof resolveAccount>>) => MpesaGateway;
}

const gw = (deps: PaymentDeps, acct: Awaited<ReturnType<typeof resolveAccount>>) => (deps.gateway ? deps.gateway(acct) : gatewayFor(acct, deps));
const toKes = (minor: bigint) => {
  if (minor % 100n !== 0n) throw new AppError("INTERNAL", "M-Pesa amounts must be whole shillings.");
  return Number(minor / 100n);
};

export const MAX_ATTEMPTS_PER_ORDER = 5;
/** Age of an attempt by the DATABASE clock (never mix DB and app clocks). */
const ageMs = () => sql<number>`(extract(epoch from (now() - ${schema.paymentAttempts.requestedAt})) * 1000)::float8`;
const REUSE_WINDOW_MS = 60_000;

/* ── Initiate (STK Push) ────────────────────────────────────────── */

export const initiateInput = z.object({ orderId: z.uuid(), phone: z.string().min(9).max(20) });

export async function initiatePayment(run: RunTx, deps: PaymentDeps, raw: unknown) {
  const input = parseInput(initiateInput, raw);
  const phone = normalizeKenyanMobile(input.phone);

  // A — validate and record the attempt (so a crash mid-call is visible).
  const prepared = await run(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, input.orderId)).for("update");
    if (!order) throw notFound("Order");
    if (order.status !== "pending_payment") throw conflict(order.paymentStatus === "paid" ? "This order is already paid." : "This order can no longer be paid.");
    const [due] = await tx.select({ expired: sql<boolean>`${schema.orders.paymentDueAt} < now()` }).from(schema.orders).where(eq(schema.orders.id, order.id));
    if (due?.expired) throw conflict("The payment window for this order has closed. Please place it again.");
    const acct = await resolveAccount(tx, order.brandId, order.franchiseeId);

    let [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
    if (!payment) {
      [payment] = await tx.insert(schema.payments).values({
        brandId: order.brandId, branchId: order.branchId, orderId: order.id, accountId: acct.id, amountMinor: order.totalMinor, currency: order.currency,
      }).returning();
      await tx.update(schema.orders).set({ paymentStatus: "pending" }).where(eq(schema.orders.id, order.id));
    }
    const attempts = await tx.select({ a: schema.paymentAttempts, ageMs: ageMs() }).from(schema.paymentAttempts).where(eq(schema.paymentAttempts.paymentId, payment!.id)).orderBy(asc(schema.paymentAttempts.requestedAt));
    const live = attempts.find((x) => (x.a.status === "initiated" || x.a.status === "initiating") && x.ageMs < REUSE_WINDOW_MS)?.a;
    if (live) return { kind: "reuse" as const, reuse: live };
    if (attempts.length >= MAX_ATTEMPTS_PER_ORDER) throw new AppError("RATE_LIMITED", "Too many payment attempts for this order. Please call the branch.");

    const token = randomBytes(24).toString("base64url");
    const [attempt] = await tx.insert(schema.paymentAttempts).values({
      brandId: order.brandId, paymentId: payment!.id, callbackTokenHash: sha(token), amountMinor: order.totalMinor, phoneMasked: maskPhone(phone),
    }).returning();
    return { kind: "new" as const, attempt: attempt!, token, order, acct };
  });

  if (prepared.kind === "reuse") {
    return { attemptId: prepared.reuse.id, status: prepared.reuse.status, customerMessage: "We've already sent a payment request to your phone. Check your phone.", reused: true };
  }

  // B — call Daraja (no transaction held).
  const { attempt, token, order, acct } = prepared;
  let push;
  try {
    push = await gw(deps, acct).stkPush({
      amountKes: toKes(order.totalMinor), phone: phone.slice(1), accountReference: order.number, description: `Order ${order.number}`,
      callbackUrl: `${deps.callbackBaseUrl.replace(/\/$/, "")}/api/webhooks/mpesa/stk/${token}`,
    });
  } catch (e) {
    await run((tx) => tx.update(schema.paymentAttempts).set({
      status: "error", completedAt: new Date(), resultDesc: e instanceof Error ? e.message.slice(0, 300) : "error",
      providerResponse: e instanceof GatewayError ? (e.body as Record<string, unknown>) : null,
    }).where(eq(schema.paymentAttempts.id, attempt.id)));
    throw new AppError("CONFLICT", "M-Pesa didn't accept the request. Check the number and try again.", { cause: e });
  }

  // C — remember the provider ids for callbacks and reconciliation.
  await run((tx) => tx.update(schema.paymentAttempts).set({
    status: "initiated", checkoutRequestId: push.checkoutRequestId, merchantRequestId: push.merchantRequestId, providerResponse: push.raw,
  }).where(eq(schema.paymentAttempts.id, attempt.id)));
  return { attemptId: attempt.id, status: "initiated" as const, customerMessage: push.customerMessage, reused: false };
}

/* ── Callback ingest ────────────────────────────────────────────── */

const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.coerce.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z.object({ Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })) }).optional(),
    }),
  }),
});

export type CallbackOutcome = "applied" | "failed" | "duplicate" | "unknown_token" | "mismatch" | "unverified" | "amount_mismatch" | "malformed";

/**
 * Process an STK callback. Always persists the raw payload first. Safe to
 * call any number of times with the same body (duplicates are recorded and
 * ignored). Returns the outcome for logging; the HTTP layer always answers 200.
 */
export async function handleStkCallback(run: RunTx, deps: PaymentDeps, input: { token: string; payload: unknown; sourceIpHash?: string | null }): Promise<CallbackOutcome> {
  const parsed = stkCallbackSchema.safeParse(input.payload);
  const cb = parsed.success ? parsed.data.Body.stkCallback : null;
  const tokenHash = sha(input.token);

  const ctx = await run(async (tx) => {
    const [row] = await tx.insert(schema.mpesaCallbacks).values({
      kind: "stk", tokenHash, payload: input.payload ?? {}, checkoutRequestId: cb?.CheckoutRequestID ?? null, sourceIpHash: input.sourceIpHash ?? null,
    }).returning({ id: schema.mpesaCallbacks.id });
    const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.callbackTokenHash, tokenHash));
    if (attempt) await tx.update(schema.mpesaCallbacks).set({ attemptId: attempt.id }).where(eq(schema.mpesaCallbacks.id, row!.id));
    return { callbackId: row!.id, attempt };
  });

  const finish = async (outcome: CallbackOutcome, error?: string) => {
    await run((tx) => tx.update(schema.mpesaCallbacks).set({ processedAt: new Date(), outcome, error: error ?? null }).where(eq(schema.mpesaCallbacks.id, ctx.callbackId)));
    return outcome;
  };

  if (!cb) return finish("malformed", parsed.success ? undefined : parsed.error.message.slice(0, 300));
  const attempt = ctx.attempt;
  if (!attempt) return finish("unknown_token");
  if (attempt.checkoutRequestId && attempt.checkoutRequestId !== cb.CheckoutRequestID) return finish("mismatch");
  if (attempt.status === "succeeded") return finish("duplicate");

  if (cb.ResultCode !== 0) {
    if (attempt.status !== "initiated" && attempt.status !== "initiating") return finish("duplicate");
    await run((tx) => applyFailure(tx, attempt.id, cb.ResultCode, cb.ResultDesc));
    return finish("failed");
  }

  // Success claimed: check amount, then verify with Daraja before believing it.
  const meta = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
  const paidKes = Number(meta.Amount);
  if (!Number.isFinite(paidKes) || BigInt(Math.round(paidKes * 100)) !== attempt.amountMinor) return finish("amount_mismatch");

  const verified = await verifyAttempt(run, deps, attempt.id);
  if (verified.state !== "succeeded") return finish("unverified", verified.resultDesc);
  await run((tx) => applySuccess(tx, attempt.id, { receipt: meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : null }));
  return finish("applied");
}

async function verifyAttempt(run: RunTx, deps: PaymentDeps, attemptId: string) {
  const { attempt, acct } = await run(async (tx) => {
    const [a] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId));
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, a!.paymentId));
    const [acct] = await tx.select().from(schema.mpesaAccounts).where(eq(schema.mpesaAccounts.id, p!.accountId));
    return { attempt: a!, acct: acct! };
  });
  if (!attempt.checkoutRequestId) return { state: "pending" as const, resultDesc: "no checkout id yet" };
  try {
    const r = await gw(deps, acct).stkQuery(attempt.checkoutRequestId);
    await run((tx) => tx.update(schema.paymentAttempts).set({ queryCount: sql`${schema.paymentAttempts.queryCount} + 1`, lastQueriedAt: new Date() }).where(eq(schema.paymentAttempts.id, attemptId)));
    return r;
  } catch (e) {
    return { state: "pending" as const, resultDesc: e instanceof Error ? e.message : "query failed" };
  }
}

/** Mark an attempt (and its payment/order) paid. Idempotent; locks rows in a fixed order. */
export async function applySuccess(tx: Executor, attemptId: string, info: { receipt: string | null }) {
  const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId)).for("update");
  if (!attempt) throw notFound("Payment attempt");
  const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.id, attempt.paymentId)).for("update");
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, payment!.orderId)).for("update");
  if (attempt.status === "succeeded") {
    // A late callback may bring the receipt a reconciliation query couldn't.
    if (info.receipt && !attempt.mpesaReceipt) {
      await tx.update(schema.paymentAttempts).set({ mpesaReceipt: info.receipt }).where(eq(schema.paymentAttempts.id, attemptId));
      if (!payment!.mpesaReceipt) await tx.update(schema.payments).set({ mpesaReceipt: info.receipt }).where(eq(schema.payments.id, payment!.id));
    }
    return { order: order!, alreadyApplied: true };
  }
  const now = new Date();
  await tx.update(schema.paymentAttempts).set({ status: "succeeded", resultCode: 0, mpesaReceipt: info.receipt, completedAt: now }).where(eq(schema.paymentAttempts.id, attemptId));
  if (payment!.status === "succeeded") {
    // A second, different attempt also succeeded: customer paid twice. Refund the extra.
    await tx.insert(schema.refunds).values({
      brandId: payment!.brandId, branchId: payment!.branchId, orderId: order!.id, paymentId: payment!.id, amountMinor: attempt.amountMinor,
      reason: `Duplicate payment (attempt ${attempt.id})`, method: "manual", status: "requested",
    });
    await enqueue(tx, { topic: "payment.duplicate", brandId: order!.brandId, aggregateType: "order", aggregateId: order!.id, payload: { attemptId } });
    return { order: order!, alreadyApplied: true };
  }
  await tx.update(schema.payments).set({ status: "succeeded", mpesaReceipt: info.receipt, payerPhoneMasked: attempt.phoneMasked, paidAt: now }).where(eq(schema.payments.id, payment!.id));

  if (order!.status === "pending_payment") {
    await tx.update(schema.orders).set({ status: "new", paymentStatus: "paid", paidAt: now }).where(eq(schema.orders.id, order!.id));
    await tx.insert(schema.orderStatusHistory).values({ brandId: order!.brandId, branchId: order!.branchId, orderId: order!.id, fromStatus: "pending_payment", toStatus: "new", reason: "M-Pesa payment confirmed" });
    await enqueue(tx, { topic: "order.paid", brandId: order!.brandId, aggregateType: "order", aggregateId: order!.id, payload: { number: order!.number, receipt: info.receipt } });
    await onOrderPaid(tx, order!.id);
  } else {
    // Money arrived after the order was cancelled (e.g. payment window expired): refund it.
    await tx.update(schema.orders).set({ paymentStatus: "paid", paidAt: now }).where(eq(schema.orders.id, order!.id));
    await tx.insert(schema.refunds).values({
      brandId: order!.brandId, branchId: order!.branchId, orderId: order!.id, paymentId: payment!.id, amountMinor: payment!.amountMinor,
      reason: "Paid after the order was cancelled", method: "mpesa_reversal", status: "requested",
    });
    await enqueue(tx, { topic: "payment.paid_after_cancel", brandId: order!.brandId, aggregateType: "order", aggregateId: order!.id, payload: { number: order!.number } });
  }
  return { order: order!, alreadyApplied: false };
}

export async function applyFailure(tx: Executor, attemptId: string, code: number, desc: string) {
  const state = classifyResult(code);
  await tx.update(schema.paymentAttempts).set({
    status: state === "succeeded" ? "failed" : state, resultCode: code, resultDesc: desc.slice(0, 300), completedAt: new Date(),
  }).where(and(eq(schema.paymentAttempts.id, attemptId), inArray(schema.paymentAttempts.status, ["initiating", "initiated"])));
  // The order stays pending_payment: the customer can retry until the window closes.
}

/* ── Reconciliation & expiry (worker) ───────────────────────────── */

/**
 * Settle attempts whose callback never arrived (or arrived unverified) by
 * asking Daraja directly. Backs off per attempt; gives up as `timeout`.
 */
export async function reconcilePending(run: RunTx, deps: PaymentDeps, opts: { olderThanMs?: number; limit?: number } = {}) {
  const olderThanS = (opts.olderThanMs ?? 45_000) / 1000;
  const stale = await run((tx) => tx.select({ a: schema.paymentAttempts, ageMs: ageMs() }).from(schema.paymentAttempts).where(and(
    eq(schema.paymentAttempts.status, "initiated"), sql`${schema.paymentAttempts.requestedAt} <= now() - make_interval(secs => ${olderThanS})`,
    or(sql`${schema.paymentAttempts.lastQueriedAt} IS NULL`, lt(schema.paymentAttempts.lastQueriedAt, sql`now() - (interval '20 seconds' * power(2, least(${schema.paymentAttempts.queryCount}, 5)))`)),
  )).orderBy(asc(schema.paymentAttempts.requestedAt)).limit(opts.limit ?? 20));

  const results: { attemptId: string; outcome: string }[] = [];
  for (const { a, ageMs: age } of stale) {
    const r = await verifyAttempt(run, deps, a.id);
    if (r.state === "succeeded") {
      await run((tx) => applySuccess(tx, a.id, { receipt: null }));
      results.push({ attemptId: a.id, outcome: "succeeded" });
    } else if (r.state === "pending") {
      if (age > 5 * 60_000) {
        await run((tx) => tx.update(schema.paymentAttempts).set({ status: "timeout", resultDesc: "No result after 5 minutes", completedAt: new Date() }).where(and(eq(schema.paymentAttempts.id, a.id), eq(schema.paymentAttempts.status, "initiated"))));
        results.push({ attemptId: a.id, outcome: "timeout" });
      } else results.push({ attemptId: a.id, outcome: "pending" });
    } else {
      await run((tx) => applyFailure(tx, a.id, r.resultCode, r.resultDesc));
      results.push({ attemptId: a.id, outcome: r.state });
    }
  }
  // Attempts stuck in `initiating` (crash between record and Daraja call).
  await run((tx) => tx.update(schema.paymentAttempts).set({ status: "error", resultDesc: "Never reached M-Pesa", completedAt: new Date() })
    .where(and(eq(schema.paymentAttempts.status, "initiating"), sql`${schema.paymentAttempts.requestedAt} < now() - interval '2 minutes'`)));
  return results;
}

/** Cancel orders whose payment window closed with nothing in flight. */
export async function expireUnpaidOrders(run: RunTx, opts: { limit?: number } = {}) {
  return run(async (tx) => {
    const due = await tx.select().from(schema.orders).where(and(eq(schema.orders.status, "pending_payment"), sql`${schema.orders.paymentDueAt} < now()`))
      .limit(opts.limit ?? 50).for("update", { skipLocked: true });
    const cancelled: string[] = [];
    for (const o of due) {
      const inflight = await tx.select({ id: schema.paymentAttempts.id }).from(schema.paymentAttempts)
        .innerJoin(schema.payments, eq(schema.payments.id, schema.paymentAttempts.paymentId))
        .where(and(eq(schema.payments.orderId, o.id), eq(schema.paymentAttempts.status, "initiated"), sql`${schema.paymentAttempts.requestedAt} > now() - interval '3 minutes'`));
      if (inflight.length) continue;
      await tx.update(schema.orders).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "Payment window expired", paymentStatus: o.paymentStatus === "pending" ? "unpaid" : o.paymentStatus }).where(eq(schema.orders.id, o.id));
      await tx.insert(schema.orderStatusHistory).values({ brandId: o.brandId, branchId: o.branchId, orderId: o.id, fromStatus: "pending_payment", toStatus: "cancelled", reason: "Payment window expired" });
      await enqueue(tx, { topic: "order.cancelled", brandId: o.brandId, aggregateType: "order", aggregateId: o.id, payload: { reason: "payment_expired" } });
      cancelled.push(o.id);
    }
    return cancelled;
  });
}

/* ── Refunds ────────────────────────────────────────────────────── */

const orderScope = (o: { brandId: string; franchiseeId: string; branchId: string }): ResourceScope => ({ level: "branch", brandId: o.brandId, franchiseeId: o.franchiseeId, branchId: o.branchId });

export const requestRefundInput = z.object({
  orderId: z.uuid(),
  amountMinor: z.coerce.bigint().optional(),
  reason: z.string().trim().min(3).max(300),
  method: z.enum(["mpesa_reversal", "manual"]).default("mpesa_reversal"),
});

/** Staff request a refund (order.manage). A different person with order.refund approves it. */
export async function requestRefund(tx: Executor, actor: Actor, raw: unknown) {
  if (actor.kind !== "user") throw forbidden();
  const input = parseInput(requestRefundInput, raw);
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, input.orderId));
  if (!order) throw notFound("Order");
  const scope = orderScope(order);
  authorize(actor, "order.manage", scope);
  const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
  if (!payment || payment.status !== "succeeded") throw conflict("There is no completed payment to refund.");
  const open = await tx.select({ s: sql<string>`coalesce(sum(${schema.refunds.amountMinor}), 0)::text` }).from(schema.refunds)
    .where(and(eq(schema.refunds.paymentId, payment.id), inArray(schema.refunds.status, ["requested", "approved", "processing"])));
  const available = payment.amountMinor - payment.refundedMinor - BigInt(open[0]?.s ?? "0");
  const amount = input.amountMinor ?? available;
  if (amount <= 0n || amount > available) throw new AppError("VALIDATION_FAILED", "Refund amount exceeds what can still be refunded.");
  if (input.method === "mpesa_reversal" && (amount !== payment.amountMinor || payment.refundedMinor > 0n)) {
    throw new AppError("VALIDATION_FAILED", "M-Pesa reversals return the whole payment. Use a manual refund for part-refunds.");
  }
  // Inserted via the app role: RLS requires order.refund OR we insert as system below.
  const [r] = await tx.insert(schema.refunds).values({
    brandId: order.brandId, branchId: order.branchId, orderId: order.id, paymentId: payment.id, amountMinor: amount,
    reason: input.reason, method: input.method, status: "requested", requestedByUserId: actor.userId,
  }).returning();
  await recordAudit(tx, actor, { action: "refund.request", scope, targetType: "refund", targetId: r!.id, metadata: { amountMinor: amount.toString(), method: input.method } });
  return r!;
}

export const approveRefundInput = z.object({ refundId: z.uuid(), manualReference: z.string().trim().min(3).max(80).optional() });

/**
 * Approve and execute. Maker-checker: the approver needs order.refund and
 * must not be the requester (D-022). Manual refunds complete immediately with
 * a reference; reversals go to M-Pesa and complete on the result callback.
 */
export async function approveRefund(run: RunTx, deps: PaymentDeps, actor: Actor, raw: unknown) {
  if (actor.kind !== "user") throw forbidden();
  const input = parseInput(approveRefundInput, raw);
  const prep = await run(async (tx) => {
    const [r] = await tx.select().from(schema.refunds).where(eq(schema.refunds.id, input.refundId)).for("update");
    if (!r) throw notFound("Refund");
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
    const scope = orderScope(order!);
    authorize(actor, "order.refund", scope);
    if (r.status !== "requested") throw conflict("This refund has already been handled.");
    if (r.requestedByUserId && r.requestedByUserId === actor.userId) throw new AppError("FORBIDDEN", "Someone else must approve a refund you requested.");
    const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.id, r.paymentId));
    const [acct] = await tx.select().from(schema.mpesaAccounts).where(eq(schema.mpesaAccounts.id, payment!.accountId));
    if (r.method === "manual") {
      if (!input.manualReference) throw new AppError("VALIDATION_FAILED", "Enter the reference of the manual refund.");
      await tx.update(schema.refunds).set({ status: "succeeded", approvedByUserId: actor.userId, manualReference: input.manualReference, completedAt: new Date() }).where(eq(schema.refunds.id, r.id));
      await settleRefund(tx, r.paymentId, r.amountMinor);
      await recordAudit(tx, actor, { action: "refund.manual", scope, targetType: "refund", targetId: r.id, metadata: { reference: input.manualReference } });
      return { done: true as const };
    }
    if (!payment!.mpesaReceipt) throw conflict("No M-Pesa receipt on file yet; wait for the confirmation or refund manually.");
    const token = randomBytes(24).toString("base64url");
    await tx.update(schema.refunds).set({ status: "processing", approvedByUserId: actor.userId, callbackTokenHash: sha(token) }).where(eq(schema.refunds.id, r.id));
    await recordAudit(tx, actor, { action: "refund.approve", scope, targetType: "refund", targetId: r.id, metadata: { amountMinor: r.amountMinor.toString() } });
    return { done: false as const, refund: r, receipt: payment!.mpesaReceipt, acct: acct!, token };
  });
  if (prep.done) return { status: "succeeded" as const };

  try {
    const base = deps.callbackBaseUrl.replace(/\/$/, "");
    const res = await gw(deps, prep.acct).reversal({
      transactionId: prep.receipt, amountKes: toKes(prep.refund.amountMinor), remarks: `Refund ${prep.refund.id.slice(0, 8)}`,
      resultUrl: `${base}/api/webhooks/mpesa/reversal/${prep.token}`, timeoutUrl: `${base}/api/webhooks/mpesa/reversal/${prep.token}?timeout=1`,
    });
    await run((tx) => tx.update(schema.refunds).set({ providerRef: res.originatorConversationId }).where(eq(schema.refunds.id, prep.refund.id)));
    return { status: "processing" as const };
  } catch (e) {
    await run((tx) => tx.update(schema.refunds).set({ status: "failed", resultDesc: e instanceof Error ? e.message.slice(0, 300) : "error", completedAt: new Date() }).where(eq(schema.refunds.id, prep.refund.id)));
    throw new AppError("CONFLICT", "M-Pesa rejected the reversal request. You can refund manually instead.", { cause: e });
  }
}

const reversalSchema = z.object({ Result: z.object({ ResultCode: z.coerce.number(), ResultDesc: z.string(), OriginatorConversationID: z.string().optional() }) });

export async function handleReversalResult(run: RunTx, input: { token: string; payload: unknown; timeout?: boolean }) {
  const tokenHash = sha(input.token);
  return run(async (tx) => {
    const [cb] = await tx.insert(schema.mpesaCallbacks).values({ kind: input.timeout ? "reversal_timeout" : "reversal_result", tokenHash, payload: input.payload ?? {} }).returning();
    const [r] = await tx.select().from(schema.refunds).where(eq(schema.refunds.callbackTokenHash, tokenHash)).for("update");
    const done = (outcome: string) => tx.update(schema.mpesaCallbacks).set({ processedAt: new Date(), outcome, refundId: r?.id ?? null }).where(eq(schema.mpesaCallbacks.id, cb!.id)).then(() => outcome);
    if (!r) return done("unknown_token");
    if (r.status !== "processing") return done("duplicate");
    if (input.timeout) return done("timeout_noted"); // stays processing; ops can retry or refund manually
    const parsed = reversalSchema.safeParse(input.payload);
    if (!parsed.success) return done("malformed");
    const ok = parsed.data.Result.ResultCode === 0;
    await tx.update(schema.refunds).set({ status: ok ? "succeeded" : "failed", resultCode: parsed.data.Result.ResultCode, resultDesc: parsed.data.Result.ResultDesc.slice(0, 300), completedAt: new Date() }).where(eq(schema.refunds.id, r.id));
    if (ok) await settleRefund(tx, r.paymentId, r.amountMinor);
    await enqueue(tx, { topic: ok ? "refund.succeeded" : "refund.failed", brandId: r.brandId, aggregateType: "order", aggregateId: r.orderId, payload: { refundId: r.id } });
    return done(ok ? "applied" : "failed");
  });
}

async function settleRefund(tx: Executor, paymentId: string, amount: bigint) {
  const [p] = await tx.update(schema.payments).set({ refundedMinor: sql`${schema.payments.refundedMinor} + ${amount}` }).where(eq(schema.payments.id, paymentId)).returning();
  await tx.update(schema.orders).set({ paymentStatus: p!.refundedMinor >= p!.amountMinor ? "refunded" : "partially_refunded" }).where(eq(schema.orders.id, p!.orderId));
}

/** Who can see what about a payment — used by ops screens. */
export const canRefund = (actor: Actor, o: { brandId: string; franchiseeId: string; branchId: string }) => can(actor, "order.refund", orderScope(o));
