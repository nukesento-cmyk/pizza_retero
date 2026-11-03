import Link from "next/link";
import { eq, schema } from "@retero/db";
import { franchise, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { Section, Status, Table, TextInput } from "@/components/ops/kit";
import { createFranchiseeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function BrandOverview({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}`);
  await loadBrand(s, brandId);
  const { frs, branches } = await readAs(s, async (tx) => ({
    frs: await franchise.listFranchisees(tx, brandId),
    branches: await tx.select().from(schema.branches).where(eq(schema.branches.brandId, brandId)),
  }));
  const canCreate = rbac.can(s.actor, "franchisee.create", { level: "brand", brandId });
  return (
    <>
      <Section title="Franchisees" description={`${frs.length} franchisees · ${branches.length} branches`}>
        <Table head={["Trading name", "Legal name", "Branches", "Status"]} empty="No franchisees yet.">
          {frs.map((f) => (
            <tr key={f.id}>
              <td><Link href={`/ops/f/${f.id}`} className="font-medium hover:underline">{f.tradingName}</Link></td>
              <td>{f.legalName}</td>
              <td>
                {branches.filter((b) => b.franchiseeId === f.id).map((b) => (
                  <Link key={b.id} href={`/ops/br/${b.id}`} className="mr-2 inline-flex items-center gap-1 hover:underline">{b.name}<Status value={b.status} /></Link>
                ))}
              </td>
              <td><Status value={f.status} /></td>
            </tr>
          ))}
        </Table>
      </Section>
      {canCreate ? (
        <Section title="Onboard a franchisee">
          <ActionForm action={createFranchiseeAction} className="grid max-w-3xl gap-3 sm:grid-cols-3">
                            <input type="hidden" name="brandId" value={brandId} />
                <Field label="Trading name" name="tradingName"><TextInput name="tradingName" required /></Field>
                <Field label="Legal name" name="legalName"><TextInput name="legalName" required /></Field>
                <Field label="KRA PIN" name="kraPin" hint="Optional"><TextInput name="kraPin" placeholder="P051234567X" /></Field>
                <div className="sm:col-span-3"><Submit>Onboard</Submit></div>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
