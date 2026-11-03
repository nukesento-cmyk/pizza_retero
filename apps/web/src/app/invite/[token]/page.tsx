import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { devAuthEnabled } from "@/server/env";
import { Ticket } from "@/components/retero/ticket";
import { AcceptInvite } from "./accept";

export const metadata: Metadata = { title: "Join the team", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await getSession();
  const signIn = `${devAuthEnabled() ? "/dev-sign-in" : "/sign-in"}?next=${encodeURIComponent(`/invite/${token}`)}`;
  return (
    <main className="dark grid min-h-dvh place-items-center bg-char px-4 text-dough">
      <div className="w-full max-w-sm">
        <Ticket heading="You're invited" className="text-espresso">
          {s.user ? (
            <>
              <p className="mb-4 text-sm">Signed in as <strong>{s.user.email}</strong>. Accept to join the kitchen team.</p>
              <AcceptInvite token={token} />
            </>
          ) : (
            <p className="text-sm">Sign in with the email address the invitation was sent to, then come back here. <Link href={signIn as never} className="font-semibold underline">Sign in</Link></p>
          )}
        </Ticket>
      </div>
    </main>
  );
}
