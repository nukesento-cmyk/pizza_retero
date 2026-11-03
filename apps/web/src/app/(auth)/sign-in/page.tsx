import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "@/components/retero/ticket";
import { Stripes } from "@/components/retero/stripes";
import { authConfigured } from "@/server/env";
import { safeNext } from "@/server/safe-redirect";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="dark grain flex min-h-dvh flex-col bg-char text-dough">
      <Stripes className="h-3" />
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 block text-center font-display text-4xl text-crust">Back of house</Link>
          <Ticket heading="Sign in" className="text-espresso">
            {sp.error === "link" ? (
              <p role="alert" className="mb-4 text-sm text-sauce-deep">That link has expired or was already used. Request a new one.</p>
            ) : null}
            <SignInForm next={next} configured={authConfigured()} />
          </Ticket>
          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-dough/50">
            No password. One link, one hour.
          </p>
        </div>
      </div>
    </main>
  );
}
