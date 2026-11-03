import "server-only";
import { cookies } from "next/headers";
import { commerce } from "@retero/core";
import { notFound } from "@retero/shared/errors";
import type { Executor } from "@retero/db";

/** One cart per branch per browser, held as an httpOnly bearer cookie. */
const name = (branchId: string) => `rt_cart_${branchId.replace(/-/g, "").slice(0, 16)}`;

export async function readCartToken(branchId: string) {
  return (await cookies()).get(name(branchId))?.value ?? null;
}

export async function writeCartToken(branchId: string, token: string) {
  (await cookies()).set(name(branchId), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3 * 24 * 3600 });
}

export async function clearCartToken(branchId: string) {
  (await cookies()).delete(name(branchId));
}

/** Current cart for the branch, creating one if needed (create=true). */
export async function currentCart(tx: Executor, branchId: string, create = false) {
  const token = await readCartToken(branchId);
  if (token) {
    try { return { cart: await commerce.cartByToken(tx, token), token }; } catch { /* expired or checked out → new cart */ }
  }
  if (!create) throw notFound("Cart");
  const { cart, token: fresh } = await commerce.createCart(tx, { branchId });
  await writeCartToken(branchId, fresh);
  return { cart, token: fresh };
}
