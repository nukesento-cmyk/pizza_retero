import { cn } from "@/lib/utils";

/** Kitchen/delivery status colours. Colour only carries status in ops (DESIGN_SYSTEM §7). */
export const STATUS_STYLE = {
  NEW: "bg-crust text-espresso",
  ACCEPTED: "border-2 border-espresso text-espresso bg-transparent dark:border-dough dark:text-dough",
  PREPARING: "bg-basil text-flour",
  BAKING: "bg-oven text-espresso",
  READY: "bg-sauce text-flour",
  OUT_FOR_DELIVERY: "bg-espresso text-dough dark:bg-dough dark:text-espresso",
  COMPLETED: "bg-tile text-espresso/70",
  DELIVERED: "bg-tile text-espresso/70",
  COLLECTED: "bg-tile text-espresso/70",
} as const;

export type StatusKey = keyof typeof STATUS_STYLE;

export function StatusChip({ status, className }: { status: StatusKey; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded px-2 font-mono text-[11px] font-medium uppercase tracking-wider", STATUS_STYLE[status], className)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
