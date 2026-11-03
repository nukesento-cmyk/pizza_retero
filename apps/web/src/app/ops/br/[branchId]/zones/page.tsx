import { notFound } from "next/navigation";
import { commerce, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { PageHeader, Section, Table, TextInput } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { fmt } from "@/lib/money";
import { upsertZoneAction } from "../../../commerce-actions";

export const dynamic = "force-dynamic";

export default async function Zones({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/zones`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "branch.update", scope)) notFound();
  const zones = await readAs(s, (tx) => commerce.listZones(tx, branchId));
  return (
    <>
      <PageHeader title={`${b.name} delivery zones`} kicker="Branch">Rings around the branch. The smallest ring containing the customer sets the fee.</PageHeader>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      {!b.latitude ? <p role="alert" className="mb-4 rounded border border-destructive/40 p-3 text-sm text-destructive">Set the branch latitude and longitude first. Delivery zones are measured from it.</p> : null}
      <Section title="Zones">
        <Table head={["Zone", "Radius", "Fee", "Free above", "Minimum", "ETA"]} empty="No zones: delivery is unavailable.">
          {zones.map((z) => (
            <tr key={z.id}>
              <td className="font-medium">{z.name}{!z.active ? " (off)" : ""}</td>
              <td>{z.radiusM ? `${(z.radiusM / 1000).toFixed(1)} km` : "polygon"}</td>
              <td className="font-mono text-xs">{fmt(z.feeMinor)}</td>
              <td className="font-mono text-xs">{fmt(z.freeAboveMinor)}</td>
              <td className="font-mono text-xs">{fmt(z.minOrderMinor)}</td>
              <td>{z.etaMinutes} min</td>
            </tr>
          ))}
        </Table>
        <ActionForm action={upsertZoneAction} className="mt-3 grid max-w-4xl gap-3 sm:grid-cols-7 sm:items-end sm:space-y-0">
          <input type="hidden" name="branchId" value={branchId} />
          <Field label="Name" name="name"><TextInput name="name" required placeholder="Inner ring" /></Field>
          <Field label="Radius km" name="radiusM"><TextInput name="radiusKm" required inputMode="decimal" placeholder="3" /></Field>
          <Field label="Fee KES" name="feeMinor"><TextInput name="fee" required inputMode="decimal" placeholder="150" /></Field>
          <Field label="Free above" name="freeAboveMinor"><TextInput name="freeAbove" inputMode="decimal" /></Field>
          <Field label="Minimum" name="minOrderMinor"><TextInput name="minOrder" inputMode="decimal" /></Field>
          <Field label="ETA min" name="etaMinutes"><TextInput name="etaMinutes" defaultValue="40" inputMode="numeric" /></Field>
          <Submit>Add zone</Submit>
        </ActionForm>
      </Section>
    </>
  );
}
