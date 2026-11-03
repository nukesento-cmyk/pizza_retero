import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "sauce" | "crust" | "basil" | "flour";

const TONE: Record<Tone, string> = {
  sauce: "bg-sauce text-flour [--enamel-fill:var(--color-sauce)] hover:bg-sauce-deep",
  crust: "bg-crust text-espresso [--enamel-fill:var(--color-crust)] hover:bg-[#d8932e]",
  basil: "bg-basil text-flour [--enamel-fill:var(--color-basil)] hover:bg-[#245742]",
  flour: "bg-flour text-espresso [--enamel-fill:var(--color-flour)] hover:bg-dough",
};

const base =
  "enamel inline-flex items-center justify-center gap-2 px-6 py-3 font-menu text-lg font-semibold " +
  "transition-[transform,box-shadow,background-color] duration-150 ease-arrive " +
  "hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-print-sm " +
  "disabled:opacity-50 disabled:pointer-events-none";

/** Primary storefront call to action: an enamel shop sign you can press. */
export function EnamelLink({ tone = "sauce", className, ...props }: ComponentProps<typeof Link> & { tone?: Tone }) {
  return <Link className={cn(base, TONE[tone], className)} {...props} />;
}

export function EnamelButton({ tone = "sauce", className, ...props }: ComponentProps<"button"> & { tone?: Tone }) {
  return <button className={cn(base, TONE[tone], className)} {...props} />;
}
