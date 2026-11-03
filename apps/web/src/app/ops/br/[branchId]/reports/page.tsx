import Link from "next/link";
import { notFound } from "next/navigation";
import { rbac, reports } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { PageHeader, Panel, Section, Table } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { fmt } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Reports({ params, searchParams }: { params: Promise<{ branchId: string }>; searchParams: Promise<{ days?: string }> }) {
  const { branchId } = await params;
  const days = Math.min(90, Math.max(1, Number((await searchParams).days ?? 1)));
  const s = await requireUser(`/ops/br/${branchId}/reports`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "report.read", scope)) notFound();
  const to = new Date(); const from = new Date(to.getTime() - days * 86_400_000);
  const r = await readAs(s, (tx) => reports.branchSales(tx, s.actor, scope as rbac.ResourceScope & { level: "branch" }, { from, to }));
  const tiles = [["Paid orders", String(r.orders)], ["Gross", fmt(r.grossMinor)], ["Refunds", fmt(r.refundsMinor)], ["Net", fmt(r.netMinor)], ["Average order", fmt(r.averageMinor)], ["VAT included", fmt(r.vatMinor)]];
  return (
    <>
      <PageHeader title={`${b.name} sales`} kicker="Branch" actions={[1, 7, 30, 90].map((d) => <Link key={d} href={`?days=${d}`} className={`rounded border px-2 py-1 text-xs ${d === days ? "bg-muted" : ""}`}>{d === 1 ? "24h" : `${d}d`}</Link>)} />
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([k, v]) => <Panel key={k}><p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p><p className="mt-1 font-mono text-lg font-semibold">{v}</p></Panel>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top products"><Table head={["Product", "Qty", "Revenue"]} empty="No sales.">{r.top.map((t) => <tr key={t.name}><td>{t.name}</td><td>{t.qty}</td><td className="font-mono text-xs">{fmt(t.gross)}</td></tr>)}</Table></Section>
        <Section title="By channel"><Table head={["Channel", "Orders", "Revenue"]} empty="No sales.">{r.byChannel.map((c) => <tr key={c.channel}><td className="capitalize">{c.channel}</td><td>{c.n}</td><td className="font-mono text-xs">{fmt(c.gross)}</td></tr>)}</Table></Section>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{r.cancelled} cancelled in this period. Revenue counts confirmed M-Pesa payments only.</p>
    </>
  );
}
