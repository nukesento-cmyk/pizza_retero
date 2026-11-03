import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Ops UI kit: dense, calm, keyboard-friendly (DESIGN_SYSTEM §7). */

export function PageHeader({ title, kicker, actions, children }: { title: string; kicker?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div>
        {kicker ? <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{kicker}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, children, aside }: { title: string; description?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Panel({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border bg-card p-4", className)} {...p} />;
}

export const inputCls =
  "block h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function TextInput(p: ComponentProps<"input">) {
  return <input {...p} className={cn(inputCls, p.className)} />;
}

export function SelectInput({ options, ...p }: ComponentProps<"select"> & { options: readonly { value: string; label: string }[] }) {
  return (
    <select {...p} className={cn(inputCls, "pr-8", p.className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Btn({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-sauce-deep",
        variant === "secondary" && "border bg-background hover:bg-muted",
        variant === "ghost" && "hover:bg-muted",
        variant === "danger" && "border border-destructive/40 text-destructive hover:bg-destructive/10",
        className,
      )}
    />
  );
}

export function LinkBtn({ className, ...p }: ComponentProps<typeof Link>) {
  return <Link {...p} className={cn("inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted", className)} />;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t">{children}</tbody>
      </table>
      {rows === 0 && empty ? <p className="p-4 text-sm text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-basil/15 text-basil border-basil/30",
  pending: "bg-crust/20 text-espresso border-crust/40",
  suspended: "bg-sauce/10 text-sauce-deep border-sauce/30",
  closed: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function Status({ value }: { value: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium uppercase tracking-wider", STATUS_TONE[value] ?? "bg-muted")}>{value}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
