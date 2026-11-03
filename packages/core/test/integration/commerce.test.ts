import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, withActor, withSystem, type Executor, type Tx } from "@retero/db";
import { AppError } from "@retero/shared/errors";
import { loadActor } from "../../src/identity";
import { importCatalogue, readTemplate, getBranchMenu, setBranchVariantPrice } from "../../src/catalogue";
import * as commerce from "../../src/commerce";
import * as payments from "../../src/payments";
import type { MpesaGateway, StkQueryResult } from "../../src/payments";
import { expectDbError, grant, makeBrandTree, makeUser, openAllWeek, openDbs } from "../../../../test/fixtures";

const dbs = openDbs();
const { owner, app, system } = dbs;
afterAll(() => dbs.close());

const run: payments.RunTx = (fn) => withSystem(system, "test", fn);
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof AppError ? e.code : String(e); } };
const as = <T>(u: string, fn: (tx: Tx, a: Awaited<ReturnType<typeof loadActor>>) => Promise<T>) => withActor(app, u, async (tx) => fn(tx, await loadActor(tx, u)));

/* A scriptable fake Daraja: records pushes, answers queries from a map. */
const pushes: { phone: string; amountKes: number; callbackUrl: string; checkoutRequestId: string }[] = [];
const queryAnswers = new Map<string, StkQueryResult>();
const reversals: { transactionId: string; resultUrl: string }[] = [];
let seq = 0;
const fake: MpesaGateway = {
  kind: "daraja",
  async stkPush(req) {
    const checkoutRequestId = `ws_CO_TEST_${++seq}`;
    pushes.push({ ...req, checkoutRequestId });
    return { merchantRequestId: `m${seq}`, checkoutRequestId, customerMessage: "Success", raw: {} };
  },
  async stkQuery(id) { return queryAnswers.get(id) ?? { state: "pending", resultDesc: "processing" }; },
  async reversal(req) { reversals.push(req); return { conversationId: "AG_1", originatorConversationId: "OC_1", raw: {} }; },
};
const deps: payments.PaymentDeps = { env: {}, allowSimulator: false, callbackBaseUrl: "https://pay.test", gateway: () => fake };

let T: Awaited<ReturnType<typeof makeBrandTree>>;
let menuIds: { marg: string; margClassic: string; pepperoni: string };
let manager: string, franchiseAdmin: string, otherKitchen: string, customerUser: string;

beforeAll(async () => {
  T = await makeBrandTree(owner);
  await owner.insert(schema.brandSettings).values({ brandId: T.brand.id });
  await owner.update(schema.branches).set({ latitude: "-1.267600", longitude: "36.810800" }).where(eq(schema.branches.id, T.b1.id));
  await openAllWeek(owner, T.brand.id, T.b1.id);
  await owner.insert(schema.deliveryZones).values({ brandId: T.brand.id, branchId: T.b1.id, name: "Westlands", radiusM: 4000, feeMinor: 15000n, freeAboveMinor: 300000n, minOrderMinor: 50000n, etaMinutes: 35 });
  await owner.insert(schema.mpesaAccounts).values({ brandId: T.brand.id, environment: "sandbox", shortcode: "174379", credentialsRef: "MPESA_TEST" });
  await owner.transaction(async (tx) => importCatalogue(tx, { kind: "system", reason: "test" }, T.brand.id, await readTemplate(new URL("../../templates/starter-menu.json", import.meta.url).pathname), { publish: true }));
  const menu = await withSystem(system, "t", (tx) => getBranchMenu(tx, T.b1.id));
  const marg = menu.products.find((p) => p.slug === "margherita")!;
  menuIds = { marg: marg.id, margClassic: marg.variants.find((v) => v.code === "classic")!.id, pepperoni: Object.values(menu.options).find((o) => o.code === "pepperoni")!.id };
  manager = await makeUser(owner, "c-mgr");
  franchiseAdmin = await makeUser(owner, "c-fa");
  otherKitchen = await makeUser(owner, "c-k3");
  customerUser = await makeUser(owner, "c-cust");
  await grant(owner, manager, "branch_manager", { brandId: T.brand.id, branchId: T.b1.id });
  await grant(owner, franchiseAdmin, "franchise_admin", { brandId: T.brand.id, franchiseeId: T.f1.id });
  await grant(owner, otherKitchen, "kitchen_staff", { brandId: T.brand.id, branchId: T.b3.id });
});

beforeEach(() => { pushes.length = 0; queryAnswers.clear(); reversals.length = 0; });

/** Cart → quote → order, as the storefront does. */
async function checkout(opts: { fulfilment?: "delivery" | "collection"; qty?: number; userId?: string } = {}) {
  const { cart, token } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
  await run(async (tx) => commerce.addCartItem(tx, await commerce.cartByToken(tx, token), { productId: menuIds.marg, variantId: menuIds.margClassic, optionIds: null, quantity: opts.qty ?? 1 }));
  const fulfilment = opts.fulfilment ?? "collection";
  const { quote } = await run(async (tx) => commerce.createQuote(tx, await commerce.cartByToken(tx, token), fulfilment === "delivery" ? { fulfilment, lat: -1.2741, lng: 36.8155 } : { fulfilment }));
  const placed = await run(async (tx) => commerce.placeOrder(tx, await commerce.cartByToken(tx, token), {
    quoteId: quote.id, idempotencyKey: `idem-${Math.random().toString(36).slice(2)}-xxxxxx`,
    contact: { name: "Wanjiku Kamau", phone: "0712 345 678" }, userId: opts.userId ?? null,
    address: fulfilment === "delivery" ? { line1: "Mpaka Rd", city: "Nairobi" } : null,
  }));
  return { cart, token, quote, ...placed };
}

const stkBody = (checkoutRequestId: string, resultCode: number, amountKes?: number) => ({
  Body: { stkCallback: {
    MerchantRequestID: "m", CheckoutRequestID: checkoutRequestId, ResultCode: resultCode, ResultDesc: resultCode === 0 ? "ok" : "nope",
    ...(resultCode === 0 ? { CallbackMetadata: { Item: [{ Name: "Amount", Value: amountKes }, { Name: "MpesaReceiptNumber", Value: `RCP${seq}${Math.random().toString(36).slice(2, 6).toUpperCase()}` }, { Name: "PhoneNumber", Value: 254712345678 }] } } : {}),
  } },
});
const tokenOf = (url: string) => url.split("/").pop()!;

describe("checkout engine", () => {
  it("quotes delivery with zone fee and minimum order; refuses outside the zone", async () => {
    const { cart, token } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
    await run(async (tx) => commerce.addCartItem(tx, cart, { productId: menuIds.marg, variantId: menuIds.margClassic, quantity: 1 }));
    const q = await run(async (tx) => commerce.createQuote(tx, await commerce.cartByToken(tx, token), { fulfilment: "delivery", lat: -1.2741, lng: 36.8155 }));
    expect(q.quote).toMatchObject({ subtotalMinor: 95000n, deliveryFeeMinor: 15000n, totalMinor: 110000n, vatIncludedMinor: 15172n });
    expect(await code(run(async (tx) => commerce.createQuote(tx, cart, { fulfilment: "delivery", lat: -1.0332, lng: 37.0693 })))).toBe("VALIDATION_FAILED");
    // Free delivery above KES 3,000
    await run(async (tx) => commerce.addCartItem(tx, cart, { productId: menuIds.marg, variantId: menuIds.margClassic, quantity: 3 }));
    const q2 = await run((tx) => commerce.createQuote(tx, cart, { fulfilment: "delivery", lat: -1.2741, lng: 36.8155 }));
    expect(q2.quote.deliveryFeeMinor).toBe(0n);
  });

  it("refuses to quote when the cart is empty or the branch is closed", async () => {
    const { cart } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
    expect(await code(run((tx) => commerce.createQuote(tx, cart, { fulfilment: "collection" })))).toBe("VALIDATION_FAILED");
    await owner.insert(schema.branchClosures).values({ brandId: T.brand.id, branchId: T.b1.id, startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 3000), reason: "test" });
    await run((tx) => commerce.addCartItem(tx, cart, { productId: menuIds.marg, variantId: menuIds.margClassic, quantity: 1 }));
    expect(await code(run((tx) => commerce.createQuote(tx, cart, { fulfilment: "collection" })))).toBe("CONFLICT");
    await new Promise((r) => setTimeout(r, 3100));
  });

  it("places an order with frozen snapshots, a human number and a tracking token; replays idempotently", async () => {
    const r = await checkout();
    expect(r.order.number).toMatch(/^[A-Z0-9]{3}-\d{4}$/);
    expect(r.order).toMatchObject({ status: "pending_payment", totalMinor: 95000n, contactPhone: "+254712345678" });
    const items = await owner.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, r.order.id));
    expect(items[0]).toMatchObject({ productName: "Margherita", unitPriceMinor: 95000n, quantity: 1 });
    const again = await run(async (tx) => commerce.placeOrder(tx, r.cart, { quoteId: r.quote.id, idempotencyKey: r.order.idempotencyKey, contact: { name: "X Y", phone: "0712345678" } }));
    expect(again.replayed).toBe(true);
    expect(again.order.id).toBe(r.order.id);
    const view = await run(async (tx) => commerce.trackingView(tx, await commerce.orderByTracking(tx, r.order.number, r.trackingToken!)));
    expect(view).toMatchObject({ number: r.order.number, status: "pending_payment", firstName: "Wanjiku" });
    expect(await code(run((tx) => commerce.orderByTracking(tx, r.order.number, "wrong-token")))).toBe("NOT_FOUND");
  });

  it("refuses an order if the price changed since the quote (no silent repricing)", async () => {
    const { cart, token } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
    await run((tx) => commerce.addCartItem(tx, cart, { productId: menuIds.marg, variantId: menuIds.margClassic, quantity: 1 }));
    const { quote } = await run((tx) => commerce.createQuote(tx, cart, { fulfilment: "collection" }));
    await as(manager, (tx, a) => setBranchVariantPrice(tx, a, { branchId: T.b1.id, variantId: menuIds.margClassic, priceMinor: 100000n }));
    expect(await code(run(async (tx) => commerce.placeOrder(tx, await commerce.cartByToken(tx, token), { quoteId: quote.id, idempotencyKey: "price-change-key-0001", contact: { name: "A B", phone: "0712345678" } })))).toBe("CONFLICT");
    await as(manager, (tx, a) => setBranchVariantPrice(tx, a, { branchId: T.b1.id, variantId: menuIds.margClassic, priceMinor: null }));
  });

  it("client-sent totals are ignored: the cart API has no price field", async () => {
    const { cart } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
    await run((tx) => commerce.addCartItem(tx, cart, { productId: menuIds.marg, variantId: menuIds.margClassic, quantity: 1, priceMinor: 1, totalMinor: 1 }));
    const v = await run((tx) => commerce.priceCart(tx, cart));
    expect(v.subtotalMinor).toBe(95000n);
  });
});

describe("M-Pesa payments", () => {
  it("STK push → callback → verified by query → order is new and paid", async () => {
    const { order } = await checkout();
    const res = await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    expect(res.status).toBe("initiated");
    expect(pushes[0]).toMatchObject({ phone: "254712345678", amountKes: 950 });
    expect(pushes[0]!.callbackUrl).toMatch(/^https:\/\/pay\.test\/api\/webhooks\/mpesa\/stk\/[A-Za-z0-9_-]{30,}$/);

    // Same order, within a minute: no second push.
    const again = await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    expect(again.reused).toBe(true);
    expect(pushes).toHaveLength(1);

    queryAnswers.set(pushes[0]!.checkoutRequestId, { state: "succeeded", resultCode: 0, resultDesc: "ok" });
    const body = stkBody(pushes[0]!.checkoutRequestId, 0, 950);
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(pushes[0]!.callbackUrl), payload: body })).toBe("applied");
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(pushes[0]!.callbackUrl), payload: body })).toBe("duplicate");

    const [o] = await owner.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o).toMatchObject({ status: "new", paymentStatus: "paid" });
    const [p] = await owner.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
    expect(p!.status).toBe("succeeded");
    expect(p!.mpesaReceipt).toMatch(/^RCP/);
    const cbs = await owner.select().from(schema.mpesaCallbacks).where(eq(schema.mpesaCallbacks.checkoutRequestId, pushes[0]!.checkoutRequestId));
    expect(cbs.map((c) => c.outcome).sort()).toEqual(["applied", "duplicate"]);
    const ev = await owner.select().from(schema.outboxEvents).where(and(eq(schema.outboxEvents.aggregateId, order.id), eq(schema.outboxEvents.topic, "order.paid")));
    expect(ev).toHaveLength(1);
    expect(await code(payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" }))).toBe("CONFLICT");
  });

  it("does not trust a success callback that Daraja won't confirm, or with the wrong amount, or an unknown token", async () => {
    const { order } = await checkout();
    await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    const push = pushes[0]!;
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(push.callbackUrl), payload: stkBody(push.checkoutRequestId, 0, 1) })).toBe("amount_mismatch");
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(push.callbackUrl), payload: stkBody(push.checkoutRequestId, 0, 950) })).toBe("unverified");
    expect(await payments.handleStkCallback(run, deps, { token: "forged-token", payload: stkBody(push.checkoutRequestId, 0, 950) })).toBe("unknown_token");
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(push.callbackUrl), payload: stkBody("ws_CO_OTHER", 0, 950) })).toBe("mismatch");
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(push.callbackUrl), payload: { hello: "world" } })).toBe("malformed");
    const [o] = await owner.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o!.status).toBe("pending_payment");
  });

  it("cancelled by the customer → can retry; reconciliation settles a lost callback", async () => {
    const { order } = await checkout();
    await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(pushes[0]!.callbackUrl), payload: stkBody(pushes[0]!.checkoutRequestId, 1032) })).toBe("failed");
    // Retry immediately is allowed once the attempt has a result... but the live window still applies to initiated attempts only.
    const retry = await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    expect(retry.reused).toBe(false);
    // No callback ever arrives; the worker asks Daraja.
    queryAnswers.set(pushes[1]!.checkoutRequestId, { state: "succeeded", resultCode: 0, resultDesc: "ok" });
    const results = await payments.reconcilePending(run, deps, { olderThanMs: 0 });
    expect(results.find((r) => r.outcome === "succeeded")).toBeTruthy();
    const [o] = await owner.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o).toMatchObject({ status: "new", paymentStatus: "paid" });
    // A late callback still fills in the receipt.
    queryAnswers.set(pushes[1]!.checkoutRequestId, { state: "succeeded", resultCode: 0, resultDesc: "ok" });
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(pushes[1]!.callbackUrl), payload: stkBody(pushes[1]!.checkoutRequestId, 0, 950) })).toBe("duplicate");
  });

  it("expires unpaid orders; money that arrives afterwards is flagged for refund, not lost", async () => {
    const { order } = await checkout();
    await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    await owner.update(schema.paymentAttempts).set({ requestedAt: new Date(Date.now() - 10 * 60_000) });
    await owner.update(schema.orders).set({ paymentDueAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, order.id));
    const cancelled = await payments.expireUnpaidOrders(run);
    expect(cancelled).toContain(order.id);
    queryAnswers.set(pushes[0]!.checkoutRequestId, { state: "succeeded", resultCode: 0, resultDesc: "ok" });
    expect(await payments.handleStkCallback(run, deps, { token: tokenOf(pushes[0]!.callbackUrl), payload: stkBody(pushes[0]!.checkoutRequestId, 0, 950) })).toBe("applied");
    const [o] = await owner.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o).toMatchObject({ status: "cancelled", paymentStatus: "paid" });
    const refunds = await owner.select().from(schema.refunds).where(eq(schema.refunds.orderId, order.id));
    expect(refunds[0]).toMatchObject({ status: "requested", reason: "Paid after the order was cancelled" });
  });

  it("caps attempts per order", async () => {
    const { order } = await checkout();
    for (let i = 0; i < payments.MAX_ATTEMPTS_PER_ORDER; i++) {
      await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
      await owner.update(schema.paymentAttempts).set({ status: "cancelled" }).where(eq(schema.paymentAttempts.checkoutRequestId, pushes.at(-1)!.checkoutRequestId));
    }
    expect(await code(payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" }))).toBe("RATE_LIMITED");
  });
});

describe("refunds (maker-checker)", () => {
  async function paidOrder() {
    const { order } = await checkout();
    await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0712345678" });
    queryAnswers.set(pushes.at(-1)!.checkoutRequestId, { state: "succeeded", resultCode: 0, resultDesc: "ok" });
    await payments.handleStkCallback(run, deps, { token: tokenOf(pushes.at(-1)!.callbackUrl), payload: stkBody(pushes.at(-1)!.checkoutRequestId, 0, 950) });
    return order;
  }

  it("manager requests, the same person cannot approve, franchise admin approves a reversal; result callback settles it", async () => {
    const order = await paidOrder();
    const r = await as(manager, (tx, a) => payments.requestRefund(tx, a, { orderId: order.id, reason: "Burnt pizza" }));
    expect(await code(withActor(app, manager, async (tx) => payments.approveRefund(run, deps, await loadActor(tx, manager), { refundId: r.id })))).toBe("FORBIDDEN");
    const res = await withActor(app, franchiseAdmin, async (tx) => payments.approveRefund(run, deps, await loadActor(tx, franchiseAdmin), { refundId: r.id }));
    expect(res.status).toBe("processing");
    expect(reversals[0]!.transactionId).toMatch(/^RCP/);
    const outcome = await payments.handleReversalResult(run, { token: tokenOf(reversals[0]!.resultUrl), payload: { Result: { ResultCode: 0, ResultDesc: "ok", OriginatorConversationID: "OC_1" } } });
    expect(outcome).toBe("applied");
    expect(await payments.handleReversalResult(run, { token: tokenOf(reversals[0]!.resultUrl), payload: { Result: { ResultCode: 0, ResultDesc: "ok" } } })).toBe("duplicate");
    const [o] = await owner.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o!.paymentStatus).toBe("refunded");
  });

  it("part refunds must be manual and can't exceed what's left", async () => {
    const order = await paidOrder();
    expect(await code(as(manager, (tx, a) => payments.requestRefund(tx, a, { orderId: order.id, amountMinor: 10000n, reason: "Missing dip" })))).toBe("VALIDATION_FAILED");
    const r = await as(manager, (tx, a) => payments.requestRefund(tx, a, { orderId: order.id, amountMinor: 10000n, reason: "Missing dip", method: "manual" }));
    expect(await code(as(manager, (tx, a) => payments.requestRefund(tx, a, { orderId: order.id, amountMinor: 90000n, reason: "Too much", method: "manual" })))).toBe("VALIDATION_FAILED");
    await withActor(app, franchiseAdmin, async (tx) => payments.approveRefund(run, deps, await loadActor(tx, franchiseAdmin), { refundId: r.id, manualReference: "CASH-001" }));
    const [o] = await owner.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(o!.paymentStatus).toBe("partially_refunded");
  });
});

describe("commerce RLS", () => {
  it("staff see their branch's orders only; customers see their own; the public sees nothing", async () => {
    const mine = await checkout({ userId: customerUser });
    const visibleTo = async (u: string | null) => (await withActor(app, u, (tx) => tx.select({ id: schema.orders.id }).from(schema.orders))).map((r) => r.id);
    expect(await visibleTo(manager)).toContain(mine.order.id);
    expect(await visibleTo(otherKitchen)).not.toContain(mine.order.id);
    expect(await visibleTo(customerUser)).toEqual([mine.order.id]);
    expect(await visibleTo(null)).toEqual([]);
    const stranger = await makeUser(owner, "c-str");
    expect(await visibleTo(stranger)).toEqual([]);
  });

  it("the app role cannot touch carts, callbacks or payment state", async () => {
    const { order } = await checkout();
    await expectDbError(withActor(app, manager, (tx) => tx.select().from(schema.carts)), /permission denied/);
    await expectDbError(withActor(app, manager, (tx) => tx.select().from(schema.mpesaCallbacks)), /permission denied/);
    await expectDbError(withActor(app, manager, (tx) => tx.update(schema.orders).set({ paymentStatus: "paid" }).where(eq(schema.orders.id, order.id))), /payments module/);
    await expectDbError(withActor(app, manager, (tx) => tx.update(schema.orders).set({ totalMinor: 1n, subtotalMinor: 1n }).where(eq(schema.orders.id, order.id))), /immutable/);
    await expectDbError(owner.update(schema.orderItems).set({ quantity: 9 }).where(eq(schema.orderItems.orderId, order.id)), /immutable/);
  });
});

export type { Executor };
