import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { opsNav } from "@/server/ops/context";
import { PageHeader, Panel, Empty } from "@/components/ops/kit";

export const metadata: Metadata = { title: "Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OpsHome() {
  const session = await requireUser("/ops");
  const nav = await opsNav(session);
  const grants = session.actor.kind === "user" ? session.actor.grants : [];
  return (
    <>
      <PageHeader title="Back of house" kicker="Operations">Choose where you&apos;re working.</PageHeader>
      {nav.length === 0 ? (
        <Empty>You&apos;re signed in, but you don&apos;t hold a staff role yet. Ask your branch manager or brand administrator for an invitation.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nav.map((n) => (
            <li key={n.href}>
              <Link href={n.href as never} className="block">
                <Panel className="transition-colors hover:border-primary">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{n.kind}</p>
                  <p className="mt-1 font-semibold">{n.label}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {grants.filter((g) => (n.kind === "platform" && g.scope === "platform") || n.href.endsWith(g.branchId ?? g.franchiseeId ?? g.brandId ?? "~")).map((g) => g.roleKey.replace(/_/g, " ")).join(", ") || "via a higher role"}
                  </p>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
