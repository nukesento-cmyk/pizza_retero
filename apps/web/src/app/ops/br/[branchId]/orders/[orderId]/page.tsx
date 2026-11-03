import { notFound } from "next/navigation";
import { and, asc, eq, schema } from "@retero/db";
import { orders as orderFlow, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { PageHeader, Panel, Section, SelectInput, Table, TextInput } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { fmt } from "@/lib/money";
import { approveRefundAction, requestRefundAction } from "../../../../commerce-actions";
import { transitionAction } from "../../../../ops-actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ branchId: string; orderId: string }> }) {
  const { branchId, orderId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/orders/${orderId}`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  const d = await readAs(s, async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.branchId, branchId)));
    if (!order) return null;
    const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
    return {
      order, payment,
      items: await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)),
      history: await tx.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, orderId)).orderBy(asc(schema.orderStatusHistory.at)),
      attempts: payment ? await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.paymentId, payment.id)).orderBy(asc(schema.paymentAttempts.requestedAt)) : [],
      refunds: await tx.select().from(schema.refunds).where(eq(schema.refunds.orderId, orderId)).orderBy(asc(schema.refunds.createdAt)),
    };
  });
  if (!d) notFound();
  const { order: o } = d;
  const tz = { timeZone: b.timezone } as const;
  const canManage = rbac.can(s.actor, "order.manage", scope);
  const canRefund = rbac.can(s.actor, "order.refund", scope);
  return (
    <>
      <PageHeader title={`Order ${o.number}`} kicker="Branch">
        {o.channel} · {o.fulfilment} · placed {o.placedAt.toLocaleString("en-KE", tz)} · <strong className="uppercase">{o.status.replace(/_/g, " ")}</strong>
      </PageHeader>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <div className="mb-6 flex flex-wrap gap-2">
        {orderFlow.nextStatuses(o.status, o.fulfilment).filter((e) => e.permission !== "system" && rbac.can(s.actor, e.permission as rbac.Permission, scope) && e.to !== "out_for_delivery").map((e) => (
          e.to === "cancelled" ? (
            <ActionForm key={e.to} action={transitionAction} className="flex items-end gap-2 space-y-0">
              <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="to" value="cancelled" />
              <Field label="Cancel reason" name="reason"><TextInput name="reason" required className="w-56" /></Field>
              <Submit variant="danger">Cancel order</Submit>
            </ActionForm>
          ) : (
            <ActionForm key={e.to} action={transitionAction} className="space-y-0">
              <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="to" value={e.to} />
              <Submit>{`Mark ${e.to.replace(/_/g, " ")}`}</Submit>
            </ActionForm>
          )
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <Section title="Items">
            <Table head={["Item", "Qty", "Each", "Line"]}>
              {d.items.map((i) => (
                <tr key={i.id}>
                  <td><div className="font-medium">{i.productName} · {i.variantName}</div>
                    <div className="text-xs text-muted-foreground">{i.options.filter((x) => !x.included).map((x) => `+ ${x.name}`).join(", ")}{i.removed.length ? ` · no ${i.removed.map((r) => r.name).join(", ")}` : ""}</div>
                    {i.allergens.length ? <div className="text-[10px] uppercase text-muted-foreground">Allergens: {i.allergens.join(", ")}</div> : null}
                  </td>
                  <td>{i.quantity}</td><td className="font-mono text-xs">{fmt(i.unitPriceMinor)}</td><td className="font-mono text-xs">{fmt(i.lineTotalMinor)}</td>
                </tr>
              ))}
            </Table>
            <dl className="mt-3 grid max-w-xs grid-cols-2 gap-1 text-sm">
              <dt>Subtotal</dt><dd className="text-right font-mono">{fmt(o.subtotalMinor)}</dd>
              <dt>Delivery</dt><dd className="text-right font-mono">{fmt(o.deliveryFeeMinor)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-mono font-semibold">{fmt(o.totalMinor)}</dd>
              <dt className="text-xs text-muted-foreground">VAT included</dt><dd className="text-right font-mono text-xs text-muted-foreground">{fmt(o.vatIncludedMinor)}</dd>
            </dl>
          </Section>
          <Section title="Timeline">
            <ol className="space-y-1 text-sm">{d.history.map((h) => <li key={h.id} className="flex gap-3"><span className="w-36 font-mono text-xs">{h.at.toLocaleString("en-KE", tz)}</span><span className="uppercase">{h.toStatus.replace(/_/g, " ")}</span>{h.reason ? <span className="text-muted-foreground">· {h.reason}</span> : null}</li>)}</ol>
          </Section>
        </div>
        <div>
          <Panel className="mb-6 text-sm">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider">Customer</h2>
            <p>{o.contactName} · <a className="underline" href={`tel:${o.contactPhone}`}>{o.contactPhone}</a></p>
            {o.deliveryAddress ? <p className="mt-1">{o.deliveryAddress.line1}{o.deliveryAddress.area ? `, ${o.deliveryAddress.area}` : ""}, {o.deliveryAddress.city}</p> : null}
            {o.notes ? <p className="mt-1 italic">“{o.notes}”</p> : null}
          </Panel>
          <Section title="Payment">
            {d.payment ? (
              <p className="mb-2 text-sm">M-Pesa · <strong>{d.payment.status}</strong>{d.payment.mpesaReceipt ? <> · receipt <code>{d.payment.mpesaReceipt}</code></> : null} · refunded {fmt(d.payment.refundedMinor)}</p>
            ) : <p className="text-sm text-muted-foreground">No payment started.</p>}
            <Table head={["Requested", "Phone", "State", "Result"]}>
              {d.attempts.map((a) => <tr key={a.id}><td className="font-mono text-xs">{a.requestedAt.toLocaleTimeString("en-KE", tz)}</td><td className="font-mono text-xs">{a.phoneMasked}</td><td>{a.status}</td><td className="text-xs">{a.resultDesc ?? ""}</td></tr>)}
            </Table>
          </Section>
          <Section title="Refunds">
            {d.refunds.length ? (
              <ul className="space-y-2 text-sm">
                {d.refunds.map((r) => (
                  <li key={r.id} className="rounded border p-2">
                    <div className="flex justify-between"><span>{fmt(r.amountMinor)} · {r.method === "manual" ? "manual" : "M-Pesa reversal"}</span><strong className="uppercase">{r.status}</strong></div>
                    <div className="text-xs text-muted-foreground">{r.reason}{r.manualReference ? ` · ref ${r.manualReference}` : ""}{r.resultDesc ? ` · ${r.resultDesc}` : ""}</div>
                    {r.status === "requested" && canRefund && r.requestedByUserId !== s.user.id ? (
                      <ActionForm action={approveRefundAction} className="mt-2 flex items-end gap-2 space-y-0">
                        <input type="hidden" name="refundId" value={r.id} /><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="branchId" value={branchId} />
                        {r.method === "manual" ? <Field label="Reference" name="manualReference"><TextInput name="manualReference" required placeholder="Cash / transfer ref" /></Field> : null}
                        <Submit variant="primary">Approve</Submit>
                      </ActionForm>
                    ) : r.status === "requested" ? <p className="mt-1 text-xs text-muted-foreground">Waiting for approval by someone else with refund rights.</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">None.</p>}
            {canManage && d.payment?.status === "succeeded" && d.payment.refundedMinor < d.payment.amountMinor ? (
              <ActionForm action={requestRefundAction} className="mt-3 space-y-2 rounded border p-3">
                <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="branchId" value={branchId} />
                <Field label="Reason" name="reason"><TextInput name="reason" required /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Method" name="method"><SelectInput name="method" options={[{ value: "mpesa_reversal", label: "M-Pesa reversal (full)" }, { value: "manual", label: "Manual" }]} /></Field>
                  <Field label="Amount KES" name="amountMinor" hint="Blank = full"><TextInput name="amount" inputMode="decimal" /></Field>
                </div>
                <Submit variant="secondary">Request refund</Submit>
              </ActionForm>
            ) : null}
          </Section>
        </div>
      </div>
    </>
  );
}
