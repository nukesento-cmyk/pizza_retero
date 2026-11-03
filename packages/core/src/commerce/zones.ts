import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor } from "../rbac/types";
import { recordAudit } from "../audit";
import { loadScope } from "../tenancy/scope";
import { distanceM, inPolygon } from "../geo";
import { assertPayable } from "../catalogue/admin";

export type Zone = typeof schema.deliveryZones.$inferSelect;

export const zoneInput = z.object({
  branchId: z.uuid(),
  zoneId: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  radiusM: z.coerce.number().int().min(100).max(50_000).nullish(),
  polygon: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(3).max(200).nullish(),
  feeMinor: z.coerce.bigint().refine((v) => v >= 0n),
  freeAboveMinor: z.coerce.bigint().nullish(),
  minOrderMinor: z.coerce.bigint().nullish(),
  etaMinutes: z.coerce.number().int().min(5).max(240).default(40),
  active: z.boolean().default(true),
}).refine((v) => v.radiusM || v.polygon, { message: "Give a radius or a polygon.", path: ["radiusM"] });

export async function upsertZone(tx: Executor, actor: Actor, raw: unknown) {
  const { zoneId, ...input } = parseInput(zoneInput, raw);
  const scope = await loadScope(tx, { level: "branch", id: input.branchId });
  if (scope.level !== "branch") throw notFound("Branch");
  authorize(actor, "branch.update", scope);
  assertPayable("KES", input.feeMinor, "Delivery fee");
  const vals = { ...input, brandId: scope.brandId, radiusM: input.radiusM ?? null, polygon: input.polygon ?? null, freeAboveMinor: input.freeAboveMinor ?? null, minOrderMinor: input.minOrderMinor ?? null };
  const [zone] = zoneId
    ? await tx.update(schema.deliveryZones).set(vals).where(and(eq(schema.deliveryZones.id, zoneId), eq(schema.deliveryZones.branchId, input.branchId))).returning()
    : await tx.insert(schema.deliveryZones).values(vals).returning();
  if (!zone) throw notFound("Zone");
  await recordAudit(tx, actor, { action: "delivery_zone.upsert", scope, targetType: "delivery_zone", targetId: zone.id, metadata: { name: input.name } });
  return zone;
}

export async function listZones(tx: Executor, branchId: string) {
  return tx.select().from(schema.deliveryZones).where(eq(schema.deliveryZones.branchId, branchId)).orderBy(asc(schema.deliveryZones.sort), asc(schema.deliveryZones.radiusM));
}

/** First active zone (by sort, then smallest radius) containing the point. */
export function zoneFor(zones: readonly Zone[], branch: { lat: number; lng: number } | null, point: { lat: number; lng: number }): Zone | null {
  for (const z of [...zones].filter((x) => x.active).sort((a, b) => a.sort - b.sort || (a.radiusM ?? 1e9) - (b.radiusM ?? 1e9))) {
    if (z.polygon && inPolygon(point, z.polygon)) return z;
    if (!z.polygon && z.radiusM && branch && distanceM(branch, point) <= z.radiusM) return z;
  }
  return null;
}
