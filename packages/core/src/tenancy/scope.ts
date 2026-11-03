import { eq } from "drizzle-orm";
import { notFound } from "@retero/shared/errors";
import type { Executor } from "@retero/db";
import { schema } from "@retero/db";
import type { ResourceScope } from "../rbac/types";

export type ScopeRef =
  | { level: "platform" }
  | { level: "brand"; id: string }
  | { level: "franchisee"; id: string }
  | { level: "branch"; id: string };

/**
 * Build a trusted ResourceScope by reading ancestors from the database.
 * Never assemble a ResourceScope from request input directly.
 *
 * Uses the owner-free runtime connection, so the row must be visible to the
 * actor (or public); otherwise NOT_FOUND — which also avoids confirming that
 * another tenant's resource exists.
 */
export async function loadScope(tx: Executor, ref: ScopeRef): Promise<ResourceScope> {
  switch (ref.level) {
    case "platform":
      return { level: "platform" };
    case "brand": {
      const [b] = await tx.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.id, ref.id));
      if (!b) throw notFound("Brand");
      return { level: "brand", brandId: b.id };
    }
    case "franchisee": {
      const [f] = await tx
        .select({ id: schema.franchisees.id, brandId: schema.franchisees.brandId })
        .from(schema.franchisees)
        .where(eq(schema.franchisees.id, ref.id));
      if (!f) throw notFound("Franchisee");
      return { level: "franchisee", brandId: f.brandId, franchiseeId: f.id };
    }
    case "branch": {
      const [b] = await tx
        .select({ id: schema.branches.id, brandId: schema.branches.brandId, franchiseeId: schema.branches.franchiseeId })
        .from(schema.branches)
        .where(eq(schema.branches.id, ref.id));
      if (!b) throw notFound("Branch");
      return { level: "branch", brandId: b.brandId, franchiseeId: b.franchiseeId, branchId: b.id };
    }
  }
}
