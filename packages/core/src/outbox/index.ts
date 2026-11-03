import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { schema, type Executor } from "@retero/db";

/**
 * Transactional outbox. Write events in the same transaction as the change;
 * the worker delivers them at-least-once. Handlers must be idempotent.
 */
export interface OutboxEvent { topic: string; brandId?: string | null; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }

export async function enqueue(tx: Executor, e: OutboxEvent) {
  await tx.insert(schema.outboxEvents).values({ ...e, brandId: e.brandId ?? null });
}

/** Claim a batch for delivery (SKIP LOCKED: several workers can run safely). */
export async function claimBatch(tx: Executor, limit = 20) {
  return tx.select().from(schema.outboxEvents)
    .where(and(isNull(schema.outboxEvents.publishedAt), lte(schema.outboxEvents.availableAt, new Date())))
    .orderBy(asc(schema.outboxEvents.createdAt)).limit(limit).for("update", { skipLocked: true });
}

export async function markPublished(tx: Executor, id: string) {
  await tx.update(schema.outboxEvents).set({ publishedAt: new Date() }).where(eq(schema.outboxEvents.id, id));
}

/** Exponential backoff up to 1h; gives up after 12 attempts (left for inspection). */
export async function markFailed(tx: Executor, id: string, error: string) {
  await tx.update(schema.outboxEvents).set({
    attempts: sql`${schema.outboxEvents.attempts} + 1`,
    lastError: error.slice(0, 500),
    availableAt: sql`now() + least(interval '1 hour', interval '5 seconds' * power(2, ${schema.outboxEvents.attempts}))`,
    publishedAt: sql`case when ${schema.outboxEvents.attempts} >= 11 then now() else null end`,
  }).where(eq(schema.outboxEvents.id, id));
}
