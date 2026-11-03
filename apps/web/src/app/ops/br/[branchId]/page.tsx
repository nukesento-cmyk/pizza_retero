import Link from "next/link";
import { franchise, rbac } from "@retero/core";
import { asc, eq, schema } from "@retero/db";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { InlineAction } from "@/components/ops/forms";
import { PageHeader, Section, Status, Table, TextInput } from "@/components/ops/kit";
import { StaffPanel } from "@/components/ops/staff-panel";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { addClosureAction, setBranchHoursAction, updateBranchAction } from "../../actions";

export const dynamic = "force-dynamic";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function BranchPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  const { hours, closures } = await readAs(s, async (tx) => ({
    hours: await franchise.getBranchHours(tx, branchId),
    closures: await tx.select().from(schema.branchClosures).where(eq(schema.branchClosures.branchId, branchId)).orderBy(asc(schema.branchClosures.startsAt)),
  }));
  const canEdit = rbac.can(s.actor, "branch.update", scope);
  const canStatus = rbac.can(s.actor, "branch.create", { level: "brand", brandId: b.brandId });
  const slot = (d: number, i: number) => hours.filter((h) => h.dayOfWeek === d)[i];

  return (
    <>
      <PageHeader title={b.name} kicker="Branch" actions={
        <>
          {canStatus ? (b.status === "active"
            ? <InlineAction action={updateBranchAction} fields={{ branchId, status: "suspended" }} label="Pause trading" variant="danger" />
            : <InlineAction action={updateBranchAction} fields={{ branchId, status: "active" }} label="Open for trading" />) : null}
          <Link href={`/ops/f/${b.franchiseeId}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted">Franchisee</Link>
        </>
      }>
        {b.area ? `${b.area}, ` : ""}{b.city} · <Status value={b.status} />
      </PageHeader>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />

      {canEdit ? (
        <Section title="Details">
          <ActionForm action={updateBranchAction} keep className="grid max-w-3xl gap-3 sm:grid-cols-3">
                            <input type="hidden" name="branchId" value={branchId} />
                <input type="hidden" name="offersDeliveryPresent" value="1" />
                <Field label="Name" name="name"><TextInput name="name" defaultValue={b.name} /></Field>
                <Field label="Phone" name="phone"><TextInput name="phone" defaultValue={b.phone ?? ""} /></Field>
                <Field label="Address" name="addressLine"><TextInput name="addressLine" defaultValue={b.addressLine ?? ""} /></Field>
                <Field label="Area" name="area"><TextInput name="area" defaultValue={b.area ?? ""} /></Field>
                <Field label="City" name="city"><TextInput name="city" defaultValue={b.city} /></Field>
                <Field label="Timezone" name="timezone"><TextInput name="timezone" defaultValue={b.timezone} /></Field>
                <Field label="Latitude" name="latitude"><TextInput name="latitude" inputMode="decimal" defaultValue={b.latitude ?? ""} /></Field>
                <Field label="Longitude" name="longitude"><TextInput name="longitude" inputMode="decimal" defaultValue={b.longitude ?? ""} /></Field>
                <div className="flex items-end gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="offersDelivery" defaultChecked={b.offersDelivery} /> Delivery</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="offersCollection" defaultChecked={b.offersCollection} /> Collection</label>
                </div>
                <div className="sm:col-span-3"><Submit>Save</Submit></div>
          </ActionForm>
        </Section>
      ) : null}

      <Section title="Opening hours" description="Times are local to the branch. A close time earlier than the open time runs past midnight.">
        <ActionForm action={setBranchHoursAction} keep>
                        <input type="hidden" name="branchId" value={branchId} />
              <div className="overflow-x-auto rounded-lg border">
                <table className="text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Day</th><th className="px-3">Opens</th><th className="px-3">Closes</th><th className="px-3">Opens (2nd)</th><th className="px-3">Closes (2nd)</th></tr></thead>
                  <tbody>
                    {DAYS.map((d, i) => (
                      <tr key={d} className="border-t">
                        <td className="px-3 py-1.5 font-medium">{d}</td>
                        {[0, 1].map((k) => (
                          <SlotCells key={k} d={i} k={k} o={slot(i, k)?.opensAt.slice(0, 5)} c={slot(i, k)?.closesAt.slice(0, 5)} disabled={!canEdit} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit ? <Submit>Save hours</Submit> : null}
        </ActionForm>
      </Section>

      <Section title="Closures">
        <Table head={["From", "To", "Reason"]} empty="No closures scheduled.">
          {closures.map((c) => (
            <tr key={c.id}><td className="font-mono text-xs">{c.startsAt.toISOString().slice(0, 16).replace("T", " ")}</td><td className="font-mono text-xs">{c.endsAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{c.reason}</td></tr>
          ))}
        </Table>
        {canEdit ? (
          <ActionForm action={addClosureAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end sm:space-y-0">
                            <input type="hidden" name="branchId" value={branchId} />
                <Field label="From" name="startsAt"><TextInput type="datetime-local" name="startsAt" required /></Field>
                <Field label="To" name="endsAt"><TextInput type="datetime-local" name="endsAt" required /></Field>
                <Field label="Reason" name="reason"><TextInput name="reason" required placeholder="Public holiday" /></Field>
                <Submit>Add</Submit>
          </ActionForm>
        ) : null}
      </Section>

      {rbac.can(s.actor, "staff.read", scope) ? <StaffPanel session={s} scope={scope} filter={{ branchId }} returnTo={`/ops/br/${branchId}`} /> : null}
    </>
  );
}

function SlotCells({ d, k, o, c, disabled }: { d: number; k: number; o?: string; c?: string; disabled: boolean }) {
  return (
    <>
      <td className="px-2 py-1"><input type="time" name={`d${d}s${k}o`} defaultValue={o} disabled={disabled} aria-label={`Day ${d} interval ${k + 1} opens`} className="h-8 rounded border bg-background px-1" /></td>
      <td className="px-2 py-1"><input type="time" name={`d${d}s${k}c`} defaultValue={c} disabled={disabled} aria-label={`Day ${d} interval ${k + 1} closes`} className="h-8 rounded border bg-background px-1" /></td>
    </>
  );
}
