import { notFound } from "next/navigation";
import { catalogue, rbac } from "@retero/core";
import { eq, schema } from "@retero/db";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { ActionForm, Submit } from "@/components/ops/action-form";
import { InlineAction } from "@/components/ops/forms";
import { PageHeader, Section, Table, TextInput } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { fmt, toInput } from "@/lib/money";
import { branchAvailabilityAction, branchOptionAction, branchPriceAction } from "../../../catalogue-actions";

export const dynamic = "force-dynamic";

export default async function BranchMenu({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/menu`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "branch.menu.manage", scope)) notFound();
  const { menu, bounds } = await readAs(s, async (tx) => ({
    menu: await catalogue.getBranchMenu(tx, branchId),
    bounds: await tx.select().from(schema.productVariants).where(eq(schema.productVariants.brandId, b.brandId)),
  }));
  const bound = new Map(bounds.map((v) => [v.id, v]));
  return (
    <>
      <PageHeader title={`${b.name} menu`} kicker="Branch">Availability and prices here override the brand menu for this branch only.</PageHeader>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <Section title="Products">
        <Table head={["Product", "Prices (brand range)", "Available"]}>
          {menu.products.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">{p.name}</td>
              <td>
                <div className="flex flex-wrap gap-3">
                  {p.variants.map((v) => {
                    const bv = bound.get(v.id)!;
                    const overridden = v.priceMinor !== bv.priceMinor;
                    return (
                      <ActionForm key={v.id} action={branchPriceAction} keep className="flex items-center gap-1 space-y-0">
                        <input type="hidden" name="branchId" value={branchId} />
                        <input type="hidden" name="variantId" value={v.id} />
                        <label className="text-xs">{v.name}
                          <TextInput name="price" defaultValue={overridden ? toInput(v.priceMinor) : ""} placeholder={toInput(bv.priceMinor)} className="ml-1 inline-block h-8 w-20" aria-label={`${p.name} ${v.name} branch price`} />
                        </label>
                        <Submit variant="ghost" className="h-8 px-2">Set</Submit>
                        <span className="font-mono text-[10px] text-muted-foreground">{bv.minPriceMinor || bv.maxPriceMinor ? `${fmt(bv.minPriceMinor)}–${fmt(bv.maxPriceMinor)}` : "fixed"}</span>
                      </ActionForm>
                    );
                  })}
                </div>
              </td>
              <td>
                {p.available
                  ? <InlineAction action={branchAvailabilityAction} fields={{ branchId, productId: p.id, isAvailable: "false" }} label="Mark unavailable" />
                  : <InlineAction action={branchAvailabilityAction} fields={{ branchId, productId: p.id, isAvailable: "true" }} label="Make available" variant="primary" />}
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Options" description="Mark toppings and extras as sold out for this branch.">
        <div className="grid gap-3 lg:grid-cols-2">
          {Object.values(menu.groups).map((g) => (
            <div key={g.id} className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{g.name}</h3>
              <ul className="space-y-1 text-sm">
                {g.options.map((o) => (
                  <li key={o.id} className="flex items-center justify-between">
                    <span className={o.available ? "" : "text-muted-foreground line-through"}>{o.name}</span>
                    {o.available
                      ? <InlineAction action={branchOptionAction} fields={{ branchId, optionId: o.id, isAvailable: "false" }} label="Sold out" variant="ghost" />
                      : <InlineAction action={branchOptionAction} fields={{ branchId, optionId: o.id, isAvailable: "true" }} label="Back in" variant="primary" />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
