import { eq } from "drizzle-orm";
import { z } from "zod";
import { notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { recordAudit } from "../audit";
import { addCartItem, cartByReference, createCart, createQuote, placeOrder, priceCart, type Cart, type CartView } from "../commerce/checkout";

/*
 * WhatsApp-assisted and phone orders (README §7). Staff work on the SAME cart
 * objects through the SAME engine as the website: no separate pricing,
 * inventory or order processing. The customer either hands over a cart
 * reference from the storefront (click-to-chat) or staff start a new cart.
 */

async function branchScope(tx: Executor, branchId: string): Promise<ResourceScope> {
  const [b] = await tx.select().from(schema.branches).where(eq(schema.branches.id, branchId));
  if (!b) throw notFound("Branch");
  return { level: "branch", brandId: b.brandId, franchiseeId: b.franchiseeId, branchId: b.id };
}

export async function openAssistedCart(tx: Executor, actor: Actor, input: { branchId: string; reference?: string | null }): Promise<Cart> {
  const scope = await branchScope(tx, input.branchId);
  authorize(actor, "order.manage", scope);
  if (input.reference) {
    const cart = await cartByReference(tx, scope.level === "branch" ? scope.brandId : "", input.reference);
    if (cart.branchId !== input.branchId) throw notFound("Cart"); // never open another branch's cart
    if (cart.checkedOutAt) throw notFound("Cart");
    return cart;
  }
  const { cart } = await createCart(tx, { branchId: input.branchId, channel: "staff", createdByUserId: actor.kind === "user" ? actor.userId : null });
  return cart;
}

const guard = async (tx: Executor, actor: Actor, cartId: string) => {
  const [cart] = await tx.select().from(schema.carts).where(eq(schema.carts.id, cartId));
  if (!cart || cart.checkedOutAt) throw notFound("Cart");
  authorize(actor, "order.manage", await branchScope(tx, cart.branchId));
  return cart;
};

export async function assistedAdd(tx: Executor, actor: Actor, cartId: string, line: unknown) {
  const cart = await guard(tx, actor, cartId);
  await addCartItem(tx, cart, line);
  return priceCart(tx, cart);
}

export async function assistedView(tx: Executor, actor: Actor, cartId: string): Promise<CartView> {
  return priceCart(tx, await guard(tx, actor, cartId));
}

export const assistedOrderInput = z.object({
  cartId: z.uuid(),
  fulfilment: z.enum(["delivery", "collection"]),
  lat: z.coerce.number().nullish(),
  lng: z.coerce.number().nullish(),
  contact: z.object({ name: z.string(), phone: z.string() }),
  address: z.object({ line1: z.string(), area: z.string().nullish(), city: z.string() }).nullish(),
  notes: z.string().nullish(),
});

/** Quote and place in one step for staff; the customer then pays by STK push to their own phone. */
export async function placeAssistedOrder(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(assistedOrderInput, raw);
  const cart = await guard(tx, actor, input.cartId);
  const { quote } = await createQuote(tx, cart, { fulfilment: input.fulfilment, lat: input.lat, lng: input.lng });
  const r = await placeOrder(tx, cart, {
    quoteId: quote.id, idempotencyKey: `assisted-${quote.id}`, contact: input.contact, address: input.address ?? null, notes: input.notes ?? null,
    channel: cart.channel === "web" ? "whatsapp" : "staff", createdByUserId: actor.kind === "user" ? actor.userId : null,
  });
  await recordAudit(tx, actor, { action: "order.assisted", scope: await branchScope(tx, cart.branchId), targetType: "order", targetId: r.order.id, metadata: { reference: cart.reference } });
  return r;
}

/** Prefilled WhatsApp text the customer sends from the storefront. */
export function handoffText(brand: string, view: CartView): string {
  const lines = view.lines.map((l) => `• ${l.quantity}× ${l.productName} (${l.variantName})${l.options.filter((o) => !o.included).length ? ` + ${l.options.filter((o) => !o.included).map((o) => o.name).join(", ")}` : ""}`);
  return [`Hi ${brand}! I'd like to order. Ref ${view.reference}`, ...lines].join("\n");
}
