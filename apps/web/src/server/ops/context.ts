import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull, schema, withActor, type Tx } from "@retero/db";
import { rbac, tenancy } from "@retero/core";
import { requireUser, rlsUserId } from "../auth/session";
import { db } from "../db";

export type OpsSession = Awaited<ReturnType<typeof requireUser>>;

/** Read through RLS as the signed-in staff member. */
export async function readAs<T>(s: OpsSession, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withActor(db(), rlsUserId(s), fn);
}

export interface NavNode { label: string; href: string; kind: "platform" | "brand" | "franchisee" | "branch"; children?: NavNode[] }

/** Sidebar tree derived from the caller's grants (names read through RLS). */
export const opsNav = cache(async (s: OpsSession): Promise<NavNode[]> => {
  const grants = s.actor.kind === "user" ? s.actor.grants : [];
  return readAs(s, async (tx) => {
    const nodes: NavNode[] = [];
    const isPlatform = grants.some((g) => g.scope === "platform");
    const brandIds = isPlatform
      ? (await tx.select({ id: schema.brands.id }).from(schema.brands)).map((b) => b.id)
      : [...new Set(grants.filter((g) => g.scope === "brand").map((g) => g.brandId!))];
    if (isPlatform) nodes.push({ label: "Platform", href: "/ops/platform", kind: "platform" });

    const brands = brandIds.length ? await tx.select().from(schema.brands).where(inArray(schema.brands.id, brandIds)) : [];
    for (const b of brands) nodes.push({ label: b.name, href: `/ops/b/${b.id}`, kind: "brand" });

    const frIds = grants.filter((g) => g.scope === "franchisee").map((g) => g.franchiseeId!);
    if (frIds.length) {
      const frs = await tx.select().from(schema.franchisees).where(inArray(schema.franchisees.id, frIds));
      for (const f of frs) nodes.push({ label: f.tradingName, href: `/ops/f/${f.id}`, kind: "franchisee" });
    }
    const brIds = grants.filter((g) => g.scope === "branch").map((g) => g.branchId!);
    if (brIds.length) {
      const brs = await tx.select().from(schema.branches).where(inArray(schema.branches.id, [...new Set(brIds)]));
      for (const b of brs) nodes.push({ label: b.name, href: `/ops/br/${b.id}`, kind: "branch" });
    }
    return nodes;
  });
});

export async function loadBrand(s: OpsSession, brandId: string) {
  const row = await readAs(s, async (tx) => (await tx.select().from(schema.brands).where(eq(schema.brands.id, brandId)))[0]);
  if (!row || !rbac.can(s.actor, "brand.read", { level: "brand", brandId })) notFound();
  return row;
}

export async function loadFranchisee(s: OpsSession, id: string) {
  const row = await readAs(s, async (tx) => (await tx.select().from(schema.franchisees).where(eq(schema.franchisees.id, id)))[0]);
  if (!row) notFound();
  return row;
}

export async function loadBranch(s: OpsSession, id: string) {
  const row = await readAs(s, async (tx) => (await tx.select().from(schema.branches).where(eq(schema.branches.id, id)))[0]);
  if (!row || !rbac.can(s.actor, "branch.read", { level: "branch", brandId: row.brandId, franchiseeId: row.franchiseeId, branchId: row.id })) notFound();
  return row;
}

export const branchScope = (b: { brandId: string; franchiseeId: string; id: string }): rbac.ResourceScope =>
  ({ level: "branch", brandId: b.brandId, franchiseeId: b.franchiseeId, branchId: b.id });

export { tenancy, and, isNull };
