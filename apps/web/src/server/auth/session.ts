import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq, schema, withActor } from "@retero/db";
import { readDevSession } from "./dev";
import { identity, rbac } from "@retero/core";
import { supabaseServer } from "@/lib/supabase/server";
import { db } from "../db";
import { devAuthEnabled } from "../env";

export interface Session {
  actor: rbac.Actor;
  user: { id: string; email: string | null } | null;
}

/**
 * Resolve the caller ONCE per request.
 *
 * `auth.getUser()` round-trips to Supabase Auth, which verifies the JWT and
 * that the session hasn't been revoked. We never trust a decoded cookie alone.
 */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await supabaseServer();
  if (!supabase) {
    const devUser = await readDevSession();
    if (!devUser) return { actor: { kind: "anonymous" }, user: null };
    return withActor(db(), devUser, async (tx) => {
      const [u] = await tx.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, devUser));
      if (!u) return { actor: { kind: "anonymous" } as const, user: null };
      return { actor: await identity.loadActor(tx, devUser), user: { id: u.id, email: u.email } };
    });
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { actor: { kind: "anonymous" }, user: null };

  const u = data.user;
  const actor = await withActor(db(), u.id, async (tx) => {
    await identity.syncUser(tx, {
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ? `+${u.phone.replace(/^\+/, "")}` : null,
      displayName: (u.user_metadata?.full_name as string | undefined) ?? null,
    });
    return identity.loadActor(tx, u.id);
  });
  return { actor, user: { id: u.id, email: u.email ?? null } };
});

/** For pages that need a signed-in user. */
export async function requireUser(next = "/ops"): Promise<Session & { user: NonNullable<Session["user"]> }> {
  const s = await getSession();
  if (!s.user) redirect(`${devAuthEnabled() ? "/dev-sign-in" : "/sign-in"}?next=${encodeURIComponent(next)}` as never);
  return s as Session & { user: NonNullable<Session["user"]> };
}

/** userId to put into the DB RLS context for this request. */
export const rlsUserId = (s: Session): string | null => (s.actor.kind === "user" ? s.actor.userId : null);
