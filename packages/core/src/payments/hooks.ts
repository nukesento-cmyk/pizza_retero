import type { Executor } from "@retero/db";
import { createTicket } from "../kitchen";

/**
 * Runs inside the payment-confirmation transaction, right after an order
 * becomes `new`, so a paid order and its kitchen ticket commit (or fail) together.
 */
export async function onOrderPaid(tx: Executor, orderId: string): Promise<void> {
  await createTicket(tx, orderId);
}
