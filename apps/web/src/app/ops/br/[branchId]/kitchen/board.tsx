"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { boardToggleItem, boardTransition } from "@/app/ops/ops-actions";
import { StatusChip } from "@/components/ops/status-chip";
import { cn } from "@/lib/utils";

interface Ticket {
  id: string; orderId: string; number: string; status: "NEW" | "ACCEPTED" | "PREPARING" | "BAKING" | "READY" | "COMPLETED" | "CANCELLED";
  fulfilment: "delivery" | "collection"; channel: string; createdAt: string; etaMinutes: number | null; notes: string | null; customer: string;
  items: { id: string; name: string; detail: string | null; quantity: number; allergens: string[]; done: boolean }[];
}

const COLUMNS = [
  { status: "NEW", next: "accepted", action: "Accept" },
  { status: "ACCEPTED", next: "preparing", action: "Start" },
  { status: "PREPARING", next: "baking", action: "Into oven" },
  { status: "BAKING", next: "ready", action: "Ready" },
  { status: "READY", next: null, action: null },
] as const;

/**
 * Ticket rail. Polls every 4s; new tickets chime (toggleable). Timers use the
 * server clock offset so a skewed tablet clock can't mislead the line.
 */
export function KitchenBoard({ branchId }: { branchId: string; canCancel: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [chime, setChime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ops/kitchen/${branchId}`, { cache: "no-store" });
    if (!res.ok) return setError("Lost connection to the board. Retrying…");
    const data = (await res.json()) as { now: string; tickets: Ticket[] };
    setError(null);
    setOffset(new Date(data.now).getTime() - Date.now());
    if (seen.current && chime && data.tickets.some((t) => t.status === "NEW" && !seen.current!.has(t.id))) ding();
    seen.current = new Set(data.tickets.map((t) => t.id));
    setTickets(data.tickets);
  }, [branchId, chime]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(clock); };
  }, [load]);

  async function advance(t: Ticket, to: string) {
    setBusy(t.id);
    const r = await boardTransition(t.orderId, to);
    if (r && !r.ok) setError(r.message);
    await load();
    setBusy(null);
  }
  async function toggle(itemId: string) {
    await boardToggleItem(itemId);
    await load();
  }

  const elapsed = (iso: string) => {
    const s = Math.max(0, Math.floor((now + offset - new Date(iso).getTime()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const late = (t: Ticket) => (now + offset - new Date(t.createdAt).getTime()) / 60000 > (t.etaMinutes ?? 20) * 0.75;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={chime} onChange={(e) => setChime(e.target.checked)} /> Chime on new tickets</label>
        <span className="text-muted-foreground">{tickets.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED").length} open</span>
        {error ? <span role="alert" className="text-destructive">{error}</span> : null}
      </div>
      <div className="grid gap-3 overflow-x-auto md:grid-cols-5" aria-live="polite">
        {COLUMNS.map((col) => {
          const list = tickets.filter((t) => t.status === col.status);
          return (
            <section key={col.status} aria-label={`${col.status} tickets`} className="min-w-[220px] rounded-lg bg-muted/50 p-2">
              <h2 className="mb-2 flex items-center justify-between px-1"><StatusChip status={col.status} /><span className="font-mono text-xs">{list.length}</span></h2>
              <ul className="space-y-2">
                {list.map((t) => (
                  <li key={t.id} className={cn("rounded-md border bg-card p-2.5 shadow-sm", late(t) && col.status !== "READY" && "border-sauce")}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-base font-semibold">{t.number}</span>
                      <span className={cn("font-mono text-sm tabular", late(t) && "text-sauce font-semibold")} aria-label="Time since ticket">{elapsed(t.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.customer} · {t.fulfilment === "delivery" ? "Delivery" : "Collect"}{t.channel !== "web" ? ` · ${t.channel}` : ""}</p>
                    <ul className="mt-2 space-y-1">
                      {t.items.map((i) => (
                        <li key={i.id}>
                          <button type="button" onClick={() => toggle(i.id)} aria-pressed={i.done} className={cn("w-full rounded px-1 py-0.5 text-left text-sm hover:bg-muted", i.done && "text-muted-foreground line-through")}>
                            <span className="font-semibold">{i.quantity}×</span> {i.name}
                            {i.detail ? <span className="block text-xs">{i.detail}</span> : null}
                            {i.allergens.length ? <span className="block text-[10px] font-medium uppercase text-sauce-deep">⚠ {i.allergens.join(", ")}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {t.notes ? <p className="mt-1 rounded bg-crust/20 px-1.5 py-1 text-xs">“{t.notes}”</p> : null}
                    {col.next ? (
                      <button type="button" disabled={busy === t.id} onClick={() => advance(t, col.next!)}
                        className="mt-2 h-9 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-sauce-deep disabled:opacity-50">
                        {busy === t.id ? "…" : col.action}
                      </button>
                    ) : <p className="mt-2 text-center text-xs text-muted-foreground">{t.fulfilment === "delivery" ? "Waiting for rider" : "Waiting at the counter"}</p>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ding() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
  } catch { /* audio unavailable */ }
}
