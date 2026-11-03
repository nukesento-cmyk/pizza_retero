import type { Metadata } from "next";
import { EnamelButton } from "@/components/retero/enamel-link";
import { OvenIllustration } from "@/components/retero/oven-illustration";
import { StationMark } from "@/components/retero/station-marks";
import { Stripes } from "@/components/retero/stripes";
import { Ticket } from "@/components/retero/ticket";
import { Wordmark } from "@/components/retero/wordmark";
import { StatusChip, STATUS_STYLE, type StatusKey } from "@/components/ops/status-chip";
import { Button } from "@/components/ui/button";
import { STATIONS } from "@/kitchen/stations";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

const SWATCHES = [
  ["sauce", "#C8402B", "Primary · CTAs · the sign"],
  ["sauce-deep", "#8F2A1C", "Pressed · red text on cream"],
  ["crust", "#E7A33E", "Accent · prices · highlights"],
  ["oven", "#F06A2E", "Glow only — never text on cream"],
  ["basil", "#2E6B52", "Dietary · success · open now"],
  ["dough", "#F6ECD9", "Light surface"],
  ["flour", "#FBF6EC", "Raised surface · tickets"],
  ["tile", "#E9D9BC", "Checker · dividers"],
  ["espresso", "#2A1A13", "Ink · dark cards"],
  ["char", "#15100C", "Night · scene fog"],
] as const;

export default function Styleguide() {
  return (
    <main className="grain min-h-dvh bg-dough text-espresso">
      <Stripes />
      <div className="relative z-10 mx-auto max-w-5xl space-y-16 px-4 py-14 sm:px-8">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-sauce">Design system</p>
          <h1 className="mt-2 font-menu text-5xl font-semibold">After-Hours Parlour</h1>
          <p className="mt-3 max-w-xl text-espresso/75">A late-70s pizza parlour ten minutes before opening. Source: docs/DESIGN_SYSTEM.md.</p>
        </header>

        <section>
          <h2 className="font-menu text-2xl font-semibold">Palette</h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {SWATCHES.map(([name, hex, role]) => (
              <li key={name} className="overflow-hidden rounded-card border-2 border-espresso bg-flour shadow-print-sm">
                <div className="h-20" style={{ background: hex }} />
                <div className="p-2.5">
                  <p className="font-mono text-xs font-semibold">{name}</p>
                  <p className="font-mono text-[11px] text-espresso/60">{hex}</p>
                  <p className="mt-1 text-[11px] leading-snug text-espresso/70">{role}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-5">
          <h2 className="font-menu text-2xl font-semibold">Type</h2>
          <div className="dark rounded-card bg-char p-6"><Wordmark name="Shrikhand — signs" className="text-5xl" /></div>
          <p className="font-menu text-4xl font-semibold">Fraunces — Margherita, Nduja &amp; Honey</p>
          <p className="font-menu text-2xl italic [font-variation-settings:'SOFT'_100,'WONK'_1]">Hand-stretched. Fire-kissed.</p>
          <p className="max-w-prose text-base">Work Sans — the readable voice. Allergen notes, checkout fields, ops tables, everything a person needs to actually read.</p>
          <p className="font-mono text-base tabular">IBM Plex Mono — ORDER #RT-0412 · KES 1,250.00 · QK7H2M9XPL</p>
        </section>

        <section className="space-y-5">
          <h2 className="font-menu text-2xl font-semibold">Controls</h2>
          <div className="flex flex-wrap items-center gap-4">
            <EnamelButton tone="sauce">Add to order</EnamelButton>
            <EnamelButton tone="crust">Pay with M-Pesa</EnamelButton>
            <EnamelButton tone="basil">Open now</EnamelButton>
            <EnamelButton tone="flour">Collection</EnamelButton>
            <EnamelButton tone="sauce" disabled>Sold out</EnamelButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-espresso/60">Ops (shadcn):</span>
            <Button>Accept</Button>
            <Button variant="outline">Print ticket</Button>
            <Button variant="secondary">Snooze</Button>
            <Button variant="ghost">Details</Button>
          </div>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-menu text-2xl font-semibold">Ticket</h2>
            <Ticket heading="Order #RT-0412" className="mt-5 max-w-xs">
              <ul className="space-y-1 text-sm">
                <li className="flex justify-between"><span>1× Margherita (L)</span><span className="tabular">1,150.00</span></li>
                <li className="flex justify-between"><span>  + basil, extra</span><span className="tabular">100.00</span></li>
              </ul>
              <p className="mt-3 flex justify-between border-t border-dashed border-espresso/40 pt-2 text-sm font-semibold">
                <span>TOTAL KES</span><span className="tabular">1,250.00</span>
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-espresso/50">Specimen. Not a real order.</p>
            </Ticket>
          </div>
          <div>
            <h2 className="font-menu text-2xl font-semibold">Kitchen status</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {(Object.keys(STATUS_STYLE) as StatusKey[]).map((s) => <StatusChip key={s} status={s} />)}
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-menu text-2xl font-semibold">Station marks &amp; oven</h2>
          <div className="mt-5 grid items-center gap-8 md:grid-cols-[1fr_1.2fr]">
            <ul className="grid grid-cols-4 gap-4">
              {STATIONS.map((s) => (
                <li key={s.id} className="flex flex-col items-center gap-1 rounded-card border-2 border-espresso bg-flour p-3">
                  <StationMark id={s.id} className="size-12" />
                  <span className="font-mono text-[10px] uppercase">{s.id}</span>
                </li>
              ))}
            </ul>
            <div className="dark rounded-card bg-char p-6"><OvenIllustration className="mx-auto max-w-xs" /></div>
          </div>
        </section>

        <section>
          <h2 className="font-menu text-2xl font-semibold">Surfaces</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="checker h-28 rounded-card border-2 border-espresso" />
            <div className="checker checker-night h-28 rounded-card border-2 border-espresso" />
            <div className="sunburst-stripes h-28 rounded-card border-2 border-espresso" />
          </div>
        </section>
      </div>
    </main>
  );
}
