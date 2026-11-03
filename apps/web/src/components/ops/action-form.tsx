"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/server/action";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const PendingCtx = createContext(false);
const FormCtx = createContext<{ errors: Record<string, string>; state: ActionState }>({ errors: {}, state: null });
export const useFormErrors = () => useContext(FormCtx);

/**
 * Form bound to a server action. Fields read their own errors from context,
 * so server components can compose forms without passing functions.
 * Shows the result message; if the action returns `data.link`, shows it in a
 * copyable box (used for one-time invitation links).
 */
export function ActionForm({ action, children, className, keep = false, hideOnSuccess = false }: {
  action: Action; children: ReactNode; className?: string; keep?: boolean; hideOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !keep) ref.current?.reset();
  }, [state, keep]);
  const errors = state && !state.ok ? state.fields ?? {} : {};
  // Submit via onSubmit (not action=) so React doesn't clear the user's input when validation fails.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  const link = state?.ok ? (state.data?.link as string | undefined) : undefined;
  return (
    <FormCtx.Provider value={{ errors, state }}>
      <form ref={ref} onSubmit={onSubmit} aria-busy={pending} className={cn("space-y-3", className)} noValidate>
        <PendingCtx.Provider value={pending}>
        {hideOnSuccess && state?.ok ? null : children}
        <div aria-live="polite" className="col-span-full">
          {state && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
          {state?.ok && state.message ? <p className="text-sm text-basil">{state.message}</p> : null}
          {link ? (
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link"
              className="mt-2 w-full rounded border bg-background px-2 py-1 font-mono text-xs" />
          ) : null}
        </div>
        </PendingCtx.Provider>
      </form>
    </FormCtx.Provider>
  );
}

export function Submit({ children, pendingLabel, variant = "primary", className }: {
  children: ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; className?: string;
}) {
  const pending = useContext(PendingCtx);
  return (
    <button
      type="submit" disabled={pending}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-sauce-deep",
        variant === "secondary" && "border bg-background hover:bg-muted",
        variant === "ghost" && "hover:bg-muted",
        variant === "danger" && "border border-destructive/40 text-destructive hover:bg-destructive/10",
        className,
      )}
    >
      {pending ? pendingLabel ?? "…" : children}
    </button>
  );
}

/** Field label + control + error for `name` (read from the enclosing ActionForm). */
export function Field({ label, name, hint, children, className }: { label: string; name?: string; hint?: string; children: ReactNode; className?: string }) {
  const { errors } = useFormErrors();
  const error = name ? errors[name] : undefined;
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span role="alert" className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
