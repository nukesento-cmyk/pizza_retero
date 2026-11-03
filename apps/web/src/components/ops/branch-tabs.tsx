import Link from "next/link";
import { rbac } from "@retero/core";

/** Branch sub-navigation; links shown per permission (cosmetic — server enforces). */
export function BranchTabs({ branchId, actor, scope }: { branchId: string; actor: rbac.Actor; scope: rbac.ResourceScope }) {
  const tabs = [
    { href: `/ops/br/${branchId}`, label: "Branch", p: "branch.read" },
    { href: `/ops/br/${branchId}/kitchen`, label: "Kitchen", p: "kitchen.ticket.update" },
    { href: `/ops/br/${branchId}/orders`, label: "Orders", p: "order.read" },
    { href: `/ops/br/${branchId}/assisted`, label: "WhatsApp orders", p: "order.manage" },
    { href: `/ops/br/${branchId}/menu`, label: "Menu", p: "branch.menu.manage" },
    { href: `/ops/br/${branchId}/inventory`, label: "Inventory", p: "inventory.read" },
    { href: `/ops/br/${branchId}/delivery`, label: "Delivery", p: "delivery.read" },
    { href: `/ops/br/${branchId}/zones`, label: "Zones", p: "branch.update" },
    { href: `/ops/br/${branchId}/reports`, label: "Reports", p: "report.read" },
  ].filter((t) => rbac.can(actor, t.p as rbac.Permission, scope));
  return (
    <nav aria-label="Branch sections" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => <Link key={t.href} href={t.href as never} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm hover:border-primary">{t.label}</Link>)}
    </nav>
  );
}
