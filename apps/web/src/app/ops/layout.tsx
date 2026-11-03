import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/server/auth/session";
import { opsNav } from "@/server/ops/context";

export const dynamic = "force-dynamic";

const KIND_LABEL = { platform: "Platform", brand: "Brand", franchisee: "Franchise", branch: "Branch" } as const;

export default async function OpsLayout({ children }: { children: ReactNode }) {
  const session = await requireUser("/ops");
  const nav = await opsNav(session);
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
        <div className="flex h-12 items-center border-b px-4">
          <Link href="/ops" className="font-display text-lg text-sauce">Retero <span className="font-sans text-sm font-medium text-foreground">Ops</span></Link>
        </div>
        <nav aria-label="Operations" className="space-y-4 p-3 text-sm">
          {(["platform", "brand", "franchisee", "branch"] as const).map((kind) => {
            const items = nav.filter((n) => n.kind === kind);
            if (!items.length) return null;
            return (
              <div key={kind}>
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{KIND_LABEL[kind]}</p>
                <ul>
                  {items.map((n) => (
                    <li key={n.href}><Link href={n.href as never} className="block truncate rounded px-2 py-1.5 hover:bg-muted">{n.label}</Link></li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between gap-3 border-b px-4">
          <details className="md:hidden">
            <summary className="cursor-pointer text-sm font-medium">Menu</summary>
            <ul className="absolute z-30 mt-2 w-60 rounded-md border bg-card p-2 text-sm shadow-lg">
              {nav.map((n) => <li key={n.href}><Link href={n.href as never} className="block rounded px-2 py-1.5 hover:bg-muted">{n.label}</Link></li>)}
            </ul>
          </details>
          <span className="hidden md:block" />
          <form action="/auth/sign-out" method="post" className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{session.user.email}</span>
            <button className="rounded border px-2 py-1 hover:bg-muted">Sign out</button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
