import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../rbac/authorize";
import type { Actor, ResourceScope } from "../rbac/types";

/**
 * Branch sales report (report.read). Revenue counts PAID orders only; refunds
 * are shown separately so net revenue reconciles with M-Pesa statements.
 */
export async function branchSales(tx: Executor, actor: Actor, scope: ResourceScope & { level: "branch" }, range: { from: Date; to: Date }) {
  authorize(actor, "report.read", scope);
  const { orders, orderItems, refunds } = schema;
  const where = and(eq(orders.branchId, scope.branchId), gte(orders.placedAt, range.from), lt(orders.placedAt, range.to));
  const [totals] = await tx.select({
    orders: sql<number>`count(*) filter (where ${orders.paidAt} is not null)::int`,
    cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
    unpaid: sql<number>`count(*) filter (where ${orders.paidAt} is null and ${orders.status} = 'cancelled')::int`,
    gross: sql<string>`coalesce(sum(${orders.totalMinor}) filter (where ${orders.paidAt} is not null), 0)::text`,
    vat: sql<string>`coalesce(sum(${orders.vatIncludedMinor}) filter (where ${orders.paidAt} is not null), 0)::text`,
    delivery: sql<string>`coalesce(sum(${orders.deliveryFeeMinor}) filter (where ${orders.paidAt} is not null), 0)::text`,
  }).from(orders).where(where);
  const byChannel = await tx.select({ channel: orders.channel, n: sql<number>`count(*)::int`, gross: sql<string>`sum(${orders.totalMinor})::text` })
    .from(orders).where(and(where, sql`${orders.paidAt} is not null`)).groupBy(orders.channel);
  const top = await tx.select({ name: orderItems.productName, qty: sql<number>`sum(${orderItems.quantity})::int`, gross: sql<string>`sum(${orderItems.lineTotalMinor})::text` })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(where, sql`${orders.paidAt} is not null`))
    .groupBy(orderItems.productName).orderBy(desc(sql`sum(${orderItems.quantity})`)).limit(10);
  const [refunded] = await tx.select({ s: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)::text` }).from(refunds)
    .where(and(eq(refunds.branchId, scope.branchId), inArray(refunds.status, ["succeeded"]), gte(refunds.completedAt, range.from), lt(refunds.completedAt, range.to)));
  const gross = BigInt(totals!.gross), refundsMinor = BigInt(refunded!.s);
  return {
    orders: totals!.orders, cancelled: totals!.cancelled,
    grossMinor: gross, refundsMinor, netMinor: gross - refundsMinor, vatMinor: BigInt(totals!.vat), deliveryMinor: BigInt(totals!.delivery),
    averageMinor: totals!.orders ? gross / BigInt(totals!.orders) : 0n,
    byChannel: byChannel.map((c) => ({ ...c, gross: BigInt(c.gross) })), top: top.map((t) => ({ ...t, gross: BigInt(t.gross) })),
  };
}
