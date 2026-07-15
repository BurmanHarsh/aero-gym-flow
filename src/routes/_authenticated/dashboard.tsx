import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getAttendanceTrend, getDashboardStats, getRevenueTrend } from "@/lib/aerogym/analytics.functions";
import { autoExpireMemberships, sendExpiryReminders, createExpiryNotifications } from "@/lib/aerogym/gym.functions";
import { sendMemberSupportEmail } from "@/lib/aerogym/email.functions";
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
  Archive,
  Banknote,
  Calendar,
  CalendarClock,
  ClipboardList,
  Dumbbell,
  Percent,
  Plus,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  UserMinus,
  Users,
  Wallet,
  Megaphone,
  Package,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - Tank by Tapan" }] }),
  component: Dashboard,
});

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  expiredMembers: number;
  newRegistrations: number;
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
  photo_url?: string | null;
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
    .select("id,name,description,duration_days,price_cents,active,photo_url")
    .eq("active", true)
    .order("duration_days", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Plan[];
}

function Dashboard() {
  const me = useCurrentUser();
  const stats = useServerFn(getDashboardStats);
  const att = useServerFn(getAttendanceTrend);
  const expireFn = useServerFn(autoExpireMemberships);
  const reminderFn = useServerFn(sendExpiryReminders);
  const expiryNotifFn = useServerFn(createExpiryNotifications);
  const s = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => stats() });
  const a = useQuery({ queryKey: ["attendance-14"], queryFn: () => att() });

  // Run auto-expiry + reminder emails once per day per browser session
  useEffect(() => {
    if (typeof window === "undefined") return;
    const today = new Date().toISOString().slice(0, 10);
    const lastRun = localStorage.getItem("tbt_daily_tasks");
    if (lastRun === today) return;
    localStorage.setItem("tbt_daily_tasks", today);
    // Run silently so it doesn't block the dashboard render
    expireFn().then((res) => {
        if (res && res.expired > 0) {
          console.log(`[Auto-Expire] Marked ${res.expired} memberships as expired`);
        }
      }).catch(() => {});
      reminderFn().then((res) => {
        if (res && res.sent > 0) {
          console.log(`[Reminders] Sent ${res.sent} expiry reminder emails`);
        }
      }).catch(() => {});
      expiryNotifFn().then((res) => {
        if (res && res.created > 0) {
          console.log(`[Expiry-Notifs] Created ${res.created} system notifications`);
        }
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const recentInvoicesQuery = useQuery({
    queryKey: ["recent-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, member:members(full_name, member_code)")
        .order("issued_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: me.isStaff,
  });

  if (me.loading) return <DashboardLoading />;

  const dashboardStats = s.data as DashboardStats | undefined;
  const attendance = (a.data ?? []) as AttendancePoint[];

  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      {/* Full Page Gym Image Background */}
      <div className="absolute inset-0 -mx-4 -my-6 md:-mx-8 md:-my-12 z-0 pointer-events-none overflow-hidden select-none opacity-[0.22]">
        <div 
          className="h-full w-full bg-cover bg-center md:bg-fixed" 
          style={{ backgroundImage: `url('/gym-bg.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background" />
      </div>

      <div className="relative z-10">
        {me.isAdmin ? (
          <AdminDashboard
            stats={dashboardStats}
            attendance={attendance}
            recentInvoices={recentInvoicesQuery.data ?? []}
            inflowLoading={recentInvoicesQuery.isLoading}
            onSelectPlan={setSelectedPlan}
          />
        ) : me.roles.includes("front_desk") ? (
          <FrontDeskDashboard
            stats={dashboardStats}
            attendance={attendance}
            recentInvoices={recentInvoicesQuery.data ?? []}
            inflowLoading={recentInvoicesQuery.isLoading}
          />
        ) : (
          <MemberDashboard
            user={me}
            onSelectPlan={setSelectedPlan}
            onSelectItem={setSelectedItem}
          />
        )}
      </div>

      {/* Plan Details Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={(o) => !o && setSelectedPlan(null)}>
        {selectedPlan && (
          <PlanDetailDialog
            plan={selectedPlan}
            onClose={() => setSelectedPlan(null)}
          />
        )}
      </Dialog>

      {/* Item Details Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
        {selectedItem && (
          <ItemDetailDialog
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </Dialog>
    </div>
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

function InflowList({ invoices, loading }: { invoices: any[]; loading: boolean }) {
  if (loading) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Loading inflow records...</p>;
  }
  if (invoices.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No inflow records found.</p>;
  }
  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-xs">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate">{inv.member?.full_name ?? "Walk-in Member"}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{inv.invoice_number}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Issued {new Date(inv.issued_at).toLocaleDateString()}</p>
          </div>
          <div className="text-right">
            <span className="font-bold text-foreground">Rs {(inv.total_cents / 100).toLocaleString()}</span>
            <span className={`block text-[10px] font-medium capitalize mt-0.5 ${inv.status === 'paid' ? 'text-success' : 'text-warning'}`}>{inv.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminDashboard({
  stats: d,
  attendance,
  recentInvoices,
  inflowLoading,
  onSelectPlan,
}: {
  stats: DashboardStats | undefined;
  attendance: AttendancePoint[];
  recentInvoices: any[];
  inflowLoading: boolean;
  onSelectPlan: (plan: Plan) => void;
}) {
  const me = useCurrentUser();
  const expensesQuery = useQuery({
    queryKey: ["expenses-monthly"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("expenses")
        .select("amount_cents")
        .gte("date", startOfMonth.toISOString().slice(0, 10));
      
      if (error) throw error;
      return data ?? [];
    },
    enabled: me.isAdmin,
  });

  const totalExpensesCents = (expensesQuery.data ?? []).reduce((sum, exp) => sum + exp.amount_cents, 0);
  const netProfitCents = (d?.monthRevenueCents ?? 0) - totalExpensesCents;

  const plans = useQuery({ 
    queryKey: ["membership-plans"], 
    queryFn: fetchPlans,
    enabled: me.isAdmin,
  });

  return (
    <div className="space-y-8">
      <DashboardHeader 
        title={me.isAdmin ? "Admin command center" : "Front desk portal"} 
        subtitle={me.isAdmin ? "Revenue, growth, collection health, and staff controls." : "Manage gym members, registrations, and inventory catalog."} 
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Link to="/members" className="block">
          <StatCard label="Total members" value={d?.totalMembers ?? "-"} icon={Users} tone="primary" hint={`${d?.activeMembers ?? 0} active`} />
        </Link>
        <Link to="/members" className="block">
          <StatCard label="New registrations" value={d?.newRegistrations ?? "-"} icon={UserPlus} tone="info" hint="This calendar month" />
        </Link>
        <Link to="/members" className="block">
          <StatCard label="Expired memberships" value={d?.expiredMembers ?? "-"} icon={UserMinus} tone="destructive" />
        </Link>
        {me.isAdmin ? (
          <>
            <Link to="/expenses" className="block">
              <StatCard label="Monthly revenue" value={d ? fmtMoney(d.monthRevenueCents) : "-"} delta={d?.revenueDelta} icon={Wallet} tone="success" />
            </Link>
            <Link to="/expenses" className="block">
              <StatCard label="Monthly expenses" value={expensesQuery.isLoading ? "Loading..." : fmtMoney(totalExpensesCents)} icon={Wallet} tone="warning" hint="All operating costs" />
            </Link>
            <Link to="/expenses" className="block">
              <StatCard label="Net profit" value={expensesQuery.isLoading ? "Loading..." : fmtMoney(netProfitCents)} icon={TrendingUp} tone={netProfitCents >= 0 ? "success" : "destructive"} hint="Revenue minus Expenses" />
            </Link>
            <Link to="/billing" className="block">
              <StatCard label="Collection rate" value={d ? `${d.collectionRate.toFixed(0)}%` : "-"} icon={TrendingUp} tone="success" hint="Paid vs total" />
            </Link>
            <Link to="/billing" className="block">
              <StatCard label="Pending invoices" value={d?.pendingInvoices ?? "-"} icon={Receipt} tone="warning" />
            </Link>
          </>
        ) : null}
        <Link to="/members" className="block">
          <StatCard label="Expiring soon" value={d?.expiringSoon ?? "-"} icon={AlertTriangle} tone="warning" hint="Next 7 days" />
        </Link>
        <Link to="/attendance" className="block">
          <StatCard label="Check-ins today" value={d?.checkInsToday ?? "-"} icon={QrCode} tone="info" hint="Live floor count" />
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {me.isAdmin ? (
          <>
            <Panel className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <PanelTitle title="Recent Cash Inflow" subtitle="Offline payments and registrations" />
                <Button asChild variant="ghost" size="sm" className="text-xs text-primary hover:text-primary">
                  <Link to="/billing">View all</Link>
                </Button>
              </div>
              <InflowList invoices={recentInvoices} loading={inflowLoading} />
            </Panel>

            <Panel>
              <h3 className="mb-4 text-sm font-semibold">Admin controls</h3>
              <div className="space-y-3">
                <PlanManager
                  plans={plans.data ?? []}
                  loading={plans.isLoading}
                  error={plans.error instanceof Error ? plans.error.message : ""}
                  onSelectPlan={onSelectPlan}
                />
                <BroadcastManager />
                <ActionLink to="/employees" icon={ShieldCheck} label="Manage employees" hint="Roles and access" />
                <ActionLink to="/audit" icon={ClipboardList} label="Review audit logs" hint="Sensitive activity" />
                <ActionLink to="/billing" icon={Banknote} label="Inspect collections" hint="Invoices and payments" />
              </div>
            </Panel>
          </>
        ) : (
          <>
            <Panel className="lg:col-span-2">
              <PanelTitle title="Gym Operations Overview" subtitle="Daily operations and check-in summary" />
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <h4 className="text-sm font-semibold mb-2">Members Registry</h4>
                  <p className="text-xs text-muted-foreground mb-4">Add new members, renew plans, or modify profiles.</p>
                  <Button asChild size="sm" className="w-full gradient-primary text-primary-foreground font-medium">
                    <Link to="/members">Go to Members</Link>
                  </Button>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <h4 className="text-sm font-semibold mb-2">Supplements Catalog</h4>
                  <p className="text-xs text-muted-foreground mb-4">Check catalog levels and manage items.</p>
                  <Button asChild size="sm" className="w-full gradient-primary text-primary-foreground font-medium">
                    <Link to="/inventory">Go to Inventory</Link>
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel>
              <h3 className="mb-4 text-sm font-semibold">Staff Actions</h3>
              <div className="space-y-3">
                <ActionLink to="/members" icon={Users} label="Manage Members" hint="Profiles and registrations" />
                <ActionLink to="/inventory" icon={Archive} label="Manage Inventory" hint="Supplements stock levels" />
                <ActionLink to="/settings" icon={Settings} label="Account Settings" hint="Change password and profile" />
              </div>
            </Panel>
          </>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelTitle title="Attendance - last 14 days" subtitle="Daily check-ins" />
          <AttendanceChart data={attendance} />
        </Panel>
        <div className="space-y-4">
          {me.isAdmin && (
            <HealthItem label="Revenue risk" value={d?.pendingInvoices ?? 0} hint="pending invoices" icon={Receipt} tone="warning" />
          )}
          <HealthItem label="Retention watch" value={d?.expiringSoon ?? 0} hint="members expiring soon" icon={AlertTriangle} tone="warning" />
        </div>
      </section>
    </div>
  );
}

function PlanManager({ plans, loading, error, onSelectPlan }: { plans: Plan[]; loading: boolean; error: string; onSelectPlan: (plan: Plan) => void }) {
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
        <div className="flex items-center gap-1.5 shrink-0">
          <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs">
            <Link to="/plans">Manage</Link>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 px-2 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" />
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
            <div
              key={plan.id}
              onClick={() => onSelectPlan(plan)}
              className="flex items-center justify-between gap-3 rounded-md bg-muted px-2.5 py-2 hover:bg-muted/80 cursor-pointer transition"
            >
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

function FrontDeskDashboard({
  stats: d,
  attendance,
  recentInvoices,
  inflowLoading,
}: {
  stats?: DashboardStats;
  attendance: AttendancePoint[];
  recentInvoices: any[];
  inflowLoading: boolean;
}) {
  return (
    <div className="space-y-8">
      <DashboardHeader title="Front desk workspace" subtitle="Today's check-ins, renewals, and payment tasks." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total members" value={d?.totalMembers ?? "-"} icon={Users} tone="primary" hint={`${d?.activeMembers ?? 0} active`} />
        <StatCard label="Check-ins today" value={d?.checkInsToday ?? "-"} icon={QrCode} tone="info" />
        <StatCard label="Expiring soon" value={d?.expiringSoon ?? "-"} icon={CalendarClock} tone="warning" hint="Renewal calls" />
        <StatCard label="Pending invoices" value={d?.pendingInvoices ?? "-"} icon={Receipt} tone="warning" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <PanelTitle title="Recent Cash Inflow" subtitle="Offline payments and registrations" />
            <Button asChild variant="ghost" size="sm" className="text-xs text-primary hover:text-primary">
              <Link to="/billing">View all</Link>
            </Button>
          </div>
          <InflowList invoices={recentInvoices} loading={inflowLoading} />
        </Panel>

        <Panel>
          <h3 className="mb-4 text-sm font-semibold">Counter queue</h3>
          <div className="space-y-3">
            <QueueItem icon={CalendarClock} label="Renewals due" value={d?.expiringSoon ?? 0} />
            <QueueItem icon={Receipt} label="Payment reminders" value={d?.pendingInvoices ?? 0} />
            <div className="pt-2">
              <BroadcastManager />
            </div>
          </div>
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

function MemberDashboard({
  user,
  onSelectPlan,
  onSelectItem,
}: {
  user: ReturnType<typeof useCurrentUser>;
  onSelectPlan: (plan: Plan) => void;
  onSelectItem: (item: any) => void;
}) {
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [sendingContact, setSendingContact] = useState(false);
  const sendSupportFn = useServerFn(sendMemberSupportEmail);

  const handleContactSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!contactSubject.trim() || !contactMessage.trim()) {
      toast.error("Subject and Message are required");
      return;
    }
    if (contactMessage.trim().length < 10) {
      toast.error("Message must be at least 10 characters");
      return;
    }
    setSendingContact(true);
    try {
      await sendSupportFn({
        data: {
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
        }
      });
      toast.success("Your message has been sent to the gym management!");
      setContactOpen(false);
      setContactSubject("");
      setContactMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send support request");
    } finally {
      setSendingContact(false);
    }
  };

  const memberQuery = useQuery({
    queryKey: ["member-profile", user.email],
    queryFn: async () => {
      if (!user.email) return null;
      const { data, error } = await supabase
        .from("members")
        .select("*, membership_plans(*)")
        .eq("email", user.email)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user.email,
  });

  const attendanceQuery = useQuery({
    queryKey: ["member-attendance-today", memberQuery.data?.id],
    queryFn: async () => {
      if (!memberQuery.data?.id) return null;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("member_id", memberQuery.data.id)
        .gte("check_in_at", startOfToday.toISOString())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!memberQuery.data?.id,
  });

  const supplementsQuery = useQuery({
    queryKey: ["available-supplements-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("category", "Supplements")
        .gt("quantity", 0)
        .limit(4);
      if (error) throw error;
      return data ?? [];
    },
  });

  const member = memberQuery.data;
  const todayCheckIn = attendanceQuery.data;
  const supplements = supplementsQuery.data ?? [];

  const memberInvoicesQuery = useQuery({
    queryKey: ["member-invoices", member?.id],
    queryFn: async () => {
      if (!member?.id) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*, payments(method, reference), membership_plans(name)")
        .eq("member_id", member.id)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!member?.id,
  });

  return (
    <div className="space-y-8">
      <DashboardHeader
        title={`Hello, ${user.fullName}!`}
        subtitle="Welcome back to Tank by Tapan. Here is your summary for today."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Plan Card */}
        <div
          onClick={() => {
            if (member?.membership_plans) {
              onSelectPlan(member.membership_plans as any);
            }
          }}
          className={`relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm ${member?.membership_plans ? 'cursor-pointer hover:border-primary/50 transition-all' : ''}`}
        >
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-20 w-20 rounded-full bg-primary/10 blur-xl" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Plan</h3>
          {memberQuery.isLoading ? (
            <div className="mt-4 h-16 animate-pulse bg-muted rounded" />
          ) : member ? (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-lg font-bold text-foreground">{member.membership_plans?.name || "No active plan name"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Code: <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{member.member_code}</span></p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CalendarClock className="h-4 w-4 text-primary shrink-0" />
                <span>Expires: <strong>{member.expires_at || "Never"}</strong></span>
              </div>
              <div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  member.status === "active" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${member.status === "active" ? "bg-success" : "bg-destructive"}`} />
                  {member.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col items-center justify-center text-center p-3">
              <AlertTriangle className="h-6 w-6 text-warning mb-1.5" />
              <p className="text-xs font-semibold">No profile linked</p>
              <p className="text-[10px] text-muted-foreground mt-1">Please ask staff to link your email to your profile ({user.email}).</p>
            </div>
          )}
        </div>

        {/* Check-In Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-20 w-20 rounded-full bg-secondary/10 blur-xl" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Check-in Status</h3>
          <div className="mt-3 flex flex-col justify-between h-[calc(100%-2rem)] min-h-[90px]">
            {attendanceQuery.isLoading ? (
              <div className="h-10 animate-pulse bg-muted rounded" />
            ) : todayCheckIn ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-success text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Checked In</span>
                </div>
                <p className="text-xs text-muted-foreground">In: <strong>{new Date(todayCheckIn.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></p>
                {todayCheckIn.check_out_at && (
                  <p className="text-xs text-muted-foreground">Out: <strong>{new Date(todayCheckIn.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm font-semibold">
                  <UserCheck className="h-4 w-4" />
                  <span>Not Checked In</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Go to Attendance page to check yourself in.</p>
              </div>
            )}
            <div className="pt-2">
              {member && member.status !== "active" ? (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-center text-xs text-destructive font-medium">
                  Membership inactive — renew to check in
                </div>
              ) : (
                <Button asChild size="sm" className="w-full gradient-primary text-primary-foreground shadow-glow h-8 text-xs">
                  <Link to="/attendance">Go to Check-in</Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Links Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-20 w-20 rounded-full bg-info/10 blur-xl" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
          <div className="mt-3 space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2 h-9 text-xs">
              <Link to="/inventory">
                <Archive className="h-3.5 w-3.5 text-info" />
                <span>Supplements Catalog</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2 h-9 text-xs">
              <Link to="/plans">
                <Dumbbell className="h-3.5 w-3.5 text-secondary" />
                <span>Membership Plans</span>
              </Link>
            </Button>
            <Dialog open={contactOpen} onOpenChange={setContactOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9 text-xs">
                  <Megaphone className="h-3.5 w-3.5 text-warning" />
                  <span>Contact Us / Support</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-[#111733] border-2 border-[#1f2747] text-white">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold tracking-tight text-[#14b8a6]">
                    Contact Gym Management
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleContactSubmit} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-subject" className="text-xs font-bold text-muted-foreground uppercase">
                      Subject
                    </Label>
                    <Input
                      id="contact-subject"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      placeholder="e.g. Membership Inquiry, General Feedback"
                      required
                      className="bg-background border-border text-white text-xs h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-message" className="text-xs font-bold text-muted-foreground uppercase">
                      Message
                    </Label>
                    <Textarea
                      id="contact-message"
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Describe your issue or inquiry in detail (min 10 characters)..."
                      required
                      rows={5}
                      className="bg-background border-border text-white text-xs rounded-xl resize-none"
                    />
                  </div>
                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setContactOpen(false)}
                      className="text-muted-foreground hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={sendingContact}
                      size="sm"
                      className="gradient-primary text-primary-foreground font-semibold shadow-glow px-5"
                    >
                      {sendingContact ? "Sending..." : "Send Message"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div>
        {/* Featured Supplements */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Supplements & Nutrition</h3>
              <p className="text-xs text-muted-foreground">Available at gym shop</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-primary hover:text-primary h-8">
              <Link to="/inventory">Browse Shop</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {supplementsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-12 animate-pulse bg-muted rounded-xl" />
              ))
            ) : supplements.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center col-span-2">No supplements available.</p>
            ) : (
              supplements.map((s) => (
                <div
                  key={s.id}
                  onClick={() => onSelectItem(s)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 p-2.5 hover:border-primary/40 cursor-pointer transition-all animate-in fade-in duration-100"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{s.name}</p>
                    {s.sale_price_cents && (
                      <p className="text-[11px] font-bold text-primary mt-0.5">{fmtMoney(s.sale_price_cents)}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold border uppercase tracking-wider ${
                    s.quantity > 0 
                      ? "bg-success/15 text-success border-success/20" 
                      : "bg-destructive/15 text-destructive border-destructive/20"
                  }`}>
                    {s.quantity > 0 ? "In Stock" : "Out of Stock"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold mb-4">Billing History & Receipts</h3>
        {memberInvoicesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading bills...</p>
        ) : (memberInvoicesQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 font-medium">Inv Number</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(memberInvoicesQuery.data ?? []).map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 font-mono">{inv.invoice_number}</td>
                    <td className="py-2.5">{new Date(inv.issued_at).toLocaleDateString()}</td>
                    <td className="py-2.5">{fmtMoney(inv.total_cents)}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                        inv.status === 'paid' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {inv.status === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveReceipt(inv)}
                          className="h-7 px-2.5 text-[10px]"
                        >
                          View Receipt
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!activeReceipt} onOpenChange={(o) => !o && setActiveReceipt(null)}>
        {activeReceipt && (
          <ReceiptModal invoice={activeReceipt} member={member} onClose={() => setActiveReceipt(null)} />
        )}
      </Dialog>
    </div>
  );
}

function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-black md:text-3xl tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          {todayLabel()}
        </div>
        <div className="h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-white p-0.5 shadow-sm">
          <img src="/logo.png" alt="Tank Logo" className="h-full w-full object-contain" />
        </div>
      </div>
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

function BroadcastManager() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"info" | "warning" | "success" | "reminder">("info");
  const [busy, setBusy] = useState(false);

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("notifications").insert({
      title: title.trim(),
      body: body.trim() || null,
      kind,
      user_id: null, // Global broadcast
    });

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Broadcast announcement posted successfully!");
    setTitle("");
    setBody("");
    setKind("info");
    setBusy(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto w-full justify-start gap-3 rounded-lg p-4 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Megaphone className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Broadcast Post</span>
            <span className="block text-xs font-normal text-muted-foreground">Announce to all members</span>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Broadcast Announcement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateBroadcast} className="space-y-4">
          <div>
            <Label htmlFor="dash-title">Title</Label>
            <Input
              id="dash-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gym Holiday Announcement"
              required
            />
          </div>
          <div>
            <Label htmlFor="dash-body">Message Content</Label>
            <Textarea
              id="dash-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Detail of the announcement..."
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="dash-kind">Announcement Kind</Label>
            <select
              id="dash-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
              className="w-full rounded-md border border-input bg-card py-2 px-3 text-sm outline-none transition focus:border-ring"
            >
              <option value="info">Information (Purple)</option>
              <option value="success">Success (Green)</option>
              <option value="warning">Warning (Yellow)</option>
              <option value="reminder">Reminder (Blue)</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground w-full">
              {busy ? "Publishing..." : "Broadcast to All Members"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptModal({ invoice, member, onClose }: { invoice: any; member: any; onClose: () => void }) {
  const payment = invoice.payments?.[0];
  const description = invoice.membership_plans?.name ?? "Gym Membership";

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const receiptDate = new Date(invoice.paid_at || invoice.issued_at).toLocaleString();
    const total = `Rs ${(invoice.total_cents / 100).toLocaleString()}`;
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${invoice.invoice_number} - Tank by Tapan</title>
          <style>
            body { font-family: ui-sans-serif, system-ui, sans-serif; background: #fff; color: #111; padding: 32px; max-width: 380px; margin: 0 auto; }
            h1 { font-size: 18px; font-weight: 800; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
            .sub { font-size: 11px; text-align: center; color: #666; margin-bottom: 20px; }
            .divider { border-top: 1px dashed #ccc; margin: 12px 0; }
            .row { display: flex; justify-content: space-between; font-size: 12px; margin: 6px 0; }
            .label { color: #666; }
            .value { font-weight: 600; }
            .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; margin-top: 12px; padding-top: 10px; border-top: 2px solid #111; }
            .total-row .value { color: #0d9488; }
            .footer { text-align: center; font-size: 10px; color: #888; margin-top: 20px; text-transform: uppercase; letter-spacing: 1px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Tank by Tapan</h1>
          <div class="sub">Payment Receipt</div>
          <div class="divider"></div>
          <div class="row"><span class="label">Receipt No:</span><span class="value">${invoice.invoice_number}</span></div>
          <div class="row"><span class="label">Date:</span><span class="value">${receiptDate}</span></div>
          <div class="row"><span class="label">Member:</span><span class="value">${member?.full_name ?? "—"}</span></div>
          <div class="row"><span class="label">Member Code:</span><span class="value">${member?.member_code ?? "—"}</span></div>
          <div class="divider"></div>
          <div class="row"><span class="label">Description:</span><span class="value">${description}</span></div>
          ${payment ? `<div class="row"><span class="label">Payment Mode:</span><span class="value">${payment.method?.toUpperCase()}</span></div>` : ""}
          ${payment?.reference ? `<div class="row"><span class="label">Ref No:</span><span class="value">${payment.reference}</span></div>` : ""}
          <div class="total-row"><span>Total Paid</span><span class="value">${total}</span></div>
          <div class="footer">Thank you for training with us!</div>
          <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <DialogContent className="max-w-sm border border-border/80 bg-card p-6 shadow-xl backdrop-blur-md">
      <DialogHeader>
        <DialogTitle className="text-center text-lg font-bold tracking-tight">TANK BY TAPAN RECEIPT</DialogTitle>
      </DialogHeader>
      
      <div className="my-4 border-t border-b border-dashed border-border py-4 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Receipt No:</span>
          <span className="font-mono font-medium">{invoice.invoice_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date:</span>
          <span className="font-medium">{new Date(invoice.paid_at || invoice.issued_at).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Member:</span>
          <span className="font-medium">{member?.full_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Member Code:</span>
          <span className="font-mono font-medium">{member?.member_code}</span>
        </div>
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex justify-between font-semibold border-b border-border/60 pb-2">
          <span>Description</span>
          <span>Amount</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{description}</span>
          <span>{fmtMoney(invoice.total_cents)}</span>
        </div>
        
        <div className="flex justify-between border-t border-dashed border-border pt-3 font-bold text-sm">
          <span>TOTAL PAID</span>
          <span className="text-primary">{fmtMoney(invoice.total_cents)}</span>
        </div>
      </div>

      {payment && (
        <div className="mt-4 rounded-lg bg-muted/50 p-2.5 text-[10px] space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment Mode:</span>
            <span className="font-semibold uppercase">{payment.method}</span>
          </div>
          {payment.reference && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ref No:</span>
              <span className="font-mono truncate max-w-[150px]">{payment.reference}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 text-center space-y-1">
        <p className="text-[10px] text-muted-foreground">Thank you for training with us!</p>
        <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wider">Tank by Tapan</p>
      </div>

      <DialogFooter className="mt-6 gap-2">
        <Button variant="outline" onClick={onClose} className="w-full text-xs">Close</Button>
        <Button onClick={handlePrint} className="w-full text-xs gradient-primary text-primary-foreground shadow-glow">
          Print Receipt
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface PlanDetailDialogProps {
  plan: Plan;
  onClose: () => void;
}

function PlanDetailDialog({ plan, onClose }: PlanDetailDialogProps) {
  return (
    <DialogContent className="max-w-md overflow-hidden p-0 rounded-2xl border border-border bg-card">
      <div className="relative h-52 w-full overflow-hidden bg-muted">
        {plan.photo_url ? (
          <img
            src={plan.photo_url}
            alt={plan.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gradient-primary opacity-90">
            <Dumbbell className="h-12 w-12 text-primary-foreground/80" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
      </div>

      <div className="p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-foreground font-display">{plan.name}</h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                plan.active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              }`}
            >
              <span className={`mr-1 h-1.5 w-1.5 rounded-full ${plan.active ? "bg-success" : "bg-destructive"}`} />
              {plan.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              {plan.duration_days} Days
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</div>
            <div className="text-sm font-bold text-primary">
              {fmtMoney(plan.price_cents)}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">About this plan</h4>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {plan.description || "Access to all gym facilities and equipment."}
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button onClick={onClose} className="w-full gradient-primary text-primary-foreground font-medium shadow-glow">
            Done
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

interface ItemDetailDialogProps {
  item: any;
  onClose: () => void;
}

function ItemDetailDialog({ item, onClose }: ItemDetailDialogProps) {
  let stockTone = "success";
  let stockLabel = `${item.quantity} in stock`;
  if (item.quantity === 0) {
    stockTone = "destructive";
    stockLabel = "Out of Stock";
  } else if (item.quantity <= (item.min_stock_level ?? 5)) {
    stockTone = "warning";
    stockLabel = `${item.quantity} Low Stock (Min ${item.min_stock_level ?? 5})`;
  }

  const map: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };

  return (
    <DialogContent className="max-w-md overflow-hidden p-0 rounded-2xl border border-border bg-card">
      <div className="relative h-52 w-full overflow-hidden bg-muted">
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gradient-primary opacity-90">
            <Package className="h-12 w-12 text-primary-foreground/80" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
      </div>

      <div className="p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-foreground font-display">{item.name}</h2>
            <span className="rounded bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {item.category}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</div>
            <div className="text-sm font-bold text-primary">
              {item.sale_price_cents ? fmtMoney(item.sale_price_cents) : "Not for retail"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock Status</div>
            <div className="text-xs font-bold mt-0.5">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize ${map[stockTone] ?? "bg-muted text-muted-foreground"}`}>
                {stockLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-border pb-3 text-xs">
          <div>
            <span className="text-muted-foreground font-medium">Supplier:</span>{" "}
            <span className="text-foreground font-semibold">{item.supplier ?? "No supplier listed"}</span>
          </div>
          <div>
            <span className="text-muted-foreground font-medium">Min Level:</span>{" "}
            <span className="text-foreground font-semibold">{item.min_stock_level ?? 5} units</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {item.description || "No description provided for this retail item."}
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button onClick={onClose} className="w-full gradient-primary text-primary-foreground font-medium shadow-glow">
            Done
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}



