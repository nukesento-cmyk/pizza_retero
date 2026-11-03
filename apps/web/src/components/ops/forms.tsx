"use client";

import { ActionForm, Field, Submit } from "./action-form";
import { SelectInput, TextInput } from "./kit";
import type { ActionState } from "@/server/action";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** One-click form posting hidden fields (status changes, revoke, verify…). */
export function InlineAction({ action, fields, label, variant = "secondary" }: {
  action: Action; fields: Record<string, string>; label: string; variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <ActionForm action={action} keep className="inline-block space-y-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit variant={variant} className="h-8">{label}</Submit>
    </ActionForm>
  );
}

export function InviteForm({ action, level, targetId, roles, returnTo }: {
  action: Action; level: string; targetId: string; roles: { key: string; name: string }[]; returnTo: string;
}) {
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end sm:space-y-0">
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Field label="Email" name="email"><TextInput name="email" type="email" required placeholder="cook@example.com" /></Field>
      <Field label="Role" name="roleKey"><SelectInput name="roleKey" options={roles.map((r) => ({ value: r.key, label: r.name }))} /></Field>
      <Submit pendingLabel="Inviting…">Invite</Submit>
    </ActionForm>
  );
}
