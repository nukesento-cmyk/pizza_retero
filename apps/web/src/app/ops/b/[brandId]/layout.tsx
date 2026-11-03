import Link from "next/link";
import type { ReactNode } from "react";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { loadBrand } from "@/server/ops/context";
import { Status } from "@/components/ops/kit";

export default async function BrandLayout({ children, params }: { children: ReactNode; params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}`);
  const brand = await loadBrand(s, brandId);
  const scope = { level: "brand", brandId } as const;
  const tabs = [
    { href: `/ops/b/${brandId}`, label: "Overview", show: true },
    { href: `/ops/b/${brandId}/menu`, label: "Menu", show: rbac.can(s.actor, "catalogue.manage", scope) },
    { href: `/ops/b/${brandId}/staff`, label: "Staff", show: rbac.can(s.actor, "staff.read", scope) },
    { href: `/ops/b/${brandId}/domains`, label: "Domains", show: rbac.can(s.actor, "domain.manage", scope) },
    { href: `/ops/b/${brandId}/settings`, label: "Settings", show: rbac.can(s.actor, "brand.settings.update", scope) },
  ].filter((t) => t.show);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Brand</p>
        <h1 className="text-lg font-semibold">{brand.name}</h1>
        <Status value={brand.status} />
      </div>
      <nav aria-label="Brand sections" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => <Link key={t.href} href={t.href as never} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm hover:border-primary">{t.label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
