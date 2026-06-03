import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats, getRevenueTrend, getAttendanceTrend } from "@/lib/aerogym/analytics.functions";
import { StatCard } from "@/components/stat-card";
import { Users, QrCode, TrendingUp, AlertTriangle, UserPlus, Wallet, Receipt, Percent } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · AeroGym OS" }] }),
  component: Dashboard,
});

function fmtMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(cents / 100);
}

function Dashboard() {
  const stats = useServerFn(getDashboardStats);
  const rev = useServerFn(getRevenueTrend);
  const att = useServerFn(getAttendanceTrend);
  const s = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => stats() });
  const r = useQuery({ queryKey: ["revenue-30"], queryFn: () => rev() });
  const a = useQuery({ queryKey: ["attendance-14"], queryFn: () => att() });

  const d = s.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Overview</h1>
          <p className="text-sm text-muted-foreground">Live snapshot of your gym's performance.</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total members" value={d?.totalMembers ?? "—"} icon={Users} tone="primary" hint={`${d?.activeMembers ?? 0} active`} />
        <StatCard label="Check-ins today" value={d?.checkInsToday ?? "—"} icon={QrCode} tone="info" />
        <StatCard label="Monthly revenue" value={d ? fmtMoney(d.monthRevenueCents) : "—"} delta={d?.revenueDelta} icon={Wallet} tone="success" />
        <StatCard label="Expiring (7 days)" value={d?.expiringSoon ?? "—"} icon={AlertTriangle} tone="warning" />
        <StatCard label="Active leads" value={d?.activeLeads ?? "—"} icon={UserPlus} tone="secondary" />
        <StatCard label="Conversion rate" value={d ? `${d.conversionRate.toFixed(1)}%` : "—"} icon={Percent} tone="secondary" />
        <StatCard label="Pending invoices" value={d?.pendingInvoices ?? "—"} icon={Receipt} tone="warning" />
        <StatCard label="Collection rate" value={d ? `${d.collectionRate.toFixed(0)}%` : "—"} icon={TrendingUp} tone="success" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h3 className="text-sm font-semibold">Revenue · last 30 days</h3>
              <p className="text-xs text-muted-foreground">Daily collected payments</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={r.data ?? []}>
                <defs>
                  <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} fill="url(#grad-rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold">Attendance · last 14 days</h3>
          <p className="mb-4 text-xs text-muted-foreground">Daily check-ins</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="count" fill="var(--color-secondary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
