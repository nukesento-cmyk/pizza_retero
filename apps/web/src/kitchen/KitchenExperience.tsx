"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Quality } from "./scene/KitchenCanvas";
import { kitchen, nav, runtime, useKitchen } from "./store";
import { STATION_COUNT, STATIONS } from "./stations";
import { StationPanel, type StorefrontData } from "./ui/panels";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP);

const KitchenCanvas = dynamic(() => import("./scene/KitchenCanvas"), { ssr: false });

type Mode = "checking" | "3d" | "simple";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function readPref(): string | null {
  try { return localStorage.getItem("retero:view"); } catch { return null; }
}
function writePref(v: string) {
  try { localStorage.setItem("retero:view", v); } catch { /* storage unavailable: preference just won't persist */ }
}

/**
 * The storefront as a walk-through kitchen.
 *
 *  scroll ──► ScrollTrigger ──► runtime.progress ──► CameraRig / Pizza (useFrame)
 *                         └──► kitchen.active    ──► DOM panels (React)
 *
 * `fallback` is the 2D storefront, used when WebGL is unavailable or the
 * visitor chooses the simple view.
 */
export function KitchenExperience({ data, fallback }: { data: StorefrontData; fallback: ReactNode }) {
  const [mode, setMode] = useState<Mode>("checking");
  const [quality, setQuality] = useState<Quality>("high");
  const [ready, setReady] = useState(false);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    runtime.reducedMotion = reduced;
  }, [reduced]);

  useLayoutEffect(() => {
    const low = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
    // Capability detection can only run in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuality(low ? "low" : "high");
    setMode(!hasWebGL() || readPref() === "simple" ? "simple" : "3d");
  }, []);

  const toSimple = () => { writePref("simple"); setMode("simple"); };
  const to3d = () => { writePref("3d"); setMode("3d"); };

  if (mode === "simple") {
    return (
      <>
        {hasWebGLSafe() ? (
          <button type="button" onClick={to3d} className="fixed bottom-4 right-4 z-50 rounded-full border-2 border-espresso bg-crust px-4 py-2 font-mono text-xs uppercase tracking-wider text-espresso shadow-print">
            Walk through the kitchen
          </button>
        ) : null}
        {fallback}
      </>
    );
  }

  return (
    <div className="relative bg-char text-dough">
      <div className="fixed inset-0" aria-hidden>
        {mode === "3d" ? <KitchenCanvas brand={data.brand} initialQuality={quality} onReady={() => setTimeout(() => setReady(true), 400)} /> : null}
      </div>
      <Loader done={ready} />
      <ScrollTrack />
      <Chrome data={data} onSimple={toSimple} />
    </div>
  );
}

function hasWebGLSafe() {
  return typeof document !== "undefined" && hasWebGL();
}

/* ── scroll track: one viewport of scroll per station ───────────────── */

function ScrollTrack() {
  const track = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const n = STATION_COUNT;
    const st = ScrollTrigger.create({
      trigger: track.current,
      start: "top top",
      end: "bottom bottom",
      snap: runtime.reducedMotion
        ? { snapTo: 1 / (n - 1), duration: 0, delay: 0.05 }
        : { snapTo: 1 / (n - 1), duration: { min: 0.35, max: 0.9 }, delay: 0.08, ease: "power2.inOut" },
      onUpdate: (self) => {
        runtime.progress = self.progress * (n - 1);
        const active = Math.round(runtime.progress);
        if (active !== kitchen.get().active) kitchen.set({ active });
      },
    });

    nav.goTo = (i: number) => {
      const idx = Math.max(0, Math.min(n - 1, i));
      const y = st.start + ((st.end - st.start) * idx) / (n - 1);
      const dist = Math.abs(idx - kitchen.get().active);
      gsap.to(window, {
        scrollTo: { y, autoKill: true },
        duration: runtime.reducedMotion ? 0 : Math.min(2.4, 0.7 + dist * 0.35),
        ease: "power2.inOut",
        overwrite: true,
      });
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [role=radiogroup]")) return;
      const a = kitchen.get().active;
      const map: Record<string, number> = { ArrowDown: a + 1, ArrowRight: a + 1, PageDown: a + 1, ArrowUp: a - 1, ArrowLeft: a - 1, PageUp: a - 1, Home: 0, End: n - 1 };
      const to = map[e.key];
      if (to === undefined) return;
      e.preventDefault();
      nav.goTo(to);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      nav.goTo = () => {};
    };
  }, { scope: track });

  return (
    <div ref={track} aria-hidden style={{ height: `${STATION_COUNT * 100}svh` }}>
      {STATIONS.map((s) => <div key={s.id} className="h-svh" />)}
    </div>
  );
}

/* ── fixed UI layered over the scene ────────────────────────────────── */

function Chrome({ data, onSimple }: { data: StorefrontData; onSimple: () => void }) {
  const active = useKitchen((s) => s.active);
  const st = STATIONS[active]!;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* top bar */}
      <header className="pointer-events-auto flex items-center justify-between gap-3 bg-gradient-to-b from-char/80 to-transparent px-4 py-3 sm:px-6">
        <button type="button" onClick={() => nav.goTo(0)} className="font-display text-xl text-crust sm:text-2xl">{data.brand}</button>
        <nav aria-label="Site" className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
          <button type="button" onClick={onSimple} className="rounded-full px-2 py-1 text-dough/75 hover:text-crust">Simple view</button>
          <Link href="/sign-in" className="rounded-full border border-dough/30 px-3 py-1 hover:border-crust hover:text-crust">Staff</Link>
        </nav>
      </header>

      <StationRail active={active} />

      <p className="sr-only" aria-live="polite">Station {st.n} of {STATION_COUNT}: {st.title}</p>

      <AnimatePresence mode="wait">
        {active === 0 ? <Entrance key="entrance" data={data} /> : <FloatingPanel key={st.id} index={active} data={data} />}
      </AnimatePresence>
    </div>
  );
}

function StationRail({ active }: { active: number }) {
  return (
    <>
      {/* desktop: vertical rail */}
      <nav aria-label="Kitchen stations" className="pointer-events-auto fixed left-4 top-1/2 hidden -translate-y-1/2 md:block">
        <ol className="space-y-1.5">
          {STATIONS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button" onClick={() => nav.goTo(i)} aria-current={i === active ? "step" : undefined}
                className="group flex items-center gap-2.5 rounded-full py-0.5 pr-2 text-left"
              >
                <span className={cn(
                  "grid size-7 place-items-center rounded-full border-2 font-mono text-[11px] transition-all duration-200",
                  i === active ? "scale-110 border-crust bg-sauce text-flour shadow-[0_0_16px_rgba(240,106,46,.6)]" : i < active ? "border-crust/70 bg-espresso text-crust" : "border-dough/40 bg-char/70 text-dough/70 group-hover:border-crust",
                )}>{s.n}</span>
                <span className={cn(
                  "whitespace-nowrap font-menu text-sm transition-opacity duration-200",
                  i === active ? "opacity-100 text-dough" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 text-dough/80",
                )}>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {/* mobile: compact stepper */}
      <nav aria-label="Kitchen stations" className="pointer-events-auto fixed inset-x-0 top-14 flex items-center justify-center gap-3 md:hidden">
        <button type="button" aria-label="Previous station" onClick={() => nav.goTo(active - 1)} disabled={active === 0} className="grid size-8 place-items-center rounded-full border border-dough/30 bg-char/70 disabled:opacity-30">‹</button>
        <span className="rounded-full bg-char/70 px-3 py-1 font-mono text-[11px] uppercase tracking-wider">
          {String(active + 1).padStart(2, "0")}/08 · {STATIONS[active]!.title}
        </span>
        <button type="button" aria-label="Next station" onClick={() => nav.goTo(active + 1)} disabled={active === STATION_COUNT - 1} className="grid size-8 place-items-center rounded-full border border-dough/30 bg-char/70 disabled:opacity-30">›</button>
      </nav>
    </>
  );
}

function Entrance({ data }: { data: StorefrontData }) {
  return (
    <motion.section
      aria-labelledby="entrance-title"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-8 pt-24 sm:pb-12 sm:pl-14 md:pl-20 bg-gradient-to-t from-char via-char/70 to-transparent"
    >
      <div className="pointer-events-auto max-w-md">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-crust">
        {data.cities.length ? data.cities.join(" · ") : "Now preheating"}{data.branchName ? ` · ${data.branchName}` : ""}
      </p>
      <h1 id="entrance-title" className="mt-2 font-menu text-4xl font-semibold leading-[1.05] text-dough sm:text-5xl">
        Come in. <span className="font-display text-sauce [text-shadow:0_0_24px_rgba(200,64,43,.55)]">The oven&apos;s on.</span>
      </h1>
      <p className="mt-3 max-w-sm text-dough/80">
        Walk the kitchen from dough to fire and build your pie at each station.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => nav.goTo(1)}
          className="enamel bg-sauce px-5 py-2.5 font-menu text-lg font-semibold text-flour [--enamel-fill:var(--color-sauce)] hover:bg-sauce-deep">
          Start building
        </button>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dough/60">
          <span aria-hidden className="relative h-7 w-4 rounded-full border-2 border-dough/50">
            <span className="absolute left-1/2 top-1 h-1.5 w-0.5 -translate-x-1/2 rounded bg-crust motion-safe:animate-bounce" />
          </span>
          Scroll, or click a tag
        </span>
      </div>
      </div>
    </motion.section>
  );
}

/**
 * Contextual panel that hangs beside its station in the scene (desktop),
 * tracking the projected 3D anchor with a leader line. On phones it docks
 * as a bottom sheet so the kitchen stays visible above it.
 */
function FloatingPanel({ index, data }: { index: number; data: StorefrontData }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const [desktop, setDesktop] = useState(false);
  const st = STATIONS[index]!;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 821px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const place = useCallback(() => {
    const el = box.current;
    if (!el || !desktop) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const a = runtime.anchor;
    // Panels live in the right-hand column so they never cover the station;
    // the leader line ties them to their anchor in the scene.
    const x = vw - w - 24;
    const y = Math.min(vh - h - 20, Math.max(72, a.y - h * 0.35));
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const ax = Math.min(vw, Math.max(0, a.x)), ay = Math.min(vh, Math.max(0, a.y));
    if (line.current) {
      line.current.setAttribute("x1", String(ax));
      line.current.setAttribute("y1", String(ay));
      line.current.setAttribute("x2", String(x));
      line.current.setAttribute("y2", String(y + Math.min(h - 20, Math.max(20, ay - y))));
      line.current.style.opacity = a.visible ? "1" : "0";
    }
    if (dot.current) dot.current.style.transform = `translate3d(${ax - 6}px, ${ay - 6}px, 0)`;
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let raf = 0;
    const loop = () => { place(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [desktop, place]);

  const panel = (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -6 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className="rounded-card border-[3px] border-espresso bg-flour p-4 text-espresso shadow-[6px_6px_0_#15100c,0_24px_60px_-20px_rgba(240,106,46,.45)]"
    >
      <StationPanel id={st.id} data={data} />
    </motion.div>
  );

  if (!desktop) {
    return (
      <section aria-label={st.title} className="pointer-events-auto absolute inset-x-0 bottom-0 max-h-[44svh] overflow-y-auto px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {panel}
      </section>
    );
  }

  return (
    <>
      <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
        <line ref={line} stroke="#e7a33e" strokeWidth="2" strokeDasharray="4 5" className="transition-opacity duration-300" />
      </svg>
      <span ref={dot} aria-hidden className="absolute left-0 top-0 block size-3 rounded-full border-2 border-espresso bg-crust shadow-[0_0_12px_rgba(231,163,62,.9)]" />
      <section ref={box} aria-label={st.title} className="pointer-events-auto absolute left-0 top-0 w-[340px] will-change-transform">
        {panel}
      </section>
    </>
  );
}

function Loader({ done }: { done: boolean }) {
  return (
    <AnimatePresence>
      {!done ? (
        <motion.div
          key="loader" role="status" aria-label="Loading the kitchen"
          initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}
          className="fixed inset-0 z-40 grid place-items-center bg-char"
        >
          <div className="text-center">
            <p className="neon-sign font-display text-5xl motion-safe:animate-flicker">Lighting the oven</p>
            <div className="mx-auto mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-espresso">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-sauce via-oven to-crust motion-safe:animate-[loader_1.2s_ease-in-out_infinite]" />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
