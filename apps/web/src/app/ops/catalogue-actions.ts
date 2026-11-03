"use server";

import { eq, schema } from "@retero/db";
import { catalogue, rbac } from "@retero/core";
import { AppError } from "@retero/shared/errors";
import { Money } from "@retero/shared";
import { act, formObject, type ActionState } from "@/server/action";
import { presignImageUpload, verifyImage } from "@/server/storage";

/** "950" or "950.00" KES → minor units. Empty → undefined. */
function kes(v: unknown): bigint | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  try { return Money.parseDecimal(String(v), "KES").amount; } catch { throw new AppError("VALIDATION_FAILED", `"${String(v)}" isn't a valid amount.`); }
}

const menuPath = (brandId: unknown) => `/ops/b/${String(brandId)}/menu`;

export async function upsertProductAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    const p = await catalogue.upsertProduct(tx, actor, { ...o, builderEnabled: o.builderEnabled === true, status: o.status ?? "draft" });
    return { message: `${p.name} saved.` };
  }, { revalidate: [menuPath(o.brandId), `${menuPath(o.brandId)}/${String(o.productId ?? "")}`] });
}

export async function setProductStatusAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.setProductStatus(tx, actor, o);
    return { message: "Status updated." };
  }, { revalidate: [menuPath(o.brandId), `${menuPath(o.brandId)}/${String(o.productId)}`] });
}

export async function upsertVariantAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.upsertVariant(tx, actor, {
      productId: o.productId, code: o.code, name: o.name, sizeCode: o.sizeCode ?? null,
      priceMinor: kes(o.price), minPriceMinor: kes(o.minPrice) ?? null, maxPriceMinor: kes(o.maxPrice) ?? null,
      isDefault: o.isDefault === true, sort: o.sort ?? 0,
    });
    return { message: "Size saved." };
  }, { revalidate: `${menuPath(o.brandId)}/${String(o.productId)}` });
}

export async function compositionAction(_: ActionState, fd: FormData) {
  const productId = String(fd.get("productId"));
  const brandId = String(fd.get("brandId"));
  return act(async ({ tx, actor }) => {
    await catalogue.setProductComposition(tx, actor, {
      productId,
      groups: fd.getAll("groups").map((g, i) => ({ groupId: String(g), sort: i })),
      defaultOptionIds: fd.getAll("defaults").map(String),
    });
    return { message: "Options saved." };
  }, { revalidate: `${menuPath(brandId)}/${productId}` });
}

export async function upsertIngredientAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.upsertIngredient(tx, actor, {
      brandId: o.brandId, code: o.code, name: o.name, unit: o.unit,
      isVegetarian: o.isVegetarian === true, isVegan: o.isVegan === true, allergens: fd.getAll("allergens").map(String),
    });
    return { message: "Ingredient saved." };
  }, { revalidate: menuPath(o.brandId) });
}

export async function upsertOptionGroupAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.upsertOptionGroup(tx, actor, o);
    return { message: "Option group saved." };
  }, { revalidate: menuPath(o.brandId) });
}

export async function upsertOptionAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.upsertOption(tx, actor, {
      brandId: o.brandId, groupId: o.groupId, code: o.code, name: o.name, priceMinor: kes(o.price) ?? 0n,
      ingredientId: o.ingredientId ?? null, visualKey: o.visualKey ?? null, color: o.color ?? null,
    });
    return { message: "Option saved." };
  }, { revalidate: menuPath(o.brandId) });
}

/* ── Product photography (presigned direct upload) ─────────────── */

export async function presignProductImage(productId: string, contentType: string) {
  let result: { url: string; fields: Record<string, string>; key: string } | null = null;
  const state = await act(async ({ tx, actor }) => {
    const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, productId));
    if (!p) throw new AppError("NOT_FOUND", "Product not found.");
    // Authorize up front; the server-chosen key prefix binds the upload to this product.
    rbac.authorize(actor, "catalogue.manage", { level: "brand", brandId: p.brandId });
    result = await presignImageUpload(`brands/${p.brandId}/products/${p.id}`, contentType);
  });
  return state?.ok ? { ok: true as const, ...result! } : { ok: false as const, message: state && !state.ok ? state.message : "Failed" };
}

export async function confirmProductImage(productId: string, key: string) {
  return act(async ({ tx, actor }) => {
    const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, productId));
    if (!p) throw new AppError("NOT_FOUND", "Product not found.");
    await verifyImage(key, `brands/${p.brandId}/products/${p.id}`);
    await catalogue.setProductImage(tx, actor, p.id, key);
    return { message: "Photo saved." };
  }, { revalidate: "/ops" });
}

/* ── Branch menu ───────────────────────────────────────────────── */

export async function branchAvailabilityAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.setBranchProductAvailability(tx, actor, { branchId: o.branchId, productId: o.productId, isAvailable: o.isAvailable === true });
    return { message: o.isAvailable === true ? "Back on the menu." : "Marked unavailable." };
  }, { revalidate: `/ops/br/${String(o.branchId)}/menu` });
}

export async function branchPriceAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.setBranchVariantPrice(tx, actor, { branchId: o.branchId, variantId: o.variantId, priceMinor: kes(o.price) ?? null });
    return { message: o.price ? "Branch price set." : "Using brand price." };
  }, { revalidate: `/ops/br/${String(o.branchId)}/menu` });
}

export async function branchOptionAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await catalogue.setBranchOptionOverride(tx, actor, { branchId: o.branchId, optionId: o.optionId, isAvailable: o.isAvailable === true });
    return { message: o.isAvailable === true ? "Available." : "Sold out." };
  }, { revalidate: `/ops/br/${String(o.branchId)}/menu` });
}
