import type { Metadata } from "next";
import { withActor, schema, inArray } from "@retero/db";
import { requireUser, rlsUserId } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

const SCOPE_LABEL = { platform: "Platform", brand: "Brand", franchisee: "Franchise", branch: "Branch" } as const;

/**
 * Ops entry point. Phase 1 shows who you are and where you hold roles; the
 * per-role dashboards arrive in Phase 2+. Every row shown is read through RLS.
 */
export default async function OpsHome() {
  const session = await requireUser("/ops");
  const grants = session.actor.kind === "user" ? session.actor.grants : [];

  const branchIds = grants.flatMap((g) => (g.branchId ? [g.branchId] : []));
  const brandIds = grants.flatMap((g) => (g.brandId ? [g.brandId] : []));
  const names = await withActor(db(), rlsUserId(session), async (tx) => {
    const br = branchIds.length
      ? await tx.select({ id: schema.branches.id, name: schema.branches.name }).from(schema.branches).where(inArray(schema.branches.id, branchIds))
      : [];
    const bd = brandIds.length
      ? await tx.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands).where(inArray(schema.brands.id, brandIds))
      : [];
    return new Map([...br, ...bd].map((r) => [r.id, r.name]));
  });

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <span className="font-display text-lg text-sauce">Retero <span className="font-sans text-sm font-medium text-foreground">Ops</span></span>
        <form action="/auth/sign-out" method="post">
          <span className="mr-3 text-sm text-muted-foreground">{session.user.email}</span>
          <button className="rounded border px-2 py-1 text-sm hover:bg-muted">Sign out</button>
        </form>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold">Your access</h1>
        {grants.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            You&apos;re signed in, but you don&apos;t hold a staff role yet. Ask your branch manager or brand administrator to add you.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-2">Role</th><th>Scope</th><th>Where</th><th className="text-right">Permissions</th></tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.membershipId} className="h-8 border-t">
                  <td className="font-medium">{g.roleKey.replace(/_/g, " ")}</td>
                  <td>{SCOPE_LABEL[g.scope]}</td>
                  <td>{g.scope === "platform" ? "All brands" : names.get(g.branchId ?? g.brandId ?? "") ?? "—"}</td>
                  <td className="text-right font-mono tabular">{g.permissions.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-10 rounded border border-dashed p-3 text-xs text-muted-foreground">
          Placeholder: role dashboards (franchise, branch, kitchen, inventory, delivery) start in Phase 2.
        </p>
      </main>
    </div>
  );
}
