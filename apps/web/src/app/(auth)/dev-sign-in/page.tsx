import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devAuthEnabled } from "@/server/env";
import { safeNext } from "@/server/safe-redirect";
import { Ticket } from "@/components/retero/ticket";
import { DevSignInForm } from "./form";

export const metadata: Metadata = { title: "Dev sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DevSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!devAuthEnabled()) notFound();
  const { next } = await searchParams;
  return (
    <main className="dark grid min-h-dvh place-items-center bg-char px-4 text-dough">
      <div className="w-full max-w-sm">
        <p className="mb-4 text-center font-mono text-xs uppercase tracking-[0.3em] text-crust">Local development only</p>
        <Ticket heading="Dev sign-in" className="text-espresso">
          <p className="mb-4 text-sm">Signs you in as any email without Supabase. Disabled automatically outside <code>APP_ENV=local</code>.</p>
          <DevSignInForm next={safeNext(next)} />
        </Ticket>
      </div>
    </main>
  );
}
