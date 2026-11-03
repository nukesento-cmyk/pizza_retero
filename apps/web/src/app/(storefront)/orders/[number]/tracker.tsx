"use client";

import { useEffect, useState } from "react";
import { kes } from "@/lib/client-money";
import { cn } from "@/lib/utils";

interface View {
  number: string; status: string; paymentStatus: string; fulfilment: "delivery" | "collection"; totalMinor: number; etaMinutes: number | null;
  firstName: string; branch: { name: string; phone: string | null } | null; paymentDueAt: string;
  items: { name: string; variant: string; quantity: number; lineTotalMinor: number; options: string[]; removed: string[] }[];
  timeline: { status: string; at: string }[];
}

const STEPS: Record<"delivery" | "collection", { key: string; label: string }[]> = {
  delivery: [{ key: "new", label: "Paid" }, { key: "accepted", label: "Accepted" }, { key: "preparing", label: "On the bench" }, { key: "baking", label: "In the oven" }, { key: "ready", label: "Out of the fire" }, { key: "out_for_delivery", label: "On the way" }, { key: "delivered", label: "Delivered" }],
  collection: [{ key: "new", label: "Paid" }, { key: "accepted", label: "Accepted" }, { key: "preparing", label: "On the bench" }, { key: "baking", label: "In the oven" }, { key: "ready", label: "Ready to collect" }, { key: "collected", label: "Collected" }],
};

/** Live order tracking: polls the server every few seconds. Payment state comes only from the server. */
export function Tracker({ number, token }: { number: string; token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  // A payment-initiation error from checkout is handed over once via sessionStorage.
  const [payMsg, setPayMsg] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const m = sessionStorage.getItem(`payerr:${number}`);
      sessionStorage.removeItem(`payerr:${number}`);
      return m;
    } catch { return null; }
  });

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/orders/${number}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (stop) return;
      if (!res.ok) setError(data?.error?.message ?? "We couldn't find that order.");
      else { setView(data); setError(null); }
    };
    void tick();
    const id = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [number, token]);

  async function retry(e: React.FormEvent) {
    e.preventDefault();
    setPayMsg("Sending a new M-Pesa prompt…");
    const res = await fetch(`/api/orders/${number}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, phone }) });
    const data = await res.json().catch(() => ({}));
    setPayMsg(res.ok ? data.message : data?.error?.message ?? "Couldn't send the prompt.");
  }

  if (error) return <p role="alert" className="font-menu text-xl">{error}</p>;
  if (!view) return <p className="font-mono text-sm">Finding your order…</p>;

  const steps = STEPS[view.fulfilment];
  const reached = new Set(view.timeline.map((t) => t.status));
  const current = steps.findIndex((s) => s.key === view.status);

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-crust">{view.branch?.name}</p>
      <h1 className="mt-1 font-menu text-4xl font-semibold">Order <span className="font-mono">{view.number}</span></h1>
      <p className="mt-1 text-dough/75">Thanks, {view.firstName}.</p>

      {view.status === "pending_payment" ? (
        <div role="status" aria-live="polite" className="mt-6 rounded-card border-2 border-crust bg-espresso p-5">
          <p className="neon-sign font-display text-3xl motion-safe:animate-flicker">Check your phone</p>
          <p className="mt-2 text-sm">Enter your M-Pesa PIN to pay <strong>{kes(view.totalMinor)}</strong>. This page updates by itself once Safaricom confirms.</p>
          {payMsg ? <p className="mt-2 text-sm text-crust">{payMsg}</p> : null}
          <form onSubmit={retry} className="mt-4 flex gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="0712 345 678" aria-label="M-Pesa phone number" className="min-w-0 flex-1 rounded-md border-2 border-dough/40 bg-char px-3 py-2" />
            <button className="rounded-md border-2 border-crust bg-crust px-3 py-2 font-semibold text-espresso">Resend prompt</button>
          </form>
        </div>
      ) : view.status === "cancelled" ? (
        <div role="status" className="mt-6 rounded-card border-2 border-sauce bg-espresso p-5">
          <p className="font-display text-3xl text-sauce">Cancelled</p>
          <p className="mt-2 text-sm">{view.paymentStatus === "paid" || view.paymentStatus === "refunded" ? "Your payment will be refunded." : "No payment was taken."}</p>
        </div>
      ) : (
        <ol aria-label="Order progress" className="mt-8 space-y-3">
          {steps.map((s, i) => {
            const done = reached.has(s.key) || i < current;
            const now = i === current;
            return (
              <li key={s.key} aria-current={now ? "step" : undefined} className="flex items-center gap-3">
                <span className={cn("grid size-8 place-items-center rounded-full border-2 font-mono text-xs", now ? "border-crust bg-sauce text-flour shadow-[0_0_16px_rgba(240,106,46,.6)] motion-safe:animate-pulse" : done ? "border-crust bg-espresso text-crust" : "border-dough/30 text-dough/40")}>{done && !now ? "✓" : i + 1}</span>
                <span className={cn("font-menu text-lg", now ? "text-dough" : done ? "text-dough/80" : "text-dough/40")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="ticket mt-8 px-5 pt-4 text-espresso">
        <div className="mb-2 flex justify-between border-b border-dashed border-espresso/40 pb-1.5 text-[10px] uppercase tracking-[0.2em]"><span>{view.fulfilment}</span><span>~{view.etaMinutes ?? 20} min</span></div>
        <ul className="space-y-1 text-sm">
          {view.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2"><span>{i.quantity}× {i.name} · {i.variant}{i.options.length ? ` + ${i.options.join(", ")}` : ""}</span><span className="tabular">{kes(i.lineTotalMinor)}</span></li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-dashed border-espresso/40 pt-1.5 font-semibold"><span>Total</span><span className="tabular">{kes(view.totalMinor)}</span></p>
      </div>
      {view.branch?.phone ? <p className="mt-6 text-sm text-dough/70">Questions? Call {view.branch.name}: <a className="underline" href={`tel:${view.branch.phone}`}>{view.branch.phone}</a></p> : null}
    </>
  );
}
