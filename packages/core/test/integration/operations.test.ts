import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, withActor, withSystem, type Tx } from "@retero/db";
import { AppError } from "@retero/shared/errors";
import { loadActor } from "../../src/identity";
import { getBranchMenu, importCatalogue, readTemplate } from "../../src/catalogue";
import * as commerce from "../../src/commerce";
import * as payments from "../../src/payments";
import * as kitchen from "../../src/kitchen";
import * as inventory from "../../src/inventory";
import * as delivery from "../../src/delivery";
import * as assisted from "../../src/assisted";
import * as reports from "../../src/reports";
import { grant, makeBrandTree, makeUser, openAllWeek, openDbs } from "../../../../test/fixtures";

const dbs = openDbs();
const { owner, app, system } = dbs;
afterAll(() => dbs.close());

const run: payments.RunTx = (fn) => withSystem(system, "test", fn);
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof AppError ? e.code : String(e); } };
const actorOf = (u: string) => withActor(app, u, (tx) => loadActor(tx, u));
/** Staff action: authorize the verified actor, execute on the system pool (D-025). */
const sys = async <T>(u: string, fn: (tx: Tx, a: Awaited<ReturnType<typeof loadActor>>) => Promise<T>) => { const a = await actorOf(u); return run((tx) => fn(tx as Tx, a)); };

let T: Awaited<ReturnType<typeof makeBrandTree>>;
let ids: { marg: string; classic: string; mozzarellaIng: string; doughIng: string; extraMozz: string };
let kitchenA1: string, kitchenA3: string, manager: string, riderA: string, riderB: string;

const fakeGateway: payments.MpesaGateway = {
  kind: "daraja",
  async stkPush() { return { merchantRequestId: "m", checkoutRequestId: `ws_${Math.random()}`, customerMessage: "ok", raw: {} }; },
  async stkQuery() { return { state: "succeeded", resultCode: 0, resultDesc: "ok" }; },
  async reversal() { return { conversationId: "c", originatorConversationId: "o", raw: {} }; },
};
const deps: payments.PaymentDeps = { env: {}, allowSimulator: false, callbackBaseUrl: "https://t", gateway: () => fakeGateway };

beforeAll(async () => {
  T = await makeBrandTree(owner);
  await owner.insert(schema.brandSettings).values({ brandId: T.brand.id });
  await openAllWeek(owner, T.brand.id, T.b1.id);
  await owner.insert(schema.mpesaAccounts).values({ brandId: T.brand.id, environment: "sandbox", shortcode: "174379", credentialsRef: "MPESA_TEST" });
  await owner.transaction(async (tx) => importCatalogue(tx, { kind: "system", reason: "t" }, T.brand.id, await readTemplate(new URL("../../templates/starter-menu.json", import.meta.url).pathname), { publish: true }));
  const menu = await run((tx) => getBranchMenu(tx, T.b1.id));
  const marg = menu.products.find((p) => p.slug === "margherita")!;
  const ing = await owner.select().from(schema.ingredients).where(eq(schema.ingredients.brandId, T.brand.id));
  ids = {
    marg: marg.id, classic: marg.variants.find((v) => v.code === "classic")!.id,
    mozzarellaIng: ing.find((i) => i.code === "mozzarella")!.id, doughIng: ing.find((i) => i.code === "dough")!.id,
    extraMozz: Object.values(menu.options).find((o) => o.code === "extra-mozzarella")!.id,
  };
  // Portion data so options consume stock: extra mozzarella uses 60g on a classic.
  await owner.insert(schema.optionSizes).values({ brandId: T.brand.id, optionId: ids.extraMozz, sizeCode: "classic", portionQty: "60" });
  const u = await Promise.all(["k1", "k3", "mgr", "ra", "rb"].map((l) => makeUser(owner, `ops-${l}`)));
  [kitchenA1, kitchenA3, manager, riderA, riderB] = [u[0]!, u[1]!, u[2]!, u[3]!, u[4]!];
  await grant(owner, kitchenA1, "kitchen_staff", { brandId: T.brand.id, branchId: T.b1.id });
  await grant(owner, kitchenA3, "kitchen_staff", { brandId: T.brand.id, branchId: T.b3.id });
  await grant(owner, manager, "branch_manager", { brandId: T.brand.id, branchId: T.b1.id });
  await grant(owner, riderA, "delivery_staff", { brandId: T.brand.id, branchId: T.b1.id });
  await grant(owner, riderB, "delivery_staff", { brandId: T.brand.id, branchId: T.b1.id });
  await owner.update(schema.branches).set({ latitude: "-1.267600", longitude: "36.810800" }).where(eq(schema.branches.id, T.b1.id));
  await owner.insert(schema.deliveryZones).values({ brandId: T.brand.id, branchId: T.b1.id, name: "Inner", radiusM: 5000, feeMinor: 10000n, etaMinutes: 30 });
});

async function paidOrder(opts: { fulfilment?: "collection" | "delivery"; optionIds?: string[] | null; qty?: number } = {}) {
  const { cart } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
  await run((tx) => commerce.addCartItem(tx, cart, { productId: ids.marg, variantId: ids.classic, optionIds: opts.optionIds ?? null, quantity: opts.qty ?? 1 }));
  const f = opts.fulfilment ?? "collection";
  const { quote } = await run((tx) => commerce.createQuote(tx, cart, f === "delivery" ? { fulfilment: f, lat: -1.27, lng: 36.812 } : { fulfilment: f }));
  const { order } = await run((tx) => commerce.placeOrder(tx, cart, { quoteId: quote.id, idempotencyKey: `ops-${Math.random()}-xxxxxxxx`, contact: { name: "Njeri W", phone: "0722000111" }, address: f === "delivery" ? { line1: "Ring Rd", city: "Nairobi" } : null }));
  await payments.initiatePayment(run, deps, { orderId: order.id, phone: "0722000111" });
  const [att] = await owner.select().from(schema.paymentAttempts).innerJoin(schema.payments, eq(schema.payments.id, schema.paymentAttempts.paymentId)).where(eq(schema.payments.orderId, order.id));
  await run((tx) => payments.applySuccess(tx, att!.payment_attempts.id, { receipt: `R${Math.random().toString(36).slice(2, 9).toUpperCase()}` }));
  return order;
}
const orderRow = async (id: string) => (await owner.select().from(schema.orders).where(eq(schema.orders.id, id)))[0]!;
const ticketRow = async (orderId: string) => (await owner.select().from(schema.kitchenTickets).where(eq(schema.kitchenTickets.orderId, orderId)))[0]!;
const stock = async (ingredientId: string) => (await owner.select().from(schema.inventoryItems).where(and(eq(schema.inventoryItems.branchId, T.b1.id), eq(schema.inventoryItems.ingredientId, ingredientId))))[0]!;

describe("kitchen workflow", () => {
  it("payment creates a ticket; the line moves it NEW → ACCEPTED → PREPARING → BAKING → READY; collection completes it", async () => {
    const order = await paidOrder();
    expect((await ticketRow(order.id)).status).toBe("NEW");
    const board = await withActor(app, kitchenA1, (tx) => kitchen.board(tx, T.b1.id));
    const t = board.tickets.find((x) => x.orderId === order.id)!;
    expect(t.items[0]).toMatchObject({ name: "Margherita · Classic 12\"", quantity: 1 });
    expect(t.items[0]!.allergens).toContain("gluten");

    for (const to of ["accepted", "preparing", "baking", "ready"] as const) await sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to }));
    const tk = await ticketRow(order.id);
    expect(tk).toMatchObject({ status: "READY" });
    expect(tk.acceptedAt && tk.preparingAt && tk.bakingAt && tk.readyAt).toBeTruthy();

    // Kitchen staff can't hand over at the counter (order.manage); the manager can.
    expect(await code(sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "collected" })))).toBe("FORBIDDEN");
    await sys(manager, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "collected" }));
    expect((await ticketRow(order.id)).status).toBe("COMPLETED");
    const hist = await owner.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, order.id));
    expect(hist.map((h) => h.toStatus)).toEqual(["pending_payment", "new", "accepted", "preparing", "baking", "ready", "collected"]);
  });

  it("rejects invalid transitions and other branches' staff", async () => {
    const order = await paidOrder();
    expect(await code(sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "baking" })))).toBe("CONFLICT");
    expect(await code(sys(kitchenA3, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "accepted" })))).toBe("FORBIDDEN");
    const board = await withActor(app, kitchenA3, (tx) => kitchen.board(tx, T.b1.id));
    expect(board.tickets).toEqual([]); // RLS: another branch's board is empty
  });

  it("cancelling a paid order releases stock and raises a refund request", async () => {
    await sys(manager, (tx, a) => inventory.trackIngredient(tx, a, { branchId: T.b1.id, ingredientId: ids.doughIng, openingStock: 10_000 }));
    const order = await paidOrder();
    expect(Number((await stock(ids.doughIng)).reserved)).toBe(280);
    await sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "accepted" }));
    expect(await code(sys(manager, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "cancelled" })))).toBe("VALIDATION_FAILED"); // reason required
    await sys(manager, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "cancelled", reason: "Oven fault" }));
    expect(Number((await stock(ids.doughIng)).reserved)).toBe(0);
    const [r] = await owner.select().from(schema.refunds).where(eq(schema.refunds.orderId, order.id));
    expect(r).toMatchObject({ status: "requested", method: "mpesa_reversal", amountMinor: 95000n });
    expect((await ticketRow(order.id)).status).toBe("CANCELLED");
  });
});

describe("inventory", () => {
  it("consumes reserved stock when preparing starts, from recipes and option portions", async () => {
    await sys(manager, (tx, a) => inventory.trackIngredient(tx, a, { branchId: T.b1.id, ingredientId: ids.mozzarellaIng, openingStock: 1000, reorderLevel: 100 }));
    const before = await stock(ids.doughIng);
    const order = await paidOrder({ optionIds: [ids.extraMozz] });
    expect(Number((await stock(ids.mozzarellaIng)).reserved)).toBe(60);
    await sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "accepted" }));
    await sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "preparing" }));
    const m = await stock(ids.mozzarellaIng);
    expect([Number(m.onHand), Number(m.reserved)]).toEqual([940, 0]);
    expect(Number((await stock(ids.doughIng)).onHand)).toBe(Number(before.onHand) - 280);
    const moves = await owner.select().from(schema.stockMovements).where(eq(schema.stockMovements.orderId, order.id));
    expect(moves.map((x) => x.kind).sort()).toEqual(["consumption", "consumption", "reservation", "reservation"]);
  });

  it("never oversells under concurrency: two orders race for the last portion", async () => {
    // Leave exactly one portion of extra mozzarella available.
    const m = await stock(ids.mozzarellaIng);
    await sys(manager, (tx, a) => inventory.recordMovement(tx, a, { itemId: m.id, kind: "count", quantity: Number(m.reserved) + 60, reason: "Count" }));
    const carts = await Promise.all([0, 1].map(async () => {
      const { cart } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
      await run((tx) => commerce.addCartItem(tx, cart, { productId: ids.marg, variantId: ids.classic, optionIds: [ids.extraMozz], quantity: 1 }));
      const { quote } = await run((tx) => commerce.createQuote(tx, cart, { fulfilment: "collection" }));
      return { cart, quote };
    }));
    const results = await Promise.all(carts.map(({ cart, quote }) => code(run((tx) => commerce.placeOrder(tx, cart, { quoteId: quote.id, idempotencyKey: `race-${quote.id}`, contact: { name: "R R", phone: "0711000000" } })))));
    expect(results.sort()).toEqual(["CONFLICT", "OK"]);
    const after = await stock(ids.mozzarellaIng);
    expect(Number(after.onHand) - Number(after.reserved)).toBe(0);
    // Sold out now shows on the public menu.
    const menu = await withActor(app, null, (tx) => getBranchMenu(tx, T.b1.id));
    expect(Object.values(menu.options).find((o) => o.id === ids.extraMozz)!.available).toBe(false);
    // Restock so later tests can sell Margherita again.
    await sys(manager, (tx, a) => inventory.recordMovement(tx, a, { itemId: after.id, kind: "receipt", quantity: 5000 }));
  });

  it("waste needs a reason; counts can't drop below reserved; kitchen staff can't adjust stock", async () => {
    const d = await stock(ids.doughIng);
    expect(await code(sys(manager, (tx, a) => inventory.recordMovement(tx, a, { itemId: d.id, kind: "waste", quantity: 10 })))).toBe("VALIDATION_FAILED");
    await sys(manager, (tx, a) => inventory.recordMovement(tx, a, { itemId: d.id, kind: "waste", quantity: 10, reason: "Dropped" }));
    await sys(manager, (tx, a) => inventory.recordMovement(tx, a, { itemId: d.id, kind: "receipt", quantity: 500 }));
    expect(await code(sys(kitchenA1, (tx, a) => inventory.recordMovement(tx, a, { itemId: d.id, kind: "receipt", quantity: 1 })))).toBe("FORBIDDEN");
    const m = await stock(ids.mozzarellaIng);
    expect(await code(sys(manager, (tx, a) => inventory.recordMovement(tx, a, { itemId: m.id, kind: "count", quantity: 0 })))).toBe("VALIDATION_FAILED");
    await expect(owner.update(schema.stockMovements).set({ quantity: "1" })).rejects.toThrow();
  });
});

describe("delivery", () => {
  it("assign → pick up (order out for delivery, ticket completed) → delivered; only the assigned rider acts", async () => {
    const order = await paidOrder({ fulfilment: "delivery" });
    for (const to of ["accepted", "preparing", "baking", "ready"] as const) await sys(kitchenA1, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to }));
    expect(await code(sys(manager, (tx, a) => kitchen.transitionOrder(tx, a, { orderId: order.id, to: "out_for_delivery" })))).toBe("CONFLICT"); // no rider assigned yet
    expect(await code(sys(manager, (tx, a) => delivery.assignRider(tx, a, { orderId: order.id, riderUserId: kitchenA1 })))).toBe("VALIDATION_FAILED"); // not a rider
    const asg = await sys(manager, (tx, a) => delivery.assignRider(tx, a, { orderId: order.id, riderUserId: riderA }));
    expect(await code(sys(riderB, (tx, a) => delivery.riderAction(tx, a, { assignmentId: asg.id, action: "pick_up" })))).toBe("FORBIDDEN");
    await sys(riderA, (tx, a) => delivery.riderAction(tx, a, { assignmentId: asg.id, action: "pick_up", lat: -1.27, lng: 36.81 }));
    expect((await orderRow(order.id)).status).toBe("out_for_delivery");
    expect((await ticketRow(order.id)).status).toBe("COMPLETED");
    await sys(riderA, (tx, a) => delivery.riderAction(tx, a, { assignmentId: asg.id, action: "deliver" }));
    expect((await orderRow(order.id)).status).toBe("delivered");
    const mine = await withActor(app, riderA, (tx) => delivery.myDeliveries(tx, riderA));
    expect(mine.find((x) => x.o.id === order.id)).toBeUndefined();
  });
});

describe("WhatsApp-assisted ordering (same engine)", () => {
  it("staff open the customer's cart by reference and place the order at the same price", async () => {
    const { cart } = await run((tx) => commerce.createCart(tx, { branchId: T.b1.id }));
    await run((tx) => commerce.addCartItem(tx, cart, { productId: ids.marg, variantId: ids.classic, quantity: 2 }));
    const web = await run((tx) => commerce.priceCart(tx, cart));
    expect(assisted.handoffText("Retero", web)).toContain(`Ref ${cart.reference}`);

    expect(await code(sys(kitchenA3, (tx, a) => assisted.openAssistedCart(tx, a, { branchId: T.b1.id, reference: cart.reference })))).toBe("FORBIDDEN");
    const opened = await sys(manager, (tx, a) => assisted.openAssistedCart(tx, a, { branchId: T.b1.id, reference: cart.reference.toLowerCase() }));
    expect(opened.id).toBe(cart.id);
    const r = await sys(manager, (tx, a) => assisted.placeAssistedOrder(tx, a, { cartId: cart.id, fulfilment: "collection", contact: { name: "Phone Customer", phone: "0733000222" } }));
    expect(r.order).toMatchObject({ channel: "whatsapp", totalMinor: web.subtotalMinor, createdByUserId: manager });
  });

  it("a phone order without a reference starts a staff cart", async () => {
    const c = await sys(manager, (tx, a) => assisted.openAssistedCart(tx, a, { branchId: T.b1.id }));
    expect(c.channel).toBe("staff");
    const v = await sys(manager, (tx, a) => assisted.assistedAdd(tx, a, c.id, { productId: ids.marg, variantId: ids.classic, quantity: 1 }));
    expect(v.subtotalMinor).toBe(95000n);
  });
});

describe("reports", () => {
  it("branch sales: paid revenue, VAT, channels, top products", async () => {
    const r = await withActor(app, manager, async (tx) => reports.branchSales(tx, await loadActor(tx, manager), { level: "branch", brandId: T.brand.id, franchiseeId: T.f1.id, branchId: T.b1.id }, { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) }));
    expect(r.orders).toBeGreaterThan(3);
    expect(r.grossMinor).toBeGreaterThan(0n);
    expect(r.top[0]!.name).toBe("Margherita");
    expect(r.byChannel.map((c) => c.channel)).toEqual(["web"]); // unpaid assisted orders are not revenue
    expect(await code(withActor(app, kitchenA1, async (tx) => reports.branchSales(tx, await loadActor(tx, kitchenA1), { level: "branch", brandId: T.brand.id, franchiseeId: T.f1.id, branchId: T.b1.id }, { from: new Date(0), to: new Date() })))).toBe("FORBIDDEN");
  });
});

