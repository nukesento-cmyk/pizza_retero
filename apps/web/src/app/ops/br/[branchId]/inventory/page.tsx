import { notFound } from "next/navigation";
import { asc, eq, or, isNull, schema } from "@retero/db";
import { inventory, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { PageHeader, Section, SelectInput, Table, TextInput } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { movementAction, supplierAction, trackIngredientAction } from "../../../ops-actions";

export const dynamic = "force-dynamic";
const n = (s: string) => Number(s).toLocaleString("en-KE", { maximumFractionDigits: 3 });

export default async function Inventory({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/inventory`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "inventory.read", scope)) notFound();
  const canManage = rbac.can(s.actor, "inventory.manage", scope);
  const d = await readAs(s, async (tx) => ({
    stock: await inventory.stockList(tx, branchId),
    moves: await inventory.recentMovements(tx, branchId, 40),
    ingredients: await tx.select().from(schema.ingredients).where(eq(schema.ingredients.brandId, b.brandId)).orderBy(asc(schema.ingredients.name)),
    suppliers: await tx.select().from(schema.suppliers).where(or(isNull(schema.suppliers.franchiseeId), eq(schema.suppliers.franchiseeId, b.franchiseeId))),
  }));
  const untracked = d.ingredients.filter((i) => !d.stock.some((x) => x.ingredientId === i.id));
  return (
    <>
      <PageHeader title={`${b.name} stock`} kicker="Branch">Reserved = held for paid or pending orders. It&apos;s used when the kitchen starts preparing them.</PageHeader>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <Section title="On hand">
        <Table head={["Ingredient", "On hand", "Reserved", "Available", "Reorder at", ""]} empty="Nothing tracked yet. Untracked ingredients never block orders.">
          {d.stock.map((r) => (
            <tr key={r.id} className={r.low ? "bg-sauce/5" : ""}>
              <td className="font-medium">{r.name}{r.low ? <span className="ml-2 rounded bg-sauce px-1 text-[10px] uppercase text-flour">low</span> : null}</td>
              <td className="font-mono text-xs">{n(r.onHand)} {r.unit}</td>
              <td className="font-mono text-xs">{n(r.reserved)}</td>
              <td className="font-mono text-xs font-semibold">{n(r.available)}</td>
              <td className="font-mono text-xs">{n(r.reorderLevel)}</td>
              <td>
                {canManage ? (
                  <ActionForm action={movementAction} className="flex items-end gap-1 space-y-0">
                    <input type="hidden" name="itemId" value={r.id} /><input type="hidden" name="branchId" value={branchId} />
                    <SelectInput name="kind" aria-label={`${r.name} movement`} className="h-8 w-28" options={[{ value: "receipt", label: "Receive" }, { value: "waste", label: "Waste" }, { value: "count", label: "Count" }]} />
                    <TextInput name="quantity" aria-label={`${r.name} quantity`} inputMode="decimal" className="h-8 w-20" required />
                    <TextInput name="reason" aria-label={`${r.name} reason`} placeholder="reason" className="h-8 w-28" />
                    <Submit variant="secondary" className="h-8">Save</Submit>
                  </ActionForm>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
        {canManage && untracked.length ? (
          <ActionForm action={trackIngredientAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-4 sm:items-end sm:space-y-0">
            <input type="hidden" name="branchId" value={branchId} />
            <Field label="Start tracking" name="ingredientId"><SelectInput name="ingredientId" options={untracked.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))} /></Field>
            <Field label="Opening stock" name="openingStock"><TextInput name="openingStock" inputMode="decimal" defaultValue="0" /></Field>
            <Field label="Reorder at" name="reorderLevel"><TextInput name="reorderLevel" inputMode="decimal" defaultValue="0" /></Field>
            <Submit>Track</Submit>
          </ActionForm>
        ) : null}
      </Section>
      <Section title="Movements" description="Append-only ledger.">
        <Table head={["When", "Ingredient", "Kind", "Change", "Reason"]}>
          {d.moves.map(({ m, name, unit }) => (
            <tr key={m.id}><td className="font-mono text-xs">{m.createdAt.toLocaleString("en-KE", { timeZone: b.timezone })}</td><td>{name}</td><td className="capitalize">{m.kind}</td><td className="font-mono text-xs">{Number(m.quantity) > 0 ? "+" : ""}{n(m.quantity)} {unit}</td><td className="text-xs">{m.reason ?? (m.orderId ? "order" : "")}</td></tr>
          ))}
        </Table>
      </Section>
      <Section title="Suppliers">
        <Table head={["Supplier", "Phone", "Email", "Scope"]} empty="No suppliers yet.">
          {d.suppliers.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.phone}</td><td>{x.email}</td><td className="text-xs">{x.franchiseeId ? "This franchise" : "Brand-approved"}</td></tr>)}
        </Table>
        {canManage ? (
          <ActionForm action={supplierAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-4 sm:items-end sm:space-y-0">
            <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="brandId" value={b.brandId} /><input type="hidden" name="franchiseeId" value={b.franchiseeId} />
            <Field label="Supplier" name="name"><TextInput name="name" required /></Field>
            <Field label="Phone" name="phone"><TextInput name="phone" /></Field>
            <Field label="Email" name="email"><TextInput name="email" type="email" /></Field>
            <Submit variant="secondary">Add</Submit>
          </ActionForm>
        ) : null}
      </Section>
    </>
  );
}
