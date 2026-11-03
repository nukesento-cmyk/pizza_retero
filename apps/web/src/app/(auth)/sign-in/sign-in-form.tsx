"use client";

import { useActionState } from "react";
import { requestSignInLink, type SignInState } from "./actions";
import { EnamelButton } from "@/components/retero/enamel-link";

export function SignInForm({ next, configured }: { next: string; configured: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignInLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-2">
        <p className="font-menu text-2xl font-semibold">Check your inbox.</p>
        <p className="text-sm">
          If <span className="font-semibold">{state.email}</span> can sign in, a link is on its way. It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-xs uppercase tracking-[0.2em]">Email</span>
        <input
          name="email" type="email" autoComplete="email" required inputMode="email"
          disabled={!configured || pending}
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "signin-error" : undefined}
          className="mt-2 block w-full rounded-md border-2 border-espresso bg-dough px-3 py-2.5 font-sans text-base text-espresso placeholder:text-espresso/40 focus:border-sauce focus:outline-none disabled:opacity-60"
          placeholder="you@example.com"
        />
      </label>
      {state.status === "error" ? <p id="signin-error" role="alert" className="text-sm text-sauce-deep">{state.message}</p> : null}
      {!configured ? (
        <p role="note" className="rounded border border-dashed border-espresso/40 p-2 text-xs">
          Sign-in isn&apos;t configured yet. Add the Supabase URL and anon key to <code>.env</code>.
        </p>
      ) : null}
      <EnamelButton type="submit" disabled={!configured || pending} className="w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </EnamelButton>
    </form>
  );
}
