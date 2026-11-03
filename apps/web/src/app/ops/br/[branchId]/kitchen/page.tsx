import { notFound } from "next/navigation";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch } from "@/server/ops/context";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { KitchenBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/kitchen`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "kitchen.ticket.update", scope)) notFound();
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{b.name} · Kitchen</h1>
      </div>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <KitchenBoard branchId={branchId} canCancel={rbac.can(s.actor, "order.manage", scope)} />
    </>
  );
}
