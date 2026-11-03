import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, schema } from "@retero/db";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { InlineAction } from "@/components/ops/forms";
import { PageHeader, Section, SelectInput, Status, Table, TextInput } from "@/components/ops/kit";
import { ProductImageUpload } from "@/components/ops/image-upload";
import { publicUrl } from "@/server/storage";
import { fmt, toInput } from "@/lib/money";
import { compositionAction, setProductStatusAction, upsertProductAction, upsertVariantAction } from "../../../../catalogue-actions";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ brandId: string; productId: string }> }) {
  const { brandId, productId } = await params;
  const s = await requireUser(`/ops/b/${brandId}/menu/${productId}`);
  await loadBrand(s, brandId);
  if (!rbac.can(s.actor, "catalogue.manage", { level: "brand", brandId })) notFound();
  const d = await readAs(s, async (tx) => {
    const [product] = await tx.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.brandId, brandId)));
    if (!product) return null;
    const variants = await tx.select().from(schema.productVariants).where(eq(schema.productVariants.productId, productId)).orderBy(asc(schema.productVariants.sort));
    return {
      product, variants,
      groups: await tx.select().from(schema.optionGroups).where(eq(schema.optionGroups.brandId, brandId)).orderBy(asc(schema.optionGroups.sort)),
      options: await tx.select().from(schema.options).where(eq(schema.options.brandId, brandId)).orderBy(asc(schema.options.sort)),
      pogs: await tx.select().from(schema.productOptionGroups).where(eq(schema.productOptionGroups.productId, productId)),
      defs: await tx.select().from(schema.productDefaultOptions).where(eq(schema.productDefaultOptions.productId, productId)),
      recipes: variants.length ? await tx.select({ variantId: schema.variantRecipes.variantId, qty: schema.variantRecipes.quantity, name: schema.ingredients.name, unit: schema.ingredients.unit })
        .from(schema.variantRecipes).innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.variantRecipes.ingredientId))
        .where(inArray(schema.variantRecipes.variantId, variants.map((v) => v.id))) : [],
    };
  });
  if (!d) notFound();
  const { product: p } = d;
  return (
    <>
      <PageHeader title={p.name} kicker={<Link href={`/ops/b/${brandId}/menu`} className="hover:underline">← Menu</Link> } actions={
        <>
          {p.status !== "active" ? <InlineAction action={setProductStatusAction} fields={{ brandId, productId, status: "active" }} label="Publish" variant="primary" /> : null}
          {p.status === "active" ? <InlineAction action={setProductStatusAction} fields={{ brandId, productId, status: "draft" }} label="Unpublish" /> : null}
          {p.status !== "archived" ? <InlineAction action={setProductStatusAction} fields={{ brandId, productId, status: "archived" }} label="Archive" variant="danger" /> : null}
        </>
      }>
        <Status value={p.status} /> <span className="ml-2 capitalize">{p.kind}</span>
      </PageHeader>

      <Section title="Photo"><ProductImageUpload productId={p.id} current={publicUrl(p.imageKey)} /></Section>

      <Section title="Details">
        <ActionForm action={upsertProductAction} keep className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="productId" value={p.id} />
          <input type="hidden" name="slug" value={p.slug} />
          <input type="hidden" name="status" value={p.status} />
          <Field label="Name" name="name"><TextInput name="name" defaultValue={p.name} /></Field>
          <Field label="Kind" name="kind"><SelectInput name="kind" defaultValue={p.kind} options={["pizza", "side", "drink", "dessert"].map((k) => ({ value: k, label: k }))} /></Field>
          <Field label="Description" name="description" className="sm:col-span-2"><TextInput name="description" defaultValue={p.description ?? ""} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="builderEnabled" defaultChecked={p.builderEnabled} /> Build it in the 3D kitchen</label>
          <div className="sm:col-span-2"><Submit>Save</Submit></div>
        </ActionForm>
      </Section>

      <Section title="Sizes & prices" description="Brand price, with the range branches may set. KES must be whole shillings (M-Pesa).">
        <Table head={["Size", "Code", "Price", "Branch range", "Recipe"]} empty="No sizes yet. Add one to publish.">
          {d.variants.map((v) => (
            <tr key={v.id}>
              <td>{v.name}{v.isDefault ? <span className="ml-1 text-xs text-muted-foreground">(default)</span> : null}</td>
              <td className="font-mono text-xs">{v.code}{v.sizeCode ? ` · ${v.sizeCode}` : ""}</td>
              <td className="font-mono">{fmt(v.priceMinor)}</td>
              <td className="font-mono text-xs">{v.minPriceMinor || v.maxPriceMinor ? `${fmt(v.minPriceMinor)} – ${fmt(v.maxPriceMinor)}` : "fixed"}</td>
              <td className="text-xs">{d.recipes.filter((r) => r.variantId === v.id).map((r) => `${r.name} ${Number(r.qty)}${r.unit}`).join(", ") || "—"}</td>
            </tr>
          ))}
        </Table>
        <ActionForm action={upsertVariantAction} className="mt-3 grid max-w-4xl gap-3 sm:grid-cols-7 sm:items-end sm:space-y-0">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="productId" value={p.id} />
          <Field label="Size name" name="name"><TextInput name="name" required placeholder="Classic 12&quot;" /></Field>
          <Field label="Code" name="code"><TextInput name="code" required placeholder="classic" /></Field>
          <Field label="Size family" name="sizeCode"><TextInput name="sizeCode" placeholder="classic" /></Field>
          <Field label="Price KES" name="priceMinor"><TextInput name="price" required inputMode="decimal" defaultValue={toInput(d.variants[0]?.priceMinor)} /></Field>
          <Field label="Min" name="minPriceMinor"><TextInput name="minPrice" inputMode="decimal" /></Field>
          <Field label="Max" name="maxPriceMinor"><TextInput name="maxPrice" inputMode="decimal" /></Field>
          <Submit variant="secondary">Save size</Submit>
        </ActionForm>
      </Section>

      <Section title="Options" description="Which groups this product offers, and which options are included in its price.">
        <ActionForm action={compositionAction} keep className="space-y-3">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="productId" value={p.id} />
          <div className="grid gap-3 lg:grid-cols-2">
            {d.groups.map((g) => (
              <fieldset key={g.id} className="rounded-lg border p-3">
                <legend className="px-1 text-sm font-semibold">
                  <label className="flex items-center gap-2"><input type="checkbox" name="groups" value={g.id} defaultChecked={d.pogs.some((x) => x.groupId === g.id)} /> {g.name}</label>
                </legend>
                <p className="mb-2 text-xs text-muted-foreground">Tick options included in the base price:</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {d.options.filter((o) => o.groupId === g.id).map((o) => (
                    <label key={o.id} className="flex items-center gap-1"><input type="checkbox" name="defaults" value={o.id} defaultChecked={d.defs.some((x) => x.optionId === o.id)} /> {o.name}</label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <Submit>Save options</Submit>
        </ActionForm>
      </Section>
    </>
  );
}
