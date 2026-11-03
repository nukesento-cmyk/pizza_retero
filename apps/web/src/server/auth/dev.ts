import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { devAuthEnabled, env } from "../env";

/**
 * Local-only sign-in used when Supabase isn't configured (D-016). The cookie
 * is an HMAC-signed user id. env() refuses to boot with DEV_AUTH_SECRET set
 * outside APP_ENV=local, so this can't be switched on in production.
 */
const COOKIE = "retero_dev_session";

const sign = (userId: string) => createHmac("sha256", env().DEV_AUTH_SECRET!).update(`dev-session:${userId}`).digest("base64url");

export async function readDevSession(): Promise<string | null> {
  if (!devAuthEnabled()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, sig] = raw.split(".");
  if (!userId || !sig) return null;
  const expected = Buffer.from(sign(userId));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got) ? userId : null;
}

export async function writeDevSession(userId: string) {
  if (!devAuthEnabled()) throw new Error("dev auth disabled");
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
}

export async function clearDevSession() {
  (await cookies()).delete(COOKIE);
}
