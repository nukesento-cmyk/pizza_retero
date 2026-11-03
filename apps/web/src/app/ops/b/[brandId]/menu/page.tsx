import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, schema } from "@retero/db";
import { catalogue, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand, readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { Section, SelectInput, Status, Table, TextInput } from "@/components/ops/kit";
import { fmt } from "@/lib/money";
import { upsertIngredientAction, upsertOptionAction, upsertOptionGroupAction, upsertProductAction } from "../../../catalogue-actions";

export const dynamic = "force-dynamic";

export default async function BrandMenu({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}/menu`);
  await loadBrand(s, brandId);
  if (!rbac.can(s.actor, "catalogue.manage", { level: "brand", brandId })) notFound();
  const d = await readAs(s, async (tx) => ({
    products: await tx.select().from(schema.products).where(eq(schema.products.brandId, brandId)).orderBy(asc(schema.products.sort), asc(schema.products.name)),
    variants: await tx.select().from(schema.productVariants).where(eq(schema.productVariants.brandId, brandId)).orderBy(asc(schema.productVariants.sort)),
    groups: await tx.select().from(schema.optionGroups).where(eq(schema.optionGroups.brandId, brandId)).orderBy(asc(schema.optionGroups.sort)),
    options: await tx.select().from(schema.options).where(eq(schema.options.brandId, brandId)).orderBy(asc(schema.options.sort)),
    ingredients: await tx.select().from(schema.ingredients).where(eq(schema.ingredients.brandId, brandId)).orderBy(asc(schema.ingredients.name)),
    ingAllergens: await tx.select().from(schema.ingredientAllergens).where(eq(schema.ingredientAllergens.brandId, brandId)),
  }));

  return (
    <>
      <Section title="Products" description="The brand catalogue. Branches toggle availability and set prices within the bounds you allow.">
        <Table head={["Product", "Kind", "Sizes", "Status"]} empty="No products yet.">
          {d.products.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/ops/b/${brandId}/menu/${p.id}`} className="font-medium hover:underline">{p.name}</Link>{p.builderEnabled ? <span className="ml-2 rounded bg-crust/30 px-1 text-[10px] uppercase">3D builder</span> : null}</td>
              <td className="capitalize">{p.kind}</td>
              <td className="font-mono text-xs">{d.variants.filter((v) => v.productId === p.id).map((v) => `${v.name} ${fmt(v.priceMinor)}`).join(" · ") || "—"}</td>
              <td><Status value={p.status} /></td>
            </tr>
          ))}
        </Table>
        <ActionForm action={upsertProductAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end sm:space-y-0">
          <input type="hidden" name="brandId" value={brandId} />
          <Field label="New product name" name="name"><TextInput name="name" required /></Field>
          <Field label="Slug" name="slug"><TextInput name="slug" required placeholder="hawaiian" /></Field>
          <Field label="Kind" name="kind"><SelectInput name="kind" options={["pizza", "side", "drink", "dessert"].map((k) => ({ value: k, label: k }))} /></Field>
          <Submit>Add</Submit>
        </ActionForm>
      </Section>

      <Section title="Option groups" description="Crusts, sauces, cheeses and toppings. Visual keys tell the 3D kitchen how to draw each option.">
        <div className="grid gap-4 lg:grid-cols-2">
          {d.groups.map((g) => (
            <div key={g.id} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{g.name} <span className="font-mono text-xs text-muted-foreground">{g.kind} · pick {g.minSelect}–{g.maxSelect}</span></h3>
              </div>
              <ul className="space-y-1 text-sm">
                {d.options.filter((o) => o.groupId === g.id).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">{o.color ? <span aria-hidden className="size-3 rounded-full border" style={{ background: o.color }} /> : null}{o.name}</span>
                    <span className="font-mono text-xs">{o.priceMinor > 0n ? `+${fmt(o.priceMinor)}` : "included"}</span>
                  </li>
                ))}
              </ul>
              <ActionForm action={upsertOptionAction} className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4 sm:space-y-0">
                <input type="hidden" name="brandId" value={brandId} />
                <input type="hidden" name="groupId" value={g.id} />
                <Field label="Option" name="name"><TextInput name="name" required /></Field>
                <Field label="Code" name="code"><TextInput name="code" required /></Field>
                <Field label="Price (KES)" name="priceMinor"><TextInput name="price" inputMode="decimal" placeholder="0" /></Field>
                <Field label="Ingredient" name="ingredientId">
                  <SelectInput name="ingredientId" options={[{ value: "", label: "—" }, ...d.ingredients.map((i) => ({ value: i.id, label: i.name }))]} />
                </Field>
                <Field label="3D key" name="visualKey"><TextInput name="visualKey" placeholder="pepperoni" /></Field>
                <Field label="Colour" name="color"><TextInput name="color" placeholder="#a8321f" /></Field>
                <div className="col-span-2 flex items-end"><Submit variant="secondary">Add option</Submit></div>
              </ActionForm>
            </div>
          ))}
        </div>
        <ActionForm action={upsertOptionGroupAction} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-5 sm:items-end sm:space-y-0">
          <input type="hidden" name="brandId" value={brandId} />
          <Field label="New group" name="name"><TextInput name="name" required /></Field>
          <Field label="Code" name="code"><TextInput name="code" required /></Field>
          <Field label="Kind" name="kind"><SelectInput name="kind" options={["crust", "sauce", "cheese", "topping", "extra"].map((k) => ({ value: k, label: k }))} /></Field>
          <Field label="Min–max" name="maxSelect"><div className="flex gap-1"><TextInput name="minSelect" defaultValue="0" inputMode="numeric" /><TextInput name="maxSelect" defaultValue="1" inputMode="numeric" /></div></Field>
          <Submit variant="secondary">Add group</Submit>
        </ActionForm>
      </Section>

      <Section title="Ingredients & allergens" description="Allergens roll up from ingredients to every product and option that uses them.">
        <Table head={["Ingredient", "Unit", "Diet", "Allergens"]}>
          {d.ingredients.map((i) => (
            <tr key={i.id}>
              <td>{i.name} <span className="font-mono text-xs text-muted-foreground">{i.code}</span></td>
              <td>{i.unit}</td>
              <td className="text-xs">{i.isVegan ? "Vegan" : i.isVegetarian ? "Vegetarian" : "Contains meat/fish"}</td>
              <td className="text-xs">{d.ingAllergens.filter((a) => a.ingredientId === i.id).map((a) => catalogue.ALLERGENS[a.allergenCode as catalogue.AllergenCode]).join(", ") || "—"}</td>
            </tr>
          ))}
        </Table>
        <ActionForm action={upsertIngredientAction} className="mt-3 max-w-3xl rounded-lg border p-3">
          <input type="hidden" name="brandId" value={brandId} />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Ingredient" name="name"><TextInput name="name" required /></Field>
            <Field label="Code" name="code"><TextInput name="code" required /></Field>
            <Field label="Unit" name="unit"><SelectInput name="unit" options={[{ value: "g", label: "grams" }, { value: "ml", label: "ml" }, { value: "each", label: "each" }]} /></Field>
            <div className="flex items-end gap-3 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" name="isVegetarian" defaultChecked /> Veg</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="isVegan" /> Vegan</label>
            </div>
          </div>
          <fieldset className="mt-3">
            <legend className="mb-1 text-sm font-medium">Allergens</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {Object.entries(catalogue.ALLERGENS).map(([code, name]) => (
                <label key={code} className="flex items-center gap-1"><input type="checkbox" name="allergens" value={code} /> {name}</label>
              ))}
            </div>
          </fieldset>
          <Submit variant="secondary" className="mt-3">Save ingredient</Submit>
        </ActionForm>
      </Section>
    </>
  );
}
