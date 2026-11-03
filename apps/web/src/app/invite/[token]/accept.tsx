"use client";

import Link from "next/link";
import { ActionForm, Submit, useFormErrors } from "@/components/ops/action-form";
import { acceptInvitationAction } from "@/app/ops/actions";

function Done() {
  const { state } = useFormErrors();
  return state?.ok ? <p className="text-sm">You&apos;re in. <Link href="/ops" className="font-semibold underline">Go to back of house</Link></p> : null;
}

export function AcceptInvite({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInvitationAction} keep>
      <input type="hidden" name="token" value={token} />
      <Done />
      <Submit pendingLabel="Joining…" className="w-full">Accept invitation</Submit>
    </ActionForm>
  );
}
