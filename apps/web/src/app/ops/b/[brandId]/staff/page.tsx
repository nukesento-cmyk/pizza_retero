import { requireUser } from "@/server/auth/session";
import { loadBrand } from "@/server/ops/context";
import { StaffPanel } from "@/components/ops/staff-panel";

export const dynamic = "force-dynamic";

export default async function BrandStaff({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const s = await requireUser(`/ops/b/${brandId}/staff`);
  await loadBrand(s, brandId);
  return <StaffPanel session={s} scope={{ level: "brand", brandId }} filter={{ brandId }} returnTo={`/ops/b/${brandId}/staff`} />;
}
