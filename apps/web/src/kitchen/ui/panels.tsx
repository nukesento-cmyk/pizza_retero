"use client";

import type { ReactNode } from "react";
import { startBake } from "../actions";
import {
  CHEESES, CRUSTS, DEFAULT_BUILD, MAX_TOPPINGS, SAUCES, SIZES, TOPPINGS,
  describeBuild, isVegan, isVegetarian, type BuilderState,
} from "../builder";
import { kitchen, nav, useKitchen } from "../store";
import { STATIONS, stationIndex, type StationId } from "../stations";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export interface StorefrontData {
  brand: string;
  cities: string[];
  branchName: string | null;
  whatsapp: string | null;
  branches: { id: string; name: string; area: string | null; city: string; phone: string | null; offersDelivery: boolean; offersCollection: boolean }[];
}

/* ── shared bits ─────────────────────────────────────────────────── */

function Choice({ name, options, value, onChange, swatch }: {
  name: string;
  options: readonly { id: string; label: string; detail?: string; color?: string }[];
  value: string;
  onChange: (id: string) => void;
  swatch?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-1.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-center justify-between rounded-md border-2 px-3 py-2 text-left text-sm transition-colors",
              on ? "border-espresso bg-crust font-semibold" : "border-espresso/20 bg-flour hover:border-espresso/60",
            )}
          >
            <span className="flex items-center gap-2">
              {swatch && o.color ? <span aria-hidden className="size-3.5 rounded-full border border-espresso/40" style={{ background: o.color }} /> : null}
              {o.label}
            </span>
            {o.detail ? <span className="font-mono text-xs">{o.detail}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Next({ to, children }: { to: StationId; children: ReactNode }) {
  return (
    <button type="button" onClick={() => nav.goTo(stationIndex(to))}
      className="enamel mt-4 flex w-full items-center justify-center gap-2 bg-sauce px-4 py-2.5 font-menu text-base font-semibold text-flour [--enamel-fill:var(--color-sauce)] hover:bg-sauce-deep">
      {children} <span aria-hidden>→</span>
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-espresso/60 first:mt-0">{children}</p>;
}

function DietBadges({ b }: { b: BuilderState }) {
  return (
    <span className="flex gap-1.5">
      {isVegan(b) ? <span className="rounded bg-basil px-1.5 py-0.5 text-[10px] font-semibold uppercase text-flour">Vegan</span>
        : isVegetarian(b) ? <span className="rounded bg-basil px-1.5 py-0.5 text-[10px] font-semibold uppercase text-flour">Veg</span> : null}
    </span>
  );
}

/* ── per-station panels ──────────────────────────────────────────── */

export function StationPanel({ id, data }: { id: StationId; data: StorefrontData }) {
  const b = useKitchen((s) => s.builder);
  const bake = useKitchen((s) => s.bake);
  const st = STATIONS.find((s) => s.id === id)!;

  const header = (
    <header className="mb-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sauce">Station {String(st.n).padStart(2, "0")} / 08</p>
      <h2 className="font-menu text-2xl font-semibold leading-tight">{st.title}</h2>
      <p className="mt-1 text-sm leading-snug text-espresso/75">{st.line}</p>
    </header>
  );
  const hint = <p className="mt-3 flex items-center gap-1.5 text-xs text-espresso/60"><span aria-hidden>☝</span>{st.hint}</p>;

  switch (id) {
    case "entrance":
      return null; // the entrance has its own full-bleed overlay
    case "dough":
      return (<>{header}
        <Label>Size: pick a dough ball</Label>
        <Choice name="Size" options={SIZES} value={b.size} onChange={(v) => kitchen.build({ size: v as BuilderState["size"] })} />
        <Label>Crust</Label>
        <Choice name="Crust" options={CRUSTS} value={b.crust} onChange={(v) => kitchen.build({ crust: v as BuilderState["crust"] })} />
        {hint}<Next to="sauce">Sauce pots</Next></>);
    case "sauce":
      return (<>{header}
        <Label>Sauce</Label>
        <Choice name="Sauce" options={SAUCES} value={b.sauce} swatch onChange={(v) => kitchen.build({ sauce: v as BuilderState["sauce"] })} />
        {hint}<Next to="ingredients">The line</Next></>);
    case "ingredients":
      return (<>{header}
        <Label>Cheese</Label>
        <Choice name="Cheese" options={CHEESES.map((c) => ({ id: c.id, label: c.label }))} value={b.cheese} onChange={(v) => kitchen.build({ cheese: v as BuilderState["cheese"] })} />
        <Label>Toppings · up to {MAX_TOPPINGS}</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {TOPPINGS.map((t) => {
            const on = b.toppings.includes(t.id);
            const full = !on && b.toppings.length >= MAX_TOPPINGS;
            return (
              <button key={t.id} type="button" aria-pressed={on} disabled={full} onClick={() => kitchen.toggleTopping(t.id)}
                className={cn("flex items-center gap-2 rounded-md border-2 px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40",
                  on ? "border-espresso bg-crust font-semibold" : "border-espresso/20 bg-flour hover:border-espresso/60")}>
                <span aria-hidden className="size-3 rounded-full" style={{ background: t.color }} />{t.label}
              </button>
            );
          })}
        </div>
        {hint}<Next to="assembly">Check your pie</Next></>);
    case "assembly":
      return (<>{header}
        <BuildTicket b={b} />
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {(["dough", "sauce", "ingredients"] as const).map((s) => (
            <button key={s} type="button" onClick={() => nav.goTo(stationIndex(s))} className="rounded-full border border-espresso/40 px-2 py-0.5 hover:bg-tile">
              Change {STATIONS.find((x) => x.id === s)!.title.toLowerCase()}
            </button>
          ))}
        </div>
        {hint}<Next to="oven">Into the oven</Next></>);
    case "oven":
      return (<>{header}
        <BakeMeter />
        <button type="button" onClick={startBake} disabled={bake === "baking"}
          className="enamel mt-4 flex w-full items-center justify-center bg-crust px-4 py-2.5 font-menu text-base font-semibold text-espresso [--enamel-fill:var(--color-crust)] disabled:opacity-60">
          {bake === "baking" ? "Baking…" : bake === "baked" ? "Bake another one" : "Bake it"}
        </button>
        {hint}</>);
    case "reveal":
      return (<>{header}
        {bake !== "baked" ? (
          <p className="rounded border border-dashed border-espresso/40 p-2 text-sm">This one hasn&apos;t been baked yet. <button type="button" className="underline" onClick={() => nav.goTo(stationIndex("oven"))}>Back to the oven</button></p>
        ) : null}
        <BuildTicket b={b} />
        <figure className="mt-3 grid h-24 place-items-center rounded-md border-2 border-dashed border-espresso/30 bg-dough text-center text-[11px] leading-snug text-espresso/60">
          <figcaption className="px-4">Real photos of each menu pizza go here once the branch publishes its menu.</figcaption>
        </figure>
        <button type="button" disabled className="enamel mt-3 w-full bg-sauce px-4 py-2.5 font-menu text-base font-semibold text-flour opacity-60 [--enamel-fill:var(--color-sauce)]">
          Order online · opening soon
        </button>
        {data.whatsapp ? (
          <a className="mt-2 block rounded-md border-2 border-espresso bg-basil px-4 py-2 text-center text-sm font-semibold text-flour hover:bg-[#245742]"
            href={whatsappLink(data.whatsapp, `Hi ${data.brand}! I'd like to order: ${describeBuild(b)}.`)} target="_blank" rel="noopener noreferrer">
            Order this on WhatsApp
          </a>
        ) : null}
        <button type="button" className="mt-2 w-full text-xs underline" onClick={() => { kitchen.build(DEFAULT_BUILD); nav.goTo(stationIndex("dough")); }}>
          Start a new pie
        </button></>);
    case "story":
      return (<>{header}
        <p className="text-sm leading-relaxed">
          It started as one oven and one counter. The recipe stayed the same as the doors multiplied: 48-hour dough, tomatoes that taste like tomatoes, and an oven that never really cools down.
        </p>
        <Label>Find us</Label>
        {data.branches.length === 0 ? (
          <p className="text-sm">Our first branch is opening soon.</p>
        ) : (
          <ul className="max-h-48 space-y-1.5 overflow-auto pr-1">
            {data.branches.map((br) => (
              <li key={br.id} className="rounded-md border border-espresso/20 bg-dough px-2.5 py-1.5 text-sm">
                <span className="font-semibold">{br.name}</span> <span className="text-espresso/60">· {br.area ? `${br.area}, ` : ""}{br.city}</span>
              </li>
            ))}
          </ul>
        )}</>);
  }
}

function BuildTicket({ b }: { b: BuilderState }) {
  const size = SIZES.find((s) => s.id === b.size)!;
  return (
    <div className="ticket rounded-t-sm border border-espresso/10 px-3 pt-2.5 text-[13px]">
      <div className="flex items-center justify-between border-b border-dashed border-espresso/40 pb-1.5 text-[10px] uppercase tracking-[0.2em]">
        <span>Your pie</span><DietBadges b={b} />
      </div>
      <ul className="mt-1.5 space-y-0.5">
        <li>1× {size.label} {size.detail} · {CRUSTS.find((c) => c.id === b.crust)!.label}</li>
        <li>  {SAUCES.find((s) => s.id === b.sauce)!.label}</li>
        <li>  {CHEESES.find((c) => c.id === b.cheese)!.label}</li>
        {b.toppings.map((t) => <li key={t}>  + {TOPPINGS.find((x) => x.id === t)!.label}</li>)}
      </ul>
      <p className="mt-2 border-t border-dashed border-espresso/40 pt-1.5 text-[10px] uppercase tracking-widest text-espresso/55">
        Price confirmed by your branch at checkout
      </p>
    </div>
  );
}

function BakeMeter() {
  const bake = useKitchen((s) => s.bake);
  return (
    <div className="rounded-md border-2 border-espresso bg-char p-3 font-mono text-dough">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest">
        <span>Oven</span>
        <span className={cn(bake === "baking" ? "text-oven motion-safe:animate-pulse" : "text-crust")}>450°C</span>
      </div>
      <p aria-live="polite" className="mt-1 text-lg">
        {bake === "raw" ? "Ready when you are" : bake === "baking" ? "Blistering…" : "Done. Golden and leopard-spotted."}
      </p>
    </div>
  );
}
