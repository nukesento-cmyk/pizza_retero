import { notFound } from "next/navigation";
import { catalogue, rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { branchScope, loadBranch, readAs } from "@/server/ops/context";
import { PageHeader } from "@/components/ops/kit";
import { BranchTabs } from "@/components/ops/branch-tabs";
import { Assisted } from "./assisted";

export const dynamic = "force-dynamic";

/** WhatsApp / phone orders, entered by staff through the same commerce engine. */
export default async function AssistedPage({ params, searchParams }: { params: Promise<{ branchId: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { branchId } = await params;
  const s = await requireUser(`/ops/br/${branchId}/assisted`);
  const b = await loadBranch(s, branchId);
  const scope = branchScope(b);
  if (!rbac.can(s.actor, "order.manage", scope)) notFound();
  const menu = await readAs(s, (tx) => catalogue.getBranchMenu(tx, branchId));
  return (
    <>
      <PageHeader title="WhatsApp & phone orders" kicker={b.name}>Open the customer&apos;s cart from the reference in their WhatsApp message, or start a new one. Prices come from the same engine as the website.</PageHeader>
      <BranchTabs branchId={branchId} actor={s.actor} scope={scope} />
      <Assisted branchId={branchId} menu={catalogue.serializeMenu(menu)} initialRef={(await searchParams).ref ?? ""} offersDelivery={b.offersDelivery} />
    </>
  );
}
