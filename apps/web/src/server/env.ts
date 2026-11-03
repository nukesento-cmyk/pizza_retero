import "server-only";
import { z } from "zod";
import { loadEnv, postgresUrl } from "@retero/shared/env";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Deployment environment. Distinct from NODE_ENV: a local `next start` is a production build, not production. */
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
  DATABASE_URL: postgresUrl,
  DATABASE_SYSTEM_URL: postgresUrl,
  APP_FALLBACK_BRAND_SLUG: z.string().regex(/^[a-z0-9-]+$/).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional().or(z.literal("").transform(() => undefined)),
  AUDIT_IP_SALT: z.string().min(16),
  DEV_AUTH_SECRET: z.string().min(24).optional().or(z.literal("").transform(() => undefined)),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;
/** Validated lazily on first use, so `next build` does not need runtime secrets. */
export function env(): ServerEnv {
  cached ??= loadEnv(schema);
  if (cached.APP_ENV !== "local" && (!cached.NEXT_PUBLIC_SUPABASE_URL || !cached.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error("Supabase Auth must be configured outside local development (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  if (cached.APP_ENV !== "local" && cached.DEV_AUTH_SECRET) {
    throw new Error("DEV_AUTH_SECRET must not be set outside APP_ENV=local.");
  }
  return cached;
}

/** Local-only development sign-in (D-016). Never true outside APP_ENV=local. */
export function devAuthEnabled(): boolean {
  const e = env();
  return e.APP_ENV === "local" && Boolean(e.DEV_AUTH_SECRET) && !authConfigured();
}

export function authConfigured(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
