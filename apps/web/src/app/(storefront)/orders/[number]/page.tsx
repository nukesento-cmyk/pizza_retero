import type { Metadata } from "next";
import { Stripes } from "@/components/retero/stripes";
import { Tracker } from "./tracker";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number } = await params;
  const { t } = await searchParams;
  return (
    <main className="dark grain min-h-dvh bg-char text-dough">
      <Stripes className="h-2" />
      <div className="relative z-10 mx-auto max-w-xl px-4 py-10">
        <Tracker number={number} token={t ?? ""} />
      </div>
    </main>
  );
}
