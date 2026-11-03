import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor } from "../rbac/types";
import { recordAudit } from "../audit";
import { loadScope } from "../tenancy/scope";
import { validateWeek } from "../hours";
import { AppError } from "@retero/shared/errors";

const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes.").min(2).max(48);
const STATUS = z.enum(["pending", "active", "suspended", "closed"]);
const E164 = z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Use international format, e.g. +254712345678.");
const KRA_PIN = z.string().regex(/^[AP]\d{9}[A-Z]$/, "KRA PIN looks like A123456789B.");

/* ── Franchisees ────────────────────────────────────────────────── */

export const createFranchiseeInput = z.object({
  brandId: z.uuid(),
  legalName: z.string().trim().min(2).max(160),
  tradingName: z.string().trim().min(2).max(80),
  kraPin: KRA_PIN.nullish(),
});

export async function createFranchisee(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(createFranchiseeInput, raw);
  const brandScope = await loadScope(tx, { level: "brand", id: input.brandId });
  authorize(actor, "franchisee.create", brandScope);
  const [f] = await tx.insert(schema.franchisees).values({ ...input, kraPin: input.kraPin ?? null }).returning();
  await recordAudit(tx, actor, {
    action: "franchisee.create", scope: { level: "franchisee", brandId: input.brandId, franchiseeId: f!.id },
    targetType: "franchisee", targetId: f!.id, metadata: { tradingName: input.tradingName },
  });
  return f!;
}

export const updateFranchiseeInput = z.object({
  franchiseeId: z.uuid(),
  legalName: z.string().trim().min(2).max(160).optional(),
  tradingName: z.string().trim().min(2).max(80).optional(),
  kraPin: KRA_PIN.nullish(),
  status: STATUS.optional(),
});

export async function updateFranchisee(tx: Executor, actor: Actor, raw: unknown) {
  const { franchiseeId, ...patch } = parseInput(updateFranchiseeInput, raw);
  const scope = await loadScope(tx, { level: "franchisee", id: franchiseeId });
  authorize(actor, "franchisee.update", scope);
  // Activating/suspending a franchisee is a brand-level decision.
  if (patch.status && scope.level === "franchisee") authorize(actor, "franchisee.create", { level: "brand", brandId: scope.brandId });
  const [f] = await tx.update(schema.franchisees).set(patch).where(eq(schema.franchisees.id, franchiseeId)).returning();
  if (!f) throw notFound("Franchisee");
  await recordAudit(tx, actor, { action: "franchisee.update", scope, targetType: "franchisee", targetId: franchiseeId, metadata: patch });
  return f;
}

export async function listFranchisees(tx: Executor, brandId: string) {
  return tx.select().from(schema.franchisees).where(eq(schema.franchisees.brandId, brandId)).orderBy(asc(schema.franchisees.tradingName));
}

/* ── Branches ───────────────────────────────────────────────────── */

const branchFields = {
  name: z.string().trim().min(2).max(80),
  phone: E164.nullish(),
  addressLine: z.string().trim().max(200).nullish(),
  area: z.string().trim().max(80).nullish(),
  city: z.string().trim().min(2).max(80),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  timezone: z.string().default("Africa/Nairobi"),
  offersDelivery: z.boolean().default(true),
  offersCollection: z.boolean().default(true),
};

export const createBranchInput = z.object({ franchiseeId: z.uuid(), slug: SLUG, ...branchFields });

const numStr = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toFixed(6));

export async function createBranch(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(createBranchInput, raw);
  const fScope = await loadScope(tx, { level: "franchisee", id: input.franchiseeId });
  if (fScope.level !== "franchisee") throw notFound("Franchisee");
  authorize(actor, "branch.create", { level: "brand", brandId: fScope.brandId });
  const [b] = await tx.insert(schema.branches).values({
    ...input, brandId: fScope.brandId, phone: input.phone ?? null, addressLine: input.addressLine ?? null, area: input.area ?? null,
    latitude: numStr(input.latitude), longitude: numStr(input.longitude), status: "pending",
  }).returning();
  await recordAudit(tx, actor, {
    action: "branch.create", scope: { level: "branch", brandId: fScope.brandId, franchiseeId: input.franchiseeId, branchId: b!.id },
    targetType: "branch", targetId: b!.id, metadata: { slug: input.slug, name: input.name },
  });
  return b!;
}

export const updateBranchInput = z.object({
  branchId: z.uuid(),
  ...Object.fromEntries(Object.entries(branchFields).map(([k, v]) => [k, (v as z.ZodType).optional()])) as { [K in keyof typeof branchFields]: z.ZodOptional<(typeof branchFields)[K]> },
  status: STATUS.optional(),
});

export async function updateBranch(tx: Executor, actor: Actor, raw: unknown) {
  const { branchId, latitude, longitude, ...rest } = parseInput(updateBranchInput, raw);
  const scope = await loadScope(tx, { level: "branch", id: branchId });
  authorize(actor, "branch.update", scope);
  // Opening/closing a branch for trade is a brand decision.
  if (rest.status && scope.level === "branch") authorize(actor, "branch.create", { level: "brand", brandId: scope.brandId });
  const patch = {
    ...rest,
    ...(latitude !== undefined ? { latitude: numStr(latitude) } : {}),
    ...(longitude !== undefined ? { longitude: numStr(longitude) } : {}),
  };
  const [b] = await tx.update(schema.branches).set(patch).where(eq(schema.branches.id, branchId)).returning();
  if (!b) throw notFound("Branch");
  await recordAudit(tx, actor, { action: "branch.update", scope, targetType: "branch", targetId: branchId, metadata: patch });
  return b;
}

export const setHoursInput = z.object({
  branchId: z.uuid(),
  week: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), opensAt: z.string(), closesAt: z.string() })).max(28),
});

/** Replace the whole weekly schedule atomically. */
export async function setBranchHours(tx: Executor, actor: Actor, raw: unknown) {
  const { branchId, week } = parseInput(setHoursInput, raw);
  const problem = validateWeek(week);
  if (problem) throw new AppError("VALIDATION_FAILED", problem);
  const scope = await loadScope(tx, { level: "branch", id: branchId });
  if (scope.level !== "branch") throw notFound("Branch");
  authorize(actor, "branch.update", scope);
  await tx.delete(schema.branchHours).where(eq(schema.branchHours.branchId, branchId));
  if (week.length) {
    await tx.insert(schema.branchHours).values(week.map((w) => ({ ...w, branchId, brandId: scope.brandId })));
  }
  await recordAudit(tx, actor, { action: "branch.hours.set", scope, targetType: "branch", targetId: branchId, metadata: { intervals: week.length } });
}

export async function getBranchHours(tx: Executor, branchId: string) {
  return tx.select().from(schema.branchHours).where(eq(schema.branchHours.branchId, branchId)).orderBy(asc(schema.branchHours.dayOfWeek), asc(schema.branchHours.opensAt));
}

export const addClosureInput = z.object({
  branchId: z.uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().trim().min(2).max(120),
}).refine((v) => v.endsAt > v.startsAt, { message: "End must be after start.", path: ["endsAt"] });

export async function addClosure(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(addClosureInput, raw);
  const scope = await loadScope(tx, { level: "branch", id: input.branchId });
  if (scope.level !== "branch") throw notFound("Branch");
  authorize(actor, "branch.update", scope);
  const [c] = await tx.insert(schema.branchClosures).values({ ...input, brandId: scope.brandId }).returning();
  await recordAudit(tx, actor, { action: "branch.closure.add", scope, targetType: "branch_closure", targetId: c!.id, metadata: { reason: input.reason } });
  return c!;
}

export async function listBranches(tx: Executor, filter: { brandId?: string; franchiseeId?: string }) {
  const conds = [
    filter.brandId ? eq(schema.branches.brandId, filter.brandId) : undefined,
    filter.franchiseeId ? eq(schema.branches.franchiseeId, filter.franchiseeId) : undefined,
  ].filter(Boolean);
  return tx.select().from(schema.branches).where(and(...conds)).orderBy(asc(schema.branches.city), asc(schema.branches.name));
}
