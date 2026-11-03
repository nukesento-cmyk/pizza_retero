import type { Executor, schema } from "@retero/db";

type Event = typeof schema.outboxEvents.$inferSelect;
export type Handler = (tx: Executor, e: Event) => Promise<void>;

/**
 * Outbox subscribers. Each must be idempotent (delivery is at-least-once).
 * Notification channels (SMS/WhatsApp Business API) plug in here once a
 * provider is chosen (Q8); until then events are logged for observability.
 */
export const handlers: Record<string, Handler[]> = {
  "order.placed": [log],
  "order.paid": [log],
  "order.cancelled": [log],
  "order.status": [log],
  "payment.paid_after_cancel": [log],
  "payment.duplicate": [log],
  "refund.succeeded": [log],
  "refund.failed": [log],
};

async function log(_tx: Executor, e: Event) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", event: "outbox.delivered", topic: e.topic, aggregateId: e.aggregateId }));
}
