"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { riderAction } from "@/app/ops/ops-actions";

/** Big touch targets for riders; attaches location to the delivery event when allowed. */
export function RiderButtons({ assignmentId, branchId, status, orderReady }: { assignmentId: string; branchId: string; status: string; orderReady: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "pick_up" | "deliver") {
    setBusy(true);
    const pos = await new Promise<GeolocationPosition | null>((res) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 5000 }) : res(null)));
    const fd = new FormData();
    fd.set("assignmentId", assignmentId); fd.set("branchId", branchId); fd.set("action", action);
    if (pos) { fd.set("lat", String(pos.coords.latitude)); fd.set("lng", String(pos.coords.longitude)); }
    const r = await riderAction(null, fd);
    setMsg(r && !r.ok ? r.message : null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-3">
      {status === "assigned" ? (
        <button type="button" disabled={busy || !orderReady} onClick={() => act("pick_up")} className="h-11 w-full rounded-md bg-primary font-semibold text-primary-foreground disabled:opacity-50">
          {orderReady ? (busy ? "…" : "Picked up") : "Waiting for the kitchen"}
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => act("deliver")} className="h-11 w-full rounded-md bg-basil font-semibold text-flour disabled:opacity-50">{busy ? "…" : "Delivered"}</button>
      )}
      {msg ? <p role="alert" className="mt-1 text-xs text-destructive">{msg}</p> : null}
    </div>
  );
}
