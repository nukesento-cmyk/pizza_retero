import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, schema } from "@retero/db";
import { delivery, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { ActionForm, Submit } from "@/components/ops/action-form";
import { PageHeader, Section, SelectInput, Table, Empty } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { RiderButtons } from "./rider-buttons";
import { assignRiderAction } from "../../../ops-actions";

export const dynamic = "force-dynamic";

export default async function Delivery({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/delivery`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "delivery.read", scope)) notFound();
  const canAssign = rbac.can(s.actor, "order.manage", scope);
  const d = await readAs(s, async (tx) => ({
    queue: canAssign ? await tx.select().from(schema.orders).where(and(eq(schema.orders.branchId, branchId), eq(schema.orders.fulfilment, "delivery"), inArray(schema.orders.status, ["accepted", "preparing", "baking", "ready", "out_for_delivery"]))) : [],
    assignments: await tx.select().from(schema.deliveryAssignments).where(and(eq(schema.deliveryAssignments.branchId, branchId), inArray(schema.deliveryAssignments.status, ["assigned", "picked_up"]))),
    riders: canAssign ? await delivery.riders(tx, branchId) : [],
    mine: await delivery.myDeliveries(tx, s.user.id),
  }));
  return (
    <>
      <PageHeader title={`${b.name} delivery`} kicker="Branch" />
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <Section title="My deliveries">
        {d.mine.length === 0 ? <Empty>Nothing assigned to you.</Empty> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.mine.map(({ a, o }) => (
              <li key={a.id} className="rounded-lg border p-3">
                <div className="flex justify-between"><span className="font-mono font-semibold">{o.number}</span><span className="text-xs uppercase">{o.status.replace(/_/g, " ")}</span></div>
                <p className="mt-1 text-sm">{o.contactName} · <a className="underline" href={`tel:${o.contactPhone}`}>{o.contactPhone}</a></p>
                {o.deliveryAddress ? <p className="text-sm">{o.deliveryAddress.line1}{o.deliveryAddress.area ? `, ${o.deliveryAddress.area}` : ""}</p> : null}
                {o.deliveryAddress?.lat ? <a className="text-xs underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${o.deliveryAddress.lat},${o.deliveryAddress.lng}`}>Open in Maps</a> : null}
                <RiderButtons assignmentId={a.id} branchId={branchId} status={a.status} orderReady={o.status === "ready"} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      {canAssign ? (
        <Section title="Dispatch">
          <Table head={["Order", "Status", "Address", "Rider"]} empty="No delivery orders in progress.">
            {d.queue.map((o) => {
              const asg = d.assignments.find((x) => x.orderId === o.id);
              return (
                <tr key={o.id}>
                  <td><Link className="font-mono hover:underline" href={`/ops/br/${branchId}/orders/${o.id}`}>{o.number}</Link></td>
                  <td className="text-xs uppercase">{o.status.replace(/_/g, " ")}</td>
                  <td className="text-sm">{o.deliveryAddress?.line1}</td>
                  <td>
                    {o.status === "out_for_delivery" ? <span className="text-sm">{d.riders.find((r) => r.userId === asg?.riderUserId)?.name ?? "On the way"}</span> : (
                      <ActionForm action={assignRiderAction} keep className="flex items-center gap-1 space-y-0">
                        <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="branchId" value={branchId} />
                        <SelectInput name="riderUserId" aria-label={`Rider for ${o.number}`} defaultValue={asg?.riderUserId} className="h-8 w-40" options={[{ value: "", label: d.riders.length ? "Choose rider" : "No riders yet" }, ...d.riders.map((r) => ({ value: r.userId, label: r.name ?? r.email ?? "Rider" }))]} />
                        <Submit variant="secondary" className="h-8">{asg ? "Reassign" : "Assign"}</Submit>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Section>
      ) : null}
    </>
  );
}
