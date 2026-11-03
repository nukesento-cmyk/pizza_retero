import { notFound } from "next/navigation";
import { eq, schema } from "@retero/db";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand, readAs } from "@/server/ops/context";
import { env } from "@/server/env";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { Section, SelectInput, Table, TextInput } from "@/components/ops/kit";
import { upsertMpesaAccountAction } from "../../../commerce-actions";

export const dynamic = "force-dynamic";

export default async function PaymentSettings({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}/payments`);
  await loadBrand(s, brandId);
  if (!rbac.can(s.actor, "brand.settings.update", { level: "brand", brandId })) notFound();
  const { accounts, frs } = await readAs(s, async (tx) => ({
    accounts: await tx.select().from(schema.mpesaAccounts).where(eq(schema.mpesaAccounts.brandId, brandId)),
    frs: await tx.select().from(schema.franchisees).where(eq(schema.franchisees.brandId, brandId)),
  }));
  const local = env().APP_ENV === "local";
  const envs = [{ value: "sandbox", label: "Sandbox (Daraja test)" }, ...(local ? [{ value: "simulator", label: "Simulator (local only)" }] : []), { value: "production", label: "Production (platform only)" }];
  return (
    <>
      <Section title="M-Pesa settlement" description="Who receives the money. A franchisee account overrides the brand default for that franchisee's branches. Secrets live in the server environment under the credentials prefix, never here.">
        <Table head={["Applies to", "Environment", "Shortcode / till", "Type", "Credentials prefix", "State"]} empty="No M-Pesa account yet. Online payment is off.">
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.franchiseeId ? frs.find((f) => f.id === a.franchiseeId)?.tradingName : "Brand default"}</td>
              <td className="capitalize">{a.environment}</td>
              <td className="font-mono text-xs">{a.shortcode}{a.tillNumber ? ` / ${a.tillNumber}` : ""}</td>
              <td className="text-xs">{a.transactionType === "CustomerPayBillOnline" ? "Paybill" : "Buy Goods"}</td>
              <td className="font-mono text-xs">{a.credentialsRef}_*</td>
              <td>{a.active ? "Active" : "Replaced"}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Set an account">
        <ActionForm action={upsertMpesaAccountAction} className="grid max-w-4xl gap-3 sm:grid-cols-3">
          <input type="hidden" name="brandId" value={brandId} />
          <Field label="Applies to" name="franchiseeId"><SelectInput name="franchiseeId" options={[{ value: "", label: "Brand default" }, ...frs.map((f) => ({ value: f.id, label: f.tradingName }))]} /></Field>
          <Field label="Environment" name="environment"><SelectInput name="environment" options={envs} /></Field>
          <Field label="Type" name="transactionType"><SelectInput name="transactionType" options={[{ value: "CustomerPayBillOnline", label: "Paybill" }, { value: "CustomerBuyGoodsOnline", label: "Buy Goods (till)" }]} /></Field>
          <Field label="Shortcode" name="shortcode" hint="Sandbox: 174379"><TextInput name="shortcode" required inputMode="numeric" /></Field>
          <Field label="Till number" name="tillNumber" hint="Buy Goods only"><TextInput name="tillNumber" inputMode="numeric" /></Field>
          <Field label="Credentials prefix" name="credentialsRef" hint="Server env: PREFIX_CONSUMER_KEY, _CONSUMER_SECRET, _PASSKEY…"><TextInput name="credentialsRef" required placeholder="MPESA_RETERO" /></Field>
          <div className="sm:col-span-3"><Submit>Save</Submit></div>
        </ActionForm>
      </Section>
    </>
  );
}
