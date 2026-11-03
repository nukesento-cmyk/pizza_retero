import type { Metadata } from "next";
import { getBrandPublic, getTenant } from "@/server/tenant";
import { NoStorefront } from "@/components/retero/no-storefront";
import { StaticStorefront } from "@/components/storefront/static-storefront";
import { KitchenExperience } from "@/kitchen/KitchenExperience";
import type { StorefrontData } from "@/kitchen/ui/panels";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  if (!t) return { title: "Closed", robots: { index: false } };
  const title = t.branch ? `${t.brand.name} ${t.branch.name}` : t.brand.name;
  return {
    title: { absolute: title },
    description: `Walk through the ${t.brand.name} kitchen and build your pizza, station by station.`,
    alternates: t.canonicalHost ? { canonical: `https://${t.canonicalHost}/` } : undefined,
    robots: t.matchedBy === "dev-fallback" ? { index: false } : undefined,
  };
}

export default async function StorefrontHome() {
  const tenant = await getTenant();
  if (!tenant) return <NoStorefront />;

  const { settings, branches } = await getBrandPublic(tenant.brand.id);
  const shown = tenant.branch ? branches.filter((b) => b.id === tenant.branch!.id) : branches;
  const data: StorefrontData = {
    brand: tenant.brand.name,
    branchName: tenant.branch?.name ?? null,
    cities: [...new Set(shown.map((b) => b.city))],
    whatsapp: settings?.whatsappNumber ?? null,
    branches: shown,
  };
  const wa = data.whatsapp ? whatsappLink(data.whatsapp, `Hi ${data.brand}! I'd like to place an order.`) : null;

  return (
    <main>
      <KitchenExperience data={data} fallback={<StaticStorefront data={data} wa={wa} />} />
      <noscript>
        <StaticStorefront data={data} wa={wa} />
      </noscript>
    </main>
  );
}
