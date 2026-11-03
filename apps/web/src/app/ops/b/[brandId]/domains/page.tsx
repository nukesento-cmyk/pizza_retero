import { notFound } from "next/navigation";
import { eq, schema } from "@retero/db";
import { domains, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { InlineAction } from "@/components/ops/forms";
import { Section, SelectInput, Table, TextInput } from "@/components/ops/kit";
import { addDomainAction, domainOpAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function BrandDomains({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}/domains`);
  await loadBrand(s, brandId);
  if (!rbac.can(s.actor, "domain.manage", { level: "brand", brandId })) notFound();
  const { list, frs, brs } = await readAs(s, async (tx) => ({
    list: await domains.listDomains(tx, brandId),
    frs: await tx.select().from(schema.franchisees).where(eq(schema.franchisees.brandId, brandId)),
    brs: await tx.select().from(schema.branches).where(eq(schema.branches.brandId, brandId)),
  }));
  const targetName = (d: (typeof list)[number]) =>
    d.branchId ? `Branch · ${brs.find((b) => b.id === d.branchId)?.name}` : d.franchiseeId ? `Region · ${frs.find((f) => f.id === d.franchiseeId)?.tradingName}` : "Brand";
  return (
    <>
      <Section title="Domains" description="Domains only route visitors. They never grant access.">
        <Table head={["Hostname", "Points to", "State", ""]} empty="No domains yet.">
          {list.map((d) => (
            <tr key={d.id}>
              <td className="font-mono text-xs">{d.hostname}{d.isPrimary ? <span className="ml-2 rounded bg-primary/10 px-1 text-[10px] uppercase text-primary">primary</span> : null}</td>
              <td>{targetName(d)}</td>
              <td className="text-xs">
                {d.verifiedAt ? "Verified" : <>Add TXT <code className="rounded bg-muted px-1">{domains.RECORD_PREFIX}.{d.hostname}</code> = <code className="rounded bg-muted px-1">{d.verificationToken}</code></>}
              </td>
              <td className="space-x-1 whitespace-nowrap text-right">
                {!d.verifiedAt ? <InlineAction action={domainOpAction} fields={{ brandId, domainId: d.id, op: "verify" }} label="Verify" /> : null}
                {d.verifiedAt && !d.isPrimary ? <InlineAction action={domainOpAction} fields={{ brandId, domainId: d.id, op: "primary" }} label="Make primary" /> : null}
                <InlineAction action={domainOpAction} fields={{ brandId, domainId: d.id, op: "remove" }} label="Remove" variant="danger" />
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Add a domain">
        <ActionForm action={addDomainAction} className="grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:space-y-0">
                        <input type="hidden" name="brandId" value={brandId} />
              <Field label="Hostname" name="hostname"><TextInput name="hostname" placeholder="westlands.example.com" required /></Field>
              <Field label="Points to" name="target">
                <SelectInput name="target" options={[
                  { value: "brand", label: "Whole brand" },
                  ...frs.map((f) => ({ value: `franchisee:${f.id}`, label: `Region · ${f.tradingName}` })),
                  ...brs.map((b) => ({ value: `branch:${b.id}`, label: `Branch · ${b.name}` })),
                ]} />
              </Field>
              <Submit>Add</Submit>
        </ActionForm>
      </Section>
    </>
  );
}
