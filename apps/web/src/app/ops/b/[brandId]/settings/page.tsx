import { notFound } from "next/navigation";
import { eq, schema } from "@retero/db";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { Section, TextInput } from "@/components/ops/kit";
import { updateBrandSettingsAction } from "../../../actions";

export const dynamic = "force-dynamic";

const COLORS = [["sauce", "#c8402b"], ["crust", "#e7a33e"], ["oven", "#f06a2e"], ["basil", "#2e6b52"], ["dough", "#f6ecd9"], ["espresso", "#2a1a13"]] as const;

export default async function BrandSettings({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}/settings`);
  const brand = await loadBrand(s, brandId);
  if (!rbac.can(s.actor, "brand.settings.update", { level: "brand", brandId })) notFound();
  const [settings] = await readAs(s, (tx) => tx.select().from(schema.brandSettings).where(eq(schema.brandSettings.brandId, brandId)));
  const theme = settings?.theme.colors ?? {};
  return (
    <Section title="Brand settings">
      <ActionForm action={updateBrandSettingsAction} keep className="max-w-2xl">
                    <input type="hidden" name="brandId" value={brandId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand name" name="name"><TextInput name="name" defaultValue={brand.name} /></Field>
              <Field label="Timezone" name="timezone"><TextInput name="timezone" defaultValue={settings?.timezone ?? "Africa/Nairobi"} /></Field>
              <Field label="WhatsApp number" name="whatsappNumber" hint="Click-to-chat ordering, e.g. +254712345678"><TextInput name="whatsappNumber" defaultValue={settings?.whatsappNumber ?? ""} /></Field>
              <Field label="Support email" name="supportEmail"><TextInput name="supportEmail" type="email" defaultValue={settings?.supportEmail ?? ""} /></Field>
            </div>
            <fieldset className="mt-2">
              <legend className="mb-2 text-sm font-medium">Theme colours</legend>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {COLORS.map(([k, d]) => (
                  <label key={k} className="text-xs">
                    <span className="mb-1 block capitalize">{k}</span>
                    <input type="color" name={`color_${k}`} defaultValue={(theme as Record<string, string>)[k] ?? d} className="h-9 w-full cursor-pointer rounded border" />
                  </label>
                ))}
              </div>
            </fieldset>
            <Submit pendingLabel="Saving…">Save</Submit>
      </ActionForm>
    </Section>
  );
}
