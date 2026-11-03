import Link from "next/link";
import { franchise, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadFranchisee, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { InlineAction } from "@/components/ops/forms";
import { PageHeader, Section, Status, Table, TextInput } from "@/components/ops/kit";
import { StaffPanel } from "@/components/ops/staff-panel";
import { createBranchAction, updateFranchiseeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function FranchiseePage({ params }: { params: Promise<{ franchiseeId: string }> }) {
  const { franchiseeId } = await params;
  const s = await requireUser(`/ops/f/${franchiseeId}`);
  const f = await loadFranchisee(s, franchiseeId);
  const scope = { level: "franchisee", brandId: f.brandId, franchiseeId } as const;
  const branches = await readAs(s, (tx) => franchise.listBranches(tx, { franchiseeId }));
  const canEdit = rbac.can(s.actor, "franchisee.update", scope);
  const canStatus = rbac.can(s.actor, "franchisee.create", { level: "brand", brandId: f.brandId });
  const canOpen = rbac.can(s.actor, "branch.create", { level: "brand", brandId: f.brandId });
  return (
    <>
      <PageHeader title={f.tradingName} kicker="Franchisee" actions={
        canStatus ? (f.status === "active"
          ? <InlineAction action={updateFranchiseeAction} fields={{ franchiseeId, status: "suspended" }} label="Suspend" variant="danger" />
          : <InlineAction action={updateFranchiseeAction} fields={{ franchiseeId, status: "active" }} label="Activate" />) : null
      }>
        {f.legalName} · <Status value={f.status} />
      </PageHeader>

      <Section title="Branches">
        <Table head={["Branch", "City", "Fulfilment", "Status"]} empty="No branches yet.">
          {branches.map((b) => (
            <tr key={b.id}>
              <td><Link href={`/ops/br/${b.id}`} className="font-medium hover:underline">{b.name}</Link></td>
              <td>{b.area ? `${b.area}, ` : ""}{b.city}</td>
              <td className="text-xs">{[b.offersDelivery && "Delivery", b.offersCollection && "Collection"].filter(Boolean).join(" · ")}</td>
              <td><Status value={b.status} /></td>
            </tr>
          ))}
        </Table>
      </Section>

      {canOpen ? (
        <Section title="Open a branch" description="New branches start as pending until the brand activates them.">
          <ActionForm action={createBranchAction} className="grid max-w-3xl gap-3 sm:grid-cols-3">
                            <input type="hidden" name="franchiseeId" value={franchiseeId} />
                <Field label="Name" name="name"><TextInput name="name" required /></Field>
                <Field label="Slug" name="slug"><TextInput name="slug" required placeholder="westlands" /></Field>
                <Field label="City" name="city"><TextInput name="city" required defaultValue="Nairobi" /></Field>
                <Field label="Area" name="area"><TextInput name="area" /></Field>
                <Field label="Phone" name="phone"><TextInput name="phone" placeholder="+2547…" /></Field>
                <div className="flex items-end gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="offersDelivery" defaultChecked /> Delivery</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="offersCollection" defaultChecked /> Collection</label>
                </div>
                <div className="sm:col-span-3"><Submit>Create branch</Submit></div>
          </ActionForm>
        </Section>
      ) : null}

      {canEdit ? (
        <Section title="Details">
          <ActionForm action={updateFranchiseeAction} keep className="grid max-w-3xl gap-3 sm:grid-cols-3">
                            <input type="hidden" name="franchiseeId" value={franchiseeId} />
                <Field label="Trading name" name="tradingName"><TextInput name="tradingName" defaultValue={f.tradingName} /></Field>
                <Field label="Legal name" name="legalName"><TextInput name="legalName" defaultValue={f.legalName} /></Field>
                <Field label="KRA PIN" name="kraPin"><TextInput name="kraPin" defaultValue={f.kraPin ?? ""} /></Field>
                <div className="sm:col-span-3"><Submit>Save</Submit></div>
          </ActionForm>
        </Section>
      ) : null}

      {rbac.can(s.actor, "staff.read", scope) ? <StaffPanel session={s} scope={scope} filter={{ franchiseeId }} returnTo={`/ops/f/${franchiseeId}`} /> : null}
    </>
  );
}
