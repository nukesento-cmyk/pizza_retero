import { cn } from "@/lib/utils";

export function Stripes({ className }: { className?: string }) {
  return <div aria-hidden className={cn("sunburst-stripes h-6 w-full", className)} />;
}
