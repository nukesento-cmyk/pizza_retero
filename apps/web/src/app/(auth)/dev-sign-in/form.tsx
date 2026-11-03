"use client";

import { useActionState } from "react";
import { devSignIn } from "./actions";

export function DevSignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(devSignIn, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-xs uppercase tracking-widest">
        Email
        <input name="email" type="email" required className="mt-1 block w-full rounded border-2 border-espresso bg-dough px-3 py-2 font-sans text-base normal-case tracking-normal" />
      </label>
      {state?.message ? <p role="alert" className="text-sm text-sauce-deep">{state.message}</p> : null}
      <button disabled={pending} className="w-full rounded border-2 border-espresso bg-sauce px-3 py-2 font-semibold text-flour">{pending ? "…" : "Sign in"}</button>
    </form>
  );
}
