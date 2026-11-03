"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { rateLimit } from "@/server/rate-limit";
import { safeNext } from "@/server/safe-redirect";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const input = z.object({
  email: z.email("Enter a valid email address.").max(254).transform((s) => s.trim().toLowerCase()),
  next: z.string().max(512).optional(),
});

export async function requestSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = input.safeParse({ email: form.get("email"), next: form.get("next") ?? undefined });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your email address." };
  const { email } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`signin:ip:${ip}`, 10, 15 * 60_000).ok || !rateLimit(`signin:email:${email}`, 3, 15 * 60_000).ok) {
    return { status: "error", message: "Too many attempts. Please wait a few minutes and try again." };
  }

  const supabase = await supabaseServer();
  if (!supabase) return { status: "error", message: "Sign-in isn't configured on this server yet." };

  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const next = safeNext(parsed.data.next);
  // Supabase only honours redirect URLs on the project allow-list, so a forged Host can't redirect elsewhere.
  const emailRedirectTo = `${proto}://${host}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo, shouldCreateUser: true } });
  // Same response whether or not the account exists (no account enumeration).
  if (error && error.status !== 422) {
    return { status: "error", message: "We couldn't send the link right now. Please try again shortly." };
  }
  return { status: "sent", email };
}
