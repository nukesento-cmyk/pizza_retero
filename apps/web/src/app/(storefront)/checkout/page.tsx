import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, eq, schema, withActor } from "@retero/db";
import { db } from "@/server/db";
import { getTenant } from "@/server/tenant";
import { NoStorefront } from "@/components/retero/no-storefront";
import { Stripes } from "@/components/retero/stripes";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) return <NoStorefront />;
  const sp = await searchParams;
  const branches = await withActor(db(), null, (tx) => tx.select({ id: schema.branches.id, name: schema.branches.name, offersDelivery: schema.branches.offersDelivery, offersCollection: schema.branches.offersCollection, phone: schema.branches.phone })
    .from(schema.branches).where(and(eq(schema.branches.brandId, tenant.brand.id), eq(schema.branches.status, "active"))).orderBy(asc(schema.branches.name)));
  const branch = branches.find((b) => b.id === (sp.branch ?? tenant.branch?.id)) ?? (branches.length === 1 ? branches[0] : undefined);
  if (!branch) redirect("/menu" as never);
  return (
    <main className="grain min-h-dvh bg-dough text-espresso">
      <Stripes className="h-2" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <a href={`/menu?branch=${branch.id}`} className="font-mono text-xs uppercase tracking-widest text-sauce">← Back to the menu</a>
        <h1 className="mt-2 font-menu text-4xl font-semibold">Your order</h1>
        <p className="text-espresso/70">{tenant.brand.name} · {branch.name}</p>
        <Checkout branch={branch} />
      </div>
    </main>
  );
}
