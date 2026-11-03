import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { AppError, conflict, notFound, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";
import { recordAudit } from "../audit";
import { normalizeHost } from "../tenancy/host";
import { loadScope } from "../tenancy/scope";

export const RECORD_PREFIX = "_retero-verify";

export const addDomainInput = z.object({
  brandId: z.uuid(),
  franchiseeId: z.uuid().nullish(),
  branchId: z.uuid().nullish(),
  hostname: z.string().min(3).max(253),
}).refine((v) => !(v.franchiseeId && v.branchId), { message: "Target a franchisee or a branch, not both." });

async function scopeFor(tx: Executor, d: { brandId: string; franchiseeId?: string | null; branchId?: string | null }): Promise<ResourceScope> {
  if (d.branchId) return loadScope(tx, { level: "branch", id: d.branchId });
  if (d.franchiseeId) return loadScope(tx, { level: "franchisee", id: d.franchiseeId });
  return loadScope(tx, { level: "brand", id: d.brandId });
}

export async function addDomain(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(addDomainInput, raw);
  const hostname = normalizeHost(input.hostname);
  if (!hostname || hostname.includes(":")) throw new AppError("VALIDATION_FAILED", "Enter a hostname like westlands.example.com.");
  const scope = await scopeFor(tx, input);
  if (scope.level !== "platform" && scope.brandId !== input.brandId) throw notFound("Target");
  authorize(actor, "domain.manage", scope);
  const token = randomBytes(18).toString("base64url");
  const rows = await tx.insert(schema.domains).values({
    hostname, brandId: input.brandId, franchiseeId: input.franchiseeId ?? null, branchId: input.branchId ?? null, verificationToken: token,
  }).onConflictDoNothing().returning();
  if (!rows[0]) throw conflict("That hostname is already registered.");
  await recordAudit(tx, actor, { action: "domain.add", scope, targetType: "domain", targetId: rows[0].id, metadata: { hostname } });
  return { domain: rows[0], txtRecord: { name: `${RECORD_PREFIX}.${hostname}`, value: token } };
}

export type TxtResolver = (name: string) => Promise<string[][]>;

/** Verify ownership by DNS TXT record. The resolver is injectable for tests. */
export async function verifyDomain(tx: Executor, actor: Actor, domainId: string, resolver: TxtResolver = resolveTxt) {
  const id = parseInput(z.uuid(), domainId);
  const [d] = await tx.select().from(schema.domains).where(eq(schema.domains.id, id));
  if (!d) throw notFound("Domain");
  const scope = await scopeFor(tx, d);
  authorize(actor, "domain.manage", scope);
  if (d.verifiedAt) return d;
  let records: string[][] = [];
  try { records = await resolver(`${RECORD_PREFIX}.${d.hostname}`); } catch { records = []; }
  const found = records.some((chunks) => chunks.join("") === d.verificationToken);
  if (!found) throw new AppError("VALIDATION_FAILED", `TXT record not found yet. Add ${RECORD_PREFIX}.${d.hostname} with the value shown, then retry. DNS can take a while to update.`);
  const [v] = await tx.update(schema.domains).set({ verifiedAt: new Date() }).where(eq(schema.domains.id, id)).returning();
  await recordAudit(tx, actor, { action: "domain.verify", scope, targetType: "domain", targetId: id, metadata: { hostname: d.hostname } });
  return v!;
}

/** Make a verified domain the canonical hostname for its target. */
export async function setPrimaryDomain(tx: Executor, actor: Actor, domainId: string) {
  const id = parseInput(z.uuid(), domainId);
  const [d] = await tx.select().from(schema.domains).where(eq(schema.domains.id, id));
  if (!d) throw notFound("Domain");
  const scope = await scopeFor(tx, d);
  authorize(actor, "domain.manage", scope);
  if (!d.verifiedAt) throw new AppError("VALIDATION_FAILED", "Verify the domain before making it primary.");
  await tx.update(schema.domains).set({ isPrimary: false }).where(and(
    eq(schema.domains.brandId, d.brandId),
    d.franchiseeId ? eq(schema.domains.franchiseeId, d.franchiseeId) : isNull(schema.domains.franchiseeId),
    d.branchId ? eq(schema.domains.branchId, d.branchId) : isNull(schema.domains.branchId),
    ne(schema.domains.id, id),
  ));
  await tx.update(schema.domains).set({ isPrimary: true }).where(eq(schema.domains.id, id));
  await recordAudit(tx, actor, { action: "domain.primary", scope, targetType: "domain", targetId: id, metadata: { hostname: d.hostname } });
}

export async function removeDomain(tx: Executor, actor: Actor, domainId: string) {
  const id = parseInput(z.uuid(), domainId);
  const [d] = await tx.select().from(schema.domains).where(eq(schema.domains.id, id));
  if (!d) throw notFound("Domain");
  const scope = await scopeFor(tx, d);
  authorize(actor, "domain.manage", scope);
  await tx.delete(schema.domains).where(eq(schema.domains.id, id));
  await recordAudit(tx, actor, { action: "domain.remove", scope, targetType: "domain", targetId: id, metadata: { hostname: d.hostname } });
}

export async function listDomains(tx: Executor, brandId: string) {
  return tx.select().from(schema.domains).where(eq(schema.domains.brandId, brandId));
}
