"use client";

import { useState } from "react";
import Link from "next/link";
import type { catalogue } from "@retero/core";
import { assistedAddAction, assistedPlaceAction, assistedViewAction, openAssistedAction } from "@/app/ops/ops-actions";
import { kes } from "@/lib/client-money";
import { inputCls } from "@/components/ops/kit";

type Menu = catalogue.SerializedMenu;
interface View { reference: string; lines: { itemId: string; productName: string; variantName: string; quantity: number; lineTotalMinor: number; options: { name: string; included: boolean }[] }[]; problems: { message: string }[]; subtotalMinor: number }

export function Assisted({ branchId, menu, initialRef, offersDelivery }: { branchId: string; menu: Menu; initialRef: string; offersDelivery: boolean }) {
  const [ref, setRef] = useState(initialRef);
  const [cartId, setCartId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; orderId: string } | null>(null);
  const [pick, setPick] = useState({ productId: "", variantId: "", optionIds: [] as string[], quantity: 1 });
  const [cust, setCust] = useState({ name: "", phone: "", fulfilment: "collection" as "collection" | "delivery", line1: "", city: "Nairobi", lat: "", lng: "" });

  const product = menu.products.find((p) => p.id === pick.productId);
  const refresh = async (id: string) => { const r = await assistedViewAction(id); if (r.ok) setView(r.view as View); else setMsg(r.message); };

  async function open(withRef: boolean) {
    setMsg(null); setDone(null);
    const r = await openAssistedAction(branchId, withRef ? ref.trim() : null);
    if (!r.ok) return setMsg(r.message);
    setCartId(r.cartId); await refresh(r.cartId);
  }
  async function add() {
    if (!cartId || !product) return;
    const r = await assistedAddAction(cartId, { productId: product.id, variantId: pick.variantId || product.variants.find((v) => v.isDefault)?.id || product.variants[0]!.id, optionIds: pick.optionIds.length ? [...product.defaultOptionIds.filter((d) => !product.groups.some((g) => menu.groups[g.groupId]?.kind === "topping" && menu.options[d]?.groupId === g.groupId)), ...pick.optionIds] : null, quantity: pick.quantity });
    if (!r.ok) setMsg(r.message); else { setMsg(null); setPick({ productId: "", variantId: "", optionIds: [], quantity: 1 }); await refresh(cartId); }
  }
  async function place() {
    if (!cartId) return;
    const r = await assistedPlaceAction({
      cartId, fulfilment: cust.fulfilment, contact: { name: cust.name, phone: cust.phone },
      ...(cust.fulfilment === "delivery" ? { address: { line1: cust.line1, city: cust.city }, lat: Number(cust.lat), lng: Number(cust.lng) } : {}),
    });
    setMsg(r.message);
    if (r.ok) setDone({ number: r.number, orderId: r.orderId });
  }

  if (done) return (
    <div className="max-w-lg rounded-lg border border-basil/40 bg-basil/10 p-4">
      <p className="text-sm">{msg}</p>
      <div className="mt-3 flex gap-2">
        <Link href={`/ops/br/${branchId}/orders/${done.orderId}`} className="rounded-md border px-3 py-1.5 text-sm">Open order {done.number}</Link>
        <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => { setCartId(null); setView(null); setDone(null); setRef(""); setMsg(null); }}>Next customer</button>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {!cartId ? (
          <div className="rounded-lg border p-4">
            <label className="block text-sm font-medium">Cart reference from WhatsApp
              <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="K7M2QX" className={`${inputCls} mt-1 font-mono uppercase`} />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={ref.trim().length < 6} onClick={() => open(true)} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Open cart</button>
              <button type="button" onClick={() => open(false)} className="h-9 rounded-md border px-3 text-sm">New phone order</button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <h2 className="mb-2 text-sm font-semibold">Add an item</h2>
            <select aria-label="Product" value={pick.productId} onChange={(e) => setPick({ productId: e.target.value, variantId: "", optionIds: [], quantity: 1 })} className={inputCls}>
              <option value="">Choose…</option>
              {menu.products.filter((p) => p.available).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {product ? (
              <div className="mt-2 space-y-2">
                <select aria-label="Size" value={pick.variantId} onChange={(e) => setPick({ ...pick, variantId: e.target.value })} className={inputCls}>
                  {product.variants.map((v) => <option key={v.id} value={v.id}>{v.name} · {kes(v.priceMinor)}</option>)}
                </select>
                {product.groups.map((g) => menu.groups[g.groupId]).filter((g) => g?.kind === "topping").map((g) => (
                  <fieldset key={g!.id} className="text-sm"><legend className="font-medium">Extra {g!.name.toLowerCase()}</legend>
                    <div className="flex flex-wrap gap-x-3">{g!.options.filter((o) => o.available).map((o) => (
                      <label key={o.id} className="flex items-center gap-1"><input type="checkbox" checked={pick.optionIds.includes(o.id)} onChange={(e) => setPick({ ...pick, optionIds: e.target.checked ? [...pick.optionIds, o.id] : pick.optionIds.filter((x) => x !== o.id) })} />{o.name}</label>
                    ))}</div>
                  </fieldset>
                ))}
                <div className="flex items-center gap-2">
                  <input aria-label="Quantity" type="number" min={1} max={20} value={pick.quantity} onChange={(e) => setPick({ ...pick, quantity: Number(e.target.value) })} className={`${inputCls} w-20`} />
                  <button type="button" onClick={add} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Add to cart</button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        {msg ? <p role="alert" className="text-sm">{msg}</p> : null}
      </div>

      {view ? (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h2 className="mb-2 flex justify-between text-sm font-semibold"><span>Cart</span><span className="font-mono">{view.reference}</span></h2>
            <ul className="space-y-1 text-sm">{view.lines.map((l) => <li key={l.itemId} className="flex justify-between"><span>{l.quantity}× {l.productName} · {l.variantName}{l.options.filter((o) => !o.included).length ? ` + ${l.options.filter((o) => !o.included).map((o) => o.name).join(", ")}` : ""}</span><span className="font-mono">{kes(l.lineTotalMinor)}</span></li>)}</ul>
            {view.problems.length ? <p className="mt-2 text-xs text-destructive">{view.problems.length} item(s) no longer available.</p> : null}
            <p className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Subtotal</span><span className="font-mono">{kes(view.subtotalMinor)}</span></p>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Customer</h2>
            <input aria-label="Customer name" placeholder="Name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} className={inputCls} />
            <input aria-label="Customer M-Pesa phone" placeholder="M-Pesa phone" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} className={inputCls} />
            <select aria-label="Fulfilment" value={cust.fulfilment} onChange={(e) => setCust({ ...cust, fulfilment: e.target.value as "collection" | "delivery" })} className={inputCls}>
              <option value="collection">Collection</option>{offersDelivery ? <option value="delivery">Delivery</option> : null}
            </select>
            {cust.fulfilment === "delivery" ? (
              <>
                <input aria-label="Address" placeholder="Street / building" value={cust.line1} onChange={(e) => setCust({ ...cust, line1: e.target.value })} className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Latitude" placeholder="Lat (from shared location)" value={cust.lat} onChange={(e) => setCust({ ...cust, lat: e.target.value })} className={inputCls} />
                  <input aria-label="Longitude" placeholder="Lng" value={cust.lng} onChange={(e) => setCust({ ...cust, lng: e.target.value })} className={inputCls} />
                </div>
              </>
            ) : null}
            <button type="button" disabled={!view.lines.length || !cust.name || !cust.phone} onClick={place} className="h-10 w-full rounded-md bg-basil font-semibold text-flour disabled:opacity-50">Place order & send M-Pesa prompt</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
