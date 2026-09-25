import { cn } from "@/lib/cn";

export function Badge({ children, tone = "blue", className }: { children: React.ReactNode; tone?: "blue" | "success" | "warning" | "neutral"; className?: string }) {
  return <span className={cn(
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold",
    tone === "blue" && "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]",
    tone === "success" && "bg-emerald-50 text-emerald-800",
    tone === "warning" && "bg-amber-50 text-amber-800",
    tone === "neutral" && "bg-[var(--surface-subtle)] text-[var(--text-secondary)]",
    className,
  )}>{children}</span>;
}
