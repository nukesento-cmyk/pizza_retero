import { createHmac } from "node:crypto";
import type { Executor } from "@retero/db";
import { schema } from "@retero/db";
import type { Actor, ResourceScope } from "../rbac/types";

export interface AuditEntry {
  action: string; // "<module>.<verb>", e.g. "membership.grant"
  scope: ResourceScope;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
  requestId?: string | null;
}

/**
 * Record an audit event in the SAME transaction as the change it describes,
 * so the change and its audit row commit or roll back together.
 */
export async function recordAudit(tx: Executor, actor: Actor, entry: AuditEntry): Promise<void> {
  const s = entry.scope;
  await tx.insert(schema.auditLogs).values({
    actorUserId: actor.kind === "user" ? actor.userId : null,
    action: entry.action,
    brandId: s.level === "platform" ? null : s.brandId,
    franchiseeId: s.level === "franchisee" || s.level === "branch" ? s.franchiseeId : null,
    branchId: s.level === "branch" ? s.branchId : null,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: { ...(entry.metadata ?? {}), ...(actor.kind === "system" ? { system: actor.reason } : {}) },
    ipHash: entry.ipHash ?? null,
    requestId: entry.requestId ?? null,
  });
}

/** Keyed hash so audit logs can correlate requests without storing raw IPs (data minimisation). */
export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  return createHmac("sha256", salt).update(ip).digest("base64url").slice(0, 22);
}
