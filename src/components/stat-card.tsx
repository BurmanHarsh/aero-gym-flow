import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  icon: LucideIcon;
  tone?: "primary" | "secondary" | "success" | "warning" | "info";
  hint?: string;
}

const TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "from-primary/20 to-primary/0 text-primary",
  secondary: "from-secondary/20 to-secondary/0 text-secondary",
  success: "from-success/20 to-success/0 text-success",
  warning: "from-warning/20 to-warning/0 text-warning",
  info: "from-info/20 to-info/0 text-info",
};

export function StatCard({ label, value, delta, icon: Icon, tone = "primary", hint }: StatCardProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-60", TONE[tone])} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={cn("grid h-10 w-10 place-items-center rounded-xl bg-background/60 backdrop-blur", TONE[tone].split(" ").pop())}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {delta !== undefined && (
        <div className="relative mt-4 flex items-center gap-1 text-xs">
          <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium", up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs last period</span>
        </div>
      )}
    </div>
  );
}
