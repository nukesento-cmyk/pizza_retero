import type { Executor } from "@retero/db";

/**
 * Runs inside the payment-confirmation transaction, right after an order
 * becomes `new`. Phase 5 wires the kitchen ticket and stock consumption here,
 * so a paid order and its ticket commit (or fail) together.
 */
export async function onOrderPaid(_tx: Executor, _orderId: string): Promise<void> {}
