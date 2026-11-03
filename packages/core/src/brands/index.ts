import { eq } from "drizzle-orm";
import { z } from "zod";
import { notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor } from "../rbac/types";
import { recordAudit } from "../audit";

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB colour.");
const E164 = z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Use international format, e.g. +254712345678.");
const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes.").min(2).max(48);

export const createBrandInput = z.object({ slug: SLUG, name: z.string().trim().min(2).max(80) });

export async function createBrand(tx: Executor, actor: Actor, raw: unknown) {
  authorize(actor, "brand.create", { level: "platform" });
  const input = parseInput(createBrandInput, raw);
  const [brand] = await tx.insert(schema.brands).values({ ...input, status: "pending" }).returning();
  await tx.insert(schema.brandSettings).values({ brandId: brand!.id });
  await recordAudit(tx, actor, { action: "brand.create", scope: { level: "brand", brandId: brand!.id }, targetType: "brand", targetId: brand!.id, metadata: input });
  return brand!;
}

export const updateBrandInput = z.object({
  brandId: z.uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  status: z.enum(["pending", "active", "suspended", "closed"]).optional(),
});

export async function updateBrand(tx: Executor, actor: Actor, raw: unknown) {
  const { brandId, ...patch } = parseInput(updateBrandInput, raw);
  const scope = { level: "brand", brandId } as const;
  authorize(actor, "brand.update", scope);
  // Status changes to a brand are platform decisions.
  if (patch.status) authorize(actor, "platform.manage", { level: "platform" });
  const [b] = await tx.update(schema.brands).set(patch).where(eq(schema.brands.id, brandId)).returning();
  if (!b) throw notFound("Brand");
  await recordAudit(tx, actor, { action: "brand.update", scope, targetType: "brand", targetId: brandId, metadata: patch });
  return b;
}

export const brandSettingsInput = z.object({
  brandId: z.uuid(),
  whatsappNumber: E164.nullable().optional(),
  supportEmail: z.email().nullable().optional(),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone.").optional(),
  theme: z.object({
    colors: z.object({ sauce: HEX, crust: HEX, oven: HEX, basil: HEX, dough: HEX, espresso: HEX }).partial().optional(),
    logoAssetKey: z.string().max(300).optional(),
  }).optional(),
});

export async function updateBrandSettings(tx: Executor, actor: Actor, raw: unknown) {
  const { brandId, ...patch } = parseInput(brandSettingsInput, raw);
  const scope = { level: "brand", brandId } as const;
  authorize(actor, "brand.settings.update", scope);
  const [s] = await tx
    .insert(schema.brandSettings)
    .values({ brandId, ...patch, theme: patch.theme ?? {} })
    .onConflictDoUpdate({ target: schema.brandSettings.brandId, set: patch })
    .returning();
  await recordAudit(tx, actor, { action: "brand.settings.update", scope, targetType: "brand_settings", targetId: brandId, metadata: patch });
  return s!;
}
