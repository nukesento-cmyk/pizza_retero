import { headers } from "next/headers";

/** Shown when the request host maps to no active brand. Doesn't reveal which tenants exist. */
export async function NoStorefront() {
  const host = (await headers()).get("host") ?? "this address";
  const dev = process.env.NODE_ENV !== "production";
  return (
    <main className="dark grain flex min-h-dvh items-center justify-center bg-char px-4 text-dough">
      <div className="relative z-10 max-w-lg text-center">
        <p className="neon-sign font-display text-7xl motion-safe:animate-flicker sm:text-8xl">Closed</p>
        <p className="mt-6 font-menu text-xl italic">There&apos;s no pizzeria at <span className="font-mono not-italic text-crust">{host}</span>.</p>
        {dev ? (
          <div className="mx-auto mt-10 max-w-md rounded-card border border-dough/20 bg-espresso p-5 text-left font-mono text-xs leading-relaxed text-dough/80">
            <p className="mb-2 uppercase tracking-widest text-crust">Dev setup</p>
            <p>Provision a brand, then set <code>APP_FALLBACK_BRAND_SLUG</code> in <code>.env</code>:</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-dough">pnpm --filter @retero/core create-brand retero &quot;Retero Pizza Co.&quot;</pre>
          </div>
        ) : null}
      </div>
    </main>
  );
}
