import { cn } from "@/lib/utils";

/** The brand name as a lit sign. Name comes from the tenant, never hardcoded. */
export function Wordmark({ name, className, lit = true }: { name: string; className?: string; lit?: boolean }) {
  return (
    <span
      className={cn(
        "font-display leading-[0.9] tracking-tight",
        lit ? "neon-sign motion-safe:animate-flicker" : "text-sauce",
        className,
      )}
    >
      {name}
    </span>
  );
}
