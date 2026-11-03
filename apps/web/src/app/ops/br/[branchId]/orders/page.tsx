import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, schema, sql } from "@retero/db";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { PageHeader, Section, Table } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { StatusChip, type StatusKey } from "@/components/ops/status-chip";
import { fmt } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Orders({ params, searchParams }: { params: Promise<{ branchId: string }>; searchParams: Promise<{ days?: string }> }) {
  const { branchId } = await params;
  const days = Math.min(30, Math.max(1, Number((await searchParams).days ?? 1)));
  const s = await requireUser(`/ops/br/${branchId}/orders`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "order.read", scope)) notFound();
  const rows = await readAs(s, (tx) => tx.select().from(schema.orders)
    .where(and(eq(schema.orders.branchId, branchId), gte(schema.orders.placedAt, sql`now() - make_interval(days => ${days})`)))
    .orderBy(desc(schema.orders.placedAt)).limit(200));
  return (
    <>
      <PageHeader title={`${b.name} orders`} kicker="Branch" actions={[1, 7, 30].map((d) => <Link key={d} href={`?days=${d}`} className={`rounded border px-2 py-1 text-xs ${d === days ? "bg-muted" : ""}`}>{d === 1 ? "24h" : `${d}d`}</Link>)} />
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <Section title={`${rows.length} orders`}>
        <Table head={["Order", "Placed", "Customer", "Type", "Total", "Payment", "Status"]} empty="No orders in this period.">
          {rows.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/ops/br/${branchId}/orders/${o.id}`} className="font-mono font-medium hover:underline">{o.number}</Link>{o.channel !== "web" ? <span className="ml-1 text-[10px] uppercase text-muted-foreground">{o.channel}</span> : null}</td>
              <td className="font-mono text-xs">{o.placedAt.toLocaleString("en-KE", { timeZone: b.timezone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</td>
              <td>{o.contactName}</td>
              <td className="capitalize">{o.fulfilment}</td>
              <td className="font-mono text-xs">{fmt(o.totalMinor)}</td>
              <td className="text-xs capitalize">{o.paymentStatus.replace("_", " ")}</td>
              <td>{o.status === "pending_payment" || o.status === "cancelled" ? <span className="text-xs uppercase text-muted-foreground">{o.status.replace("_", " ")}</span> : <StatusChip status={o.status.toUpperCase() as StatusKey} />}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
