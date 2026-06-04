import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAttendanceTrend, getDashboardStats, getRevenueTrend } from "@/lib/aerogym/analytics.functions";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import type { LucideIcon } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ClipboardList,
  Dumbbell,
  Percent,
  Plus,
  QrCode,
  Receipt,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - AeroGym OS" }] }),
  component: Dashboard,
});

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  checkInsToday: number;
  expiringSoon: number;
  activeLeads: number;
  conversionRate: number;
  monthRevenueCents: number;
  revenueDelta: number;
  pendingInvoices: number;
  collectionRate: number;
}

interface RevenuePoint {
  date: string;
  revenue: number;
}

interface AttendancePoint {
  date: string;
  count: number;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  price_cents: number;
  active: boolean;
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(cents / 100);
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

async function fetchPlans() {
  const { data, error } = await supabase
    .from("membership_plans")
    .select("id,name,description,duration_days,price_cents,active")
    .eq("active", true)
    .order("duration_days", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Plan[];
}

function Dashboard() {
  const me = useCurrentUser();
  const stats = useServerFn(getDashboardStats);
  const rev = useServerFn(getRevenueTrend);
  const att = useServerFn(getAttendanceTrend);
  const s = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => stats() });
  const r = useQuery({ queryKey: ["revenue-30"], queryFn: () => rev() });
  const a = useQuery({ queryKey: ["attendance-14"], queryFn: () => att() });

  if (me.loading) return <DashboardLoading />;

  const dashboardStats = s.data as DashboardStats | undefined;
  const revenue = (r.data ?? []) as RevenuePoint[];
  const attendance = (a.data ?? []) as AttendancePoint[];

  return me.isAdmin ? (
    <AdminDashboard stats={dashboardStats} revenue={revenue} attendance={attendance} />
  ) : (
    <FrontDeskDashboard stats={dashboardStats} attendance={attendance} />
  );
}

function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-16 max-w-md animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}

function AdminDashboard({ stats: d, revenue, attendance }: { stats?: DashboardStats; revenue: RevenuePoint[]; attendance: AttendancePoint[] }) {
  const plans = useQuery({ queryKey: ["membership-plans"], queryFn: fetchPlans });

  return (
    <div className="space-y-8">
      <DashboardHeader title="Admin command center" subtitle="Revenue, growth, collection health, and staff controls." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total members" value={d?.totalMembers ?? "-"} icon={Users} tone="primary" hint={`${d?.activeMembers ?? 0} active`} />
        <StatCard label="Monthly revenue" value={d ? fmtMoney(d.monthRevenueCents) : "-"} delta={d?.revenueDelta} icon={Wallet} tone="success" />
        <StatCard label="Conversion rate" value={d ? `${d.conversionRate.toFixed(1)}%` : "-"} icon={Percent} tone="secondary" />
        <StatCard label="Collection rate" value={d ? `${d.collectionRate.toFixed(0)}%` : "-"} icon={TrendingUp} tone="success" />
        <StatCard label="Pending invoices" value={d?.pendingInvoices ?? "-"} icon={Receipt} tone="warning" />
        <StatCard label="Active leads" value={d?.activeLeads ?? "-"} icon={UserPlus} tone="secondary" />
        <StatCard label="Expiring soon" value={d?.expiringSoon ?? "-"} icon={AlertTriangle} tone="warning" hint="Next 7 days" />
        <StatCard label="Check-ins today" value={d?.checkInsToday ?? "-"} icon={QrCode} tone="info" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelTitle title="Revenue - last 30 days" subtitle="Daily collected payments" />
          <RevenueChart data={revenue} />
        </Panel>

        <Panel>
          <h3 className="mb-4 text-sm font-semibold">Admin controls</h3>
          <div className="space-y-3">
            <PlanManager plans={plans.data ?? []} loading={plans.isLoading} error={plans.error instanceof Error ? plans.error.message : ""} />
            <ActionLink to="/employees" icon={ShieldCheck} label="Manage employees" hint="Roles and access" />
            <ActionLink to="/audit" icon={ClipboardList} label="Review audit logs" hint="Sensitive activity" />
            <ActionLink to="/billing" icon={Banknote} label="Inspect collections" hint="Invoices and payments" />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelTitle title="Attendance - last 14 days" subtitle="Daily check-ins" />
          <AttendanceChart data={attendance} />
        </Panel>
        <HealthItem label="Revenue risk" value={d?.pendingInvoices ?? 0} hint="pending invoices" icon={Receipt} tone="warning" />
        <HealthItem label="Retention watch" value={d?.expiringSoon ?? 0} hint="members expiring soon" icon={AlertTriangle} tone="warning" />
      </section>
    </div>
  );
}

function PlanManager({ plans, loading, error }: { plans: Plan[]; loading: boolean; error: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const createPlan = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      const days = Number.parseInt(durationDays, 10);
      const rupees = Number.parseFloat(price);

      if (!cleanName) throw new Error("Plan name is required");
      if (!Number.isFinite(days) || days <= 0) throw new Error("Duration must be at least 1 day");
      if (!Number.isFinite(rupees) || rupees < 0) throw new Error("Price must be 0 or more");

      const { error: insertError } = await supabase.from("membership_plans").insert({
        name: cleanName,
        description: description.trim() || null,
        duration_days: days,
        price_cents: Math.round(rupees * 100),
        active: true,
      });

      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["membership-plans"] });
      setName("");
      setDurationDays("");
      setPrice("");
      setDescription("");
      setOpen(false);
      toast.success("Plan added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add plan"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    createPlan.mutate();
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Membership plans</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">New plans appear when adding members.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 gap-1">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add membership plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="plan-name">Plan name</Label>
                <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly Pro" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="plan-duration">Duration days</Label>
                  <Input id="plan-duration" type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="30" required />
                </div>
                <div>
                  <Label htmlFor="plan-price">Price (INR)</Label>
                  <Input id="plan-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1500" required />
                </div>
              </div>
              <div>
                <Label htmlFor="plan-description">Description</Label>
                <Textarea id="plan-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Access details or plan notes" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createPlan.isPending} className="gradient-primary text-primary-foreground">
                  {createPlan.isPending ? "Saving..." : "Save plan"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading plans...</p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : plans.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active plans yet.</p>
        ) : (
          plans.slice(0, 4).map((plan) => (
            <div key={plan.id} className="flex items-center justify-between gap-3 rounded-md bg-muted px-2.5 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{plan.name}</p>
                <p className="text-[11px] text-muted-foreground">{plan.duration_days} days</p>
              </div>
              <span className="shrink-0 text-xs font-semibold">{fmtMoney(plan.price_cents)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FrontDeskDashboard({ stats: d, attendance }: { stats?: DashboardStats; attendance: AttendancePoint[] }) {
  return (
    <div className="space-y-8">
      <DashboardHeader title="Front desk workspace" subtitle="Today's check-ins, follow-ups, renewals, and payment tasks." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Check-ins today" value={d?.checkInsToday ?? "-"} icon={QrCode} tone="info" />
        <StatCard label="Expiring soon" value={d?.expiringSoon ?? "-"} icon={CalendarClock} tone="warning" hint="Renewal calls" />
        <StatCard label="Active leads" value={d?.activeLeads ?? "-"} icon={UserPlus} tone="secondary" hint="Needs follow-up" />
        <StatCard label="Pending invoices" value={d?.pendingInvoices ?? "-"} icon={Receipt} tone="warning" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelTitle title="Daily actions" subtitle="Common tasks for the counter team" />
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionLink to="/attendance" icon={QrCode} label="Check in member" hint="Scan or search member" />
            <ActionLink to="/members" icon={UserCheck} label="Add member" hint="Create membership record" />
            <ActionLink to="/leads" icon={UserPlus} label="Capture lead" hint="Walk-in or call inquiry" />
            <ActionLink to="/billing" icon={Receipt} label="Record payment" hint="Cash, card, UPI, bank" />
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-4 text-sm font-semibold">Counter queue</h3>
          <QueueItem icon={CalendarClock} label="Renewals due" value={d?.expiringSoon ?? 0} />
          <QueueItem icon={UserPlus} label="Lead follow-ups" value={d?.activeLeads ?? 0} />
          <QueueItem icon={Receipt} label="Payment reminders" value={d?.pendingInvoices ?? 0} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelTitle title="Attendance rhythm" subtitle="Last 14 days at the front desk" />
          <AttendanceChart data={attendance} />
        </Panel>
        <Panel>
          <h3 className="mb-4 text-sm font-semibold">Shift focus</h3>
          <div className="space-y-3">
            <FocusRow label="Greet and check in members" done={Boolean((d?.checkInsToday ?? 0) > 0)} />
            <FocusRow label="Call expiring memberships" done={(d?.expiringSoon ?? 0) === 0} />
            <FocusRow label="Clear pending payments" done={(d?.pendingInvoices ?? 0) === 0} />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">{todayLabel()}</div>
    </header>
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-lg border border-border bg-card p-5 ${className ?? ""}`}>{children}</div>;
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ActionLink({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <Button asChild variant="outline" className="h-auto w-full justify-start gap-3 rounded-lg p-4 text-left">
      <Link to={to}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
        </span>
      </Link>
    </Button>
  );
}

function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
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
  );
}

function AttendanceChart({ data }: { data: AttendancePoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickFormatter={(d) => d.slice(5)} />
          <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
          <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
          <Bar dataKey="count" fill="var(--color-secondary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HealthItem({ label, value, hint, icon: Icon, tone }: { label: string; value: number; hint: string; icon: LucideIcon; tone: "warning" | "success" }) {
  const colors = tone === "warning" ? "bg-warning/12 text-warning" : "bg-success/12 text-success";
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          <div className="mt-6 text-3xl font-semibold tracking-tight">{value}</div>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${colors}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Panel>
  );
}

function QueueItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm">{label}</span>
      </div>
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">{value}</span>
    </div>
  );
}

function FocusRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <span className={`grid h-6 w-6 place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
        <ShieldCheck className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}
