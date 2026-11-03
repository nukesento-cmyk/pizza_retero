import { cn } from "@/lib/utils";

/** Order-ticket surface: cart, quotes, receipts, kitchen tickets. */
export function Ticket({ children, className, heading }: { children: React.ReactNode; className?: string; heading?: string }) {
  return (
    <div className={cn("ticket shadow-[0_10px_30px_-12px_rgba(42,26,19,.45)] px-5 pt-4", className)}>
      {heading ? (
        <div className="mb-3 flex items-center justify-between border-b border-dashed border-espresso/40 pb-2 text-xs uppercase tracking-[0.2em]">
          <span>{heading}</span>
          <span aria-hidden>✱</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
