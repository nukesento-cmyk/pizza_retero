import type { Metadata } from "next";
import Link from "next/link";
import { getBrandPublic, getTenant } from "@/server/tenant";
import { OvenIllustration } from "@/components/retero/oven-illustration";
import { StationMark } from "@/components/retero/station-marks";
import { Stripes } from "@/components/retero/stripes";
import { Ticket } from "@/components/retero/ticket";
import { Wordmark } from "@/components/retero/wordmark";
import { EnamelLink } from "@/components/retero/enamel-link";
import { NoStorefront } from "@/components/retero/no-storefront";
import { whatsappLink } from "@/lib/whatsapp";
import { STATIONS } from "@/kitchen/stations";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  if (!t) return { title: "Closed", robots: { index: false } };
  const title = t.branch ? `${t.brand.name} ${t.branch.name}` : t.brand.name;
  return {
    title: { absolute: title },
    alternates: t.canonicalHost ? { canonical: `https://${t.canonicalHost}/` } : undefined,
    robots: t.matchedBy === "dev-fallback" ? { index: false } : undefined,
  };
}

export default async function StorefrontHome() {
  const tenant = await getTenant();
  if (!tenant) return <NoStorefront />;

  const { settings, branches } = await getBrandPublic(tenant.brand.id);
  const shown = tenant.branch ? branches.filter((b) => b.id === tenant.branch!.id) : branches;
  const cities = [...new Set(shown.map((b) => b.city))];
  const wa = settings?.whatsappNumber
    ? whatsappLink(settings.whatsappNumber, `Hi ${tenant.brand.name}! I'd like to place an order.`)
    : null;

  return (
    <main className="min-h-dvh overflow-x-clip">
      {/* ── Hero: the parlour at night ─────────────────────────────── */}
      <section className="dark grain relative bg-char text-dough">
        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
          <Link href="/" className="font-display text-2xl text-crust">{tenant.brand.name}</Link>
          <nav className="flex items-center gap-5 text-sm">
            <a href="#kitchen" className="hidden hover:text-crust sm:inline">The kitchen</a>
            <a href="#find-us" className="hover:text-crust">Find us</a>
            <Link href="/sign-in" className="rounded-full border border-dough/30 px-3 py-1 hover:border-crust hover:text-crust">Staff</Link>
          </nav>
        </header>

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 pb-28 pt-6 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pb-36 md:pt-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-crust">
              {cities.length ? cities.join(" · ") : "Now preheating"}
              {tenant.branch ? ` — ${tenant.branch.name}` : ""}
            </p>
            <h1 className="mt-4">
              <Wordmark name={tenant.brand.name} className="block text-6xl sm:text-7xl lg:text-8xl" />
            </h1>
            <p className="mt-6 max-w-md font-menu text-2xl italic leading-snug text-dough/90 [font-variation-settings:'SOFT'_100,'WONK'_1]">
              Hand-stretched. Fire-kissed. Served with a little nostalgia.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <EnamelLink href="#kitchen" tone="sauce">Step into the kitchen</EnamelLink>
              {wa ? (
                <EnamelLink href={wa as never} tone="flour" target="_blank" rel="noopener noreferrer">
                  Order on WhatsApp
                </EnamelLink>
              ) : null}
            </div>
          </div>
          <OvenIllustration className="mx-auto w-full max-w-md drop-shadow-[0_30px_60px_rgba(240,106,46,.25)]" />
        </div>

        {/* perspective checkerboard floor */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 overflow-hidden [perspective:400px] md:h-36">
          <div className="checker checker-night absolute -inset-x-1/2 bottom-[-40%] h-[180%] origin-bottom [--size:56px] [transform:rotateX(62deg)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-char via-transparent to-transparent" />
        </div>
      </section>

      <Stripes />

      {/* ── The eight stations ─────────────────────────────────────── */}
      <section id="kitchen" className="grain bg-dough">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-8 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-menu text-4xl font-semibold tracking-tight text-espresso sm:text-5xl">
              Eight stations. <span className="font-display text-sauce">One pie.</span>
            </h2>
            <p className="rounded-full border-2 border-espresso bg-flour px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]">
              Walk-through kitchen · being built
            </p>
          </div>
          <p className="mt-4 max-w-2xl text-lg text-espresso/80">
            Soon you&apos;ll scroll through the whole kitchen, from the door to the oven, and build your pizza on the counter as you go. This is the route.
          </p>

          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STATIONS.map((s) => (
              <li
                key={s.id}
                className="group relative rounded-card border-[3px] border-espresso bg-flour p-5 shadow-print transition-transform duration-200 ease-arrive hover:-translate-y-1"
              >
                <div className="flex items-start justify-between">
                  <StationMark id={s.id} className="size-14 transition-transform duration-300 ease-arrive group-hover:rotate-[-6deg]" />
                  <span className="font-mono text-sm text-espresso/50 tabular">{String(s.n).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-4 font-menu text-xl font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-espresso/75">{s.line}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Find us: real branches from the database ───────────────── */}
      <section id="find-us" className="checker [--size:40px]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
          <h2 className="inline-block rounded-sign border-[3px] border-espresso bg-sauce px-5 py-2 font-display text-3xl text-flour shadow-print">
            Find us
          </h2>
          {shown.length === 0 ? (
            <Ticket heading="Notice" className="mt-8 max-w-sm">
              <p className="text-sm leading-relaxed">Our first branch is opening soon. Keep the oven light on for us.</p>
            </Ticket>
          ) : (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((b) => (
                <li key={b.id}>
                  <Ticket heading={b.city}>
                    <p className="font-menu text-2xl font-semibold not-italic">{b.name}</p>
                    {b.area ? <p className="mt-1 text-sm">{b.area}</p> : null}
                    <p className="mt-3 flex gap-2 text-xs uppercase tracking-wider">
                      {b.offersDelivery ? <span className="rounded bg-basil px-1.5 py-0.5 text-flour">Delivery</span> : null}
                      {b.offersCollection ? <span className="rounded bg-crust px-1.5 py-0.5 text-espresso">Collection</span> : null}
                    </p>
                    {b.phone ? <p className="mt-3 text-sm tabular"><a href={`tel:${b.phone}`} className="underline decoration-dotted">{b.phone}</a></p> : null}
                  </Ticket>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="bg-espresso text-dough/80">
        <Stripes className="h-2" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 font-mono text-xs sm:px-8">
          <span>© {new Date().getFullYear()} {tenant.brand.name}</span>
          <span className="text-dough/50">Pay with M-Pesa · Delivery &amp; collection</span>
        </div>
      </footer>
    </main>
  );
}
