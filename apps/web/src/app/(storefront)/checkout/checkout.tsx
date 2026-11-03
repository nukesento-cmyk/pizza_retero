"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kes } from "@/lib/client-money";
import { cn } from "@/lib/utils";

interface Line { itemId: string; productName: string; variantName: string; quantity: number; lineTotalMinor: number; options: { name: string; included: boolean }[]; removed: { name: string }[]; allergens: string[] }
interface CartView { reference: string | null; lines: Line[]; problems: { itemId: string; message: string }[]; subtotalMinor: number }
interface Quote { quoteId: string; subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number; totalMinor: number; vatIncludedMinor: number; etaMinutes: number; expiresAt: string }
type Branch = { id: string; name: string; offersDelivery: boolean; offersCollection: boolean; phone: string | null };

async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? "Something went wrong."), { details: data?.error?.details });
  return data as T;
}

/**
 * Checkout: cart → server quote → order (idempotent) → M-Pesa STK push.
 * Every amount shown comes from the server; nothing is computed here.
 */
export function Checkout({ branch }: { branch: Branch }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [fulfilment, setFulfilment] = useState<"collection" | "delivery">(branch.offersCollection ? "collection" : "delivery");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; quote: Quote } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", line1: "", area: "", city: "Nairobi", notes: "" });

  useEffect(() => {
    let alive = true;
    api<CartView>(`/api/cart?branch=${branch.id}`).then((c) => alive && setCart(c)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [branch.id]);
  // A quote is only valid for the inputs it was calculated from.
  const inputsKey = `${fulfilment}|${loc?.lat ?? ""},${loc?.lng ?? ""}|${cart?.subtotalMinor ?? ""}`;
  const quote = quoted?.key === inputsKey ? quoted.quote : null;

  const idemKey = useMemo(() => (quote ? `web-${quote.quoteId}` : null), [quote]);

  async function setQty(itemId: string, quantity: number) {
    setBusy("cart");
    try { setCart(await api<CartView>(`/api/cart/items/${itemId}`, { method: "PATCH", json: { branchId: branch.id, quantity } })); } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  function locate() {
    setError(null);
    if (!navigator.geolocation) return setError("Your browser can't share location. Choose collection or call the branch.");
    setBusy("locate");
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setBusy(null); },
      () => { setError("We couldn't get your location. Allow location access, or choose collection."); setBusy(null); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function getQuote() {
    setError(null); setBusy("quote");
    try {
      setQuoted({ key: inputsKey, quote: await api<Quote>("/api/checkout/quote", { method: "POST", json: { branchId: branch.id, fulfilment, ...(fulfilment === "delivery" && loc ? loc : {}) } }) });
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  async function placeAndPay(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || !idemKey) return;
    setError(null); setBusy("order");
    try {
      const order = await api<{ number: string; trackingUrl: string | null }>("/api/checkout/order", {
        method: "POST", headers: { "idempotency-key": idemKey },
        json: { branchId: branch.id, quoteId: quote.quoteId, contact: { name: form.name, phone: form.phone }, notes: form.notes || null,
          address: fulfilment === "delivery" ? { line1: form.line1, area: form.area || null, city: form.city } : null },
      });
      const url = order.trackingUrl ?? sessionStorage.getItem(`track:${order.number}`);
      if (!url) throw new Error("Order placed, but we lost the tracking link. Check your phone for the M-Pesa prompt.");
      sessionStorage.setItem(`track:${order.number}`, url);
      const t = new URL(url, location.origin).searchParams.get("t")!;
      await api(`/api/orders/${order.number}/pay`, { method: "POST", json: { t, phone: form.phone } }).catch((err) => sessionStorage.setItem(`payerr:${order.number}`, (err as Error).message));
      router.push(url as never);
    } catch (err) { setError((err as Error).message); setBusy(null); }
  }

  if (!cart) return <p className="mt-8 font-mono text-sm">Warming up the oven…</p>;
  if (!cart.lines.length && !cart.problems.length) {
    return (
      <div className="ticket mt-8 max-w-md px-5 pt-4">
        <p className="font-menu text-xl">Your tray is empty.</p>
        <a href={`/menu?branch=${branch.id}`} className="mt-3 inline-block underline">Walk back to the menu</a>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <section aria-labelledby="tray" className="ticket px-5 pt-4 shadow-[0_10px_30px_-12px_rgba(42,26,19,.45)]">
        <div className="mb-3 flex items-center justify-between border-b border-dashed border-espresso/40 pb-2 text-xs uppercase tracking-[0.2em]">
          <h2 id="tray">Tray {cart.reference ? `· ${cart.reference}` : ""}</h2><span aria-hidden>✱</span>
        </div>
        <ul className="space-y-3 text-sm">
          {cart.lines.map((l) => (
            <li key={l.itemId} className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{l.productName} <span className="font-normal">· {l.variantName}</span></p>
                {l.options.filter((o) => !o.included).length ? <p className="text-xs">+ {l.options.filter((o) => !o.included).map((o) => o.name).join(", ")}</p> : null}
                {l.removed.length ? <p className="text-xs">no {l.removed.map((r) => r.name).join(", no ")}</p> : null}
                {l.allergens.length ? <p className="text-[10px] uppercase tracking-wider text-espresso/60">Contains: {l.allergens.join(", ")}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" aria-label={`Fewer ${l.productName}`} disabled={!!busy} onClick={() => setQty(l.itemId, l.quantity - 1)} className="size-7 rounded border border-espresso/40">−</button>
                <span className="w-5 text-center tabular">{l.quantity}</span>
                <button type="button" aria-label={`More ${l.productName}`} disabled={!!busy || l.quantity >= 20} onClick={() => setQty(l.itemId, l.quantity + 1)} className="size-7 rounded border border-espresso/40">+</button>
                <span className="w-24 text-right tabular">{kes(l.lineTotalMinor)}</span>
              </div>
            </li>
          ))}
        </ul>
        {cart.problems.length ? <p role="alert" className="mt-3 text-sm text-sauce-deep">{cart.problems.length} item(s) are no longer available and will be skipped. Remove them to continue.</p> : null}
        <p className="mt-4 flex justify-between border-t border-dashed border-espresso/40 pt-2 font-semibold"><span>Subtotal</span><span className="tabular">{kes(cart.subtotalMinor)}</span></p>
      </section>

      <form onSubmit={placeAndPay} className="space-y-5" aria-describedby={error ? "checkout-error" : undefined}>
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-[0.2em]">How do you want it?</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["collection", "delivery"] as const).filter((f) => (f === "delivery" ? branch.offersDelivery : branch.offersCollection)).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={fulfilment === f} onClick={() => setFulfilment(f)}
                className={cn("enamel px-4 py-3 font-menu text-lg font-semibold", fulfilment === f ? "bg-crust text-espresso [--enamel-fill:var(--color-crust)]" : "bg-flour text-espresso [--enamel-fill:var(--color-flour)]")}>
                {f === "collection" ? "Collect" : "Deliver"}
              </button>
            ))}
          </div>
        </fieldset>

        {fulfilment === "delivery" ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium uppercase tracking-[0.2em]">Where to?</legend>
            <button type="button" onClick={locate} className="w-full rounded-md border-2 border-espresso bg-flour px-3 py-2 text-sm font-semibold">
              {busy === "locate" ? "Finding you…" : loc ? `📍 Location pinned (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})` : "📍 Use my current location"}
            </button>
            <Input label="Street / building" value={form.line1} onChange={(v) => setForm({ ...form, line1: v })} required />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Area" value={form.area} onChange={(v) => setForm({ ...form, area: v })} />
              <Input label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
            </div>
          </fieldset>
        ) : null}

        {!quote ? (
          <button type="button" onClick={getQuote} disabled={!!busy || cart.problems.length > 0 || (fulfilment === "delivery" && !loc)}
            className="enamel w-full bg-sauce px-4 py-3 font-menu text-lg font-semibold text-flour [--enamel-fill:var(--color-sauce)] disabled:opacity-50">
            {busy === "quote" ? "Checking with the kitchen…" : "Check price"}
          </button>
        ) : (
          <>
            <div className="ticket px-5 pt-4 text-sm" aria-live="polite">
              <p className="flex justify-between"><span>Subtotal</span><span className="tabular">{kes(quote.subtotalMinor)}</span></p>
              {fulfilment === "delivery" ? <p className="flex justify-between"><span>Delivery</span><span className="tabular">{quote.deliveryFeeMinor ? kes(quote.deliveryFeeMinor) : "Free"}</span></p> : null}
              <p className="mt-2 flex justify-between border-t border-dashed border-espresso/40 pt-2 text-base font-semibold"><span>Total</span><span className="tabular">{kes(quote.totalMinor)}</span></p>
              <p className="text-[10px] uppercase tracking-widest text-espresso/55">Includes VAT {kes(quote.vatIncludedMinor)} · ready in ~{quote.etaMinutes} min</p>
            </div>
            <Input label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required autoComplete="name" />
            <Input label="M-Pesa phone number" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required inputMode="tel" autoComplete="tel" placeholder="0712 345 678" />
            <Input label="Note for the kitchen (optional)" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
            <button type="submit" disabled={!!busy} className="enamel w-full bg-basil px-4 py-3 font-menu text-lg font-semibold text-flour [--enamel-fill:var(--color-basil)] disabled:opacity-60">
              {busy === "order" ? "Sending M-Pesa prompt…" : `Pay ${kes(quote.totalMinor)} with M-Pesa`}
            </button>
            <p className="text-xs text-espresso/60">You&apos;ll get an M-Pesa prompt on your phone. Enter your PIN to confirm. We only start cooking once Safaricom confirms the payment.</p>
          </>
        )}
        {error ? <p id="checkout-error" role="alert" className="rounded-md border-2 border-sauce bg-sauce/10 p-3 text-sm text-sauce-deep">{error}</p> : null}
      </form>
    </div>
  );
}

function Input({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block text-xs font-medium uppercase tracking-[0.15em]">
      {label}
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-md border-2 border-espresso bg-flour px-3 py-2.5 font-sans text-base normal-case tracking-normal focus:border-sauce focus:outline-none" />
    </label>
  );
}
