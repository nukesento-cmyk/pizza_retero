import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { withActor, withSystem, type Tx } from "@retero/db";
import type { rbac } from "@retero/core";
import { isAppError, toHttp } from "@retero/shared/errors";
import { getSession } from "./auth/session";
import { db, systemDb } from "./db";
import { log } from "./log";

export type ActionState =
  | { ok: true; message?: string; data?: Record<string, unknown> }
  | { ok: false; message: string; fields?: Record<string, string> }
  | null;

export interface ActionCtx { tx: Tx; actor: rbac.Actor; userId: string; requestId: string }

/**
 * Run a staff mutation: verified session → RLS-scoped transaction → core.
 * Errors become safe, typed form state; unknown errors are logged, not shown.
 */
export async function act(
  fn: (ctx: ActionCtx) => Promise<{ message?: string; data?: Record<string, unknown> } | void>,
  opts: { revalidate?: string | string[] } = {},
): Promise<ActionState> {
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  const session = await getSession();
  if (session.actor.kind !== "user") return { ok: false, message: "Please sign in again." };
  const actor = session.actor;
  try {
    const res = await withActor(db(), actor.userId, (tx) => fn({ tx, actor, userId: actor.userId, requestId }));
    for (const p of [opts.revalidate ?? []].flat()) revalidatePath(p);
    return { ok: true, ...(res ?? {}) };
  } catch (e) {
    if (isAppError(e)) {
      const fields = e.code === "VALIDATION_FAILED" && Array.isArray(e.details)
        ? Object.fromEntries((e.details as { path: string; message: string }[]).map((d) => [d.path || "_", d.message]))
        : undefined;
      return { ok: false, message: e.message, ...(fields ? { fields } : {}) };
    }
    log.error("action.failed", { requestId, err: e });
    return { ok: false, message: toHttp(e, requestId).body.error.message + ` (ref ${requestId.slice(0, 8)})` };
  }
}

/** FormData → plain object: empty strings dropped, "on"/"true"/"false" become booleans. */
export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    const val = v.trim();
    if (val === "") continue;
    out[k] = val === "on" || val === "true" ? true : val === "false" ? false : val;
  }
  return out;
}

/**
 * Staff operation with side-effects across tables the staff role can't write
 * directly (kitchen transitions, stock, riders, assisted orders). The verified
 * actor is authorized by core against the stored scope; execution happens on
 * the system pool (D-025). Reads elsewhere stay behind RLS.
 */
export async function actSystem(
  fn: (ctx: ActionCtx) => Promise<{ message?: string; data?: Record<string, unknown> } | void>,
  opts: { revalidate?: string | string[] } = {},
): Promise<ActionState> {
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  const session = await getSession();
  if (session.actor.kind !== "user") return { ok: false, message: "Please sign in again." };
  const actor = session.actor;
  try {
    const res = await withSystem(systemDb(), "ops", (tx) => fn({ tx, actor, userId: actor.userId, requestId }));
    for (const p of [opts.revalidate ?? []].flat()) revalidatePath(p);
    return { ok: true, ...(res ?? {}) };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    log.error("action.failed", { requestId, err: e });
    return { ok: false, message: `Something went wrong. (ref ${requestId.slice(0, 8)})` };
  }
}
