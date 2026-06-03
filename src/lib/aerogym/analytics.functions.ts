import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const expiryWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
      { count: totalMembers },
      { count: activeMembers },
      { count: checkInsToday },
      { count: expiringSoon },
      { count: activeLeads },
      { count: convertedLeads },
      { count: totalLeads },
      { data: monthRevenue },
      { data: prevMonthRevenue },
      { count: pendingInvoices },
      { count: paidInvoicesThisMonth },
    ] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true }),
      supabase.from("members").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("attendance_records").select("*", { count: "exact", head: true }).gte("check_in_at", startToday),
      supabase.from("members").select("*", { count: "exact", head: true }).lte("expires_at", expiryWindow).gte("expires_at", new Date().toISOString().slice(0,10)),
      supabase.from("leads").select("*", { count: "exact", head: true }).in("status", ["new","contacted","trial"]),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "converted"),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("payments").select("amount_cents").gte("paid_at", startMonth),
      supabase.from("payments").select("amount_cents").gte("paid_at", startPrevMonth).lt("paid_at", startMonth),
      supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "paid").gte("issued_at", startMonth),
    ]);

    const monthRev = (monthRevenue ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
    const prevRev = (prevMonthRevenue ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
    const revDelta = prevRev ? ((monthRev - prevRev) / prevRev) * 100 : 0;
    const conversionRate = totalLeads ? ((convertedLeads ?? 0) / totalLeads) * 100 : 0;
    const collectionRate = (paidInvoicesThisMonth ?? 0) + (pendingInvoices ?? 0)
      ? ((paidInvoicesThisMonth ?? 0) / ((paidInvoicesThisMonth ?? 0) + (pendingInvoices ?? 0))) * 100
      : 0;

    return {
      totalMembers: totalMembers ?? 0,
      activeMembers: activeMembers ?? 0,
      checkInsToday: checkInsToday ?? 0,
      expiringSoon: expiringSoon ?? 0,
      activeLeads: activeLeads ?? 0,
      conversionRate,
      monthRevenueCents: monthRev,
      revenueDelta: revDelta,
      pendingInvoices: pendingInvoices ?? 0,
      collectionRate,
    };
  });

export const getRevenueTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("payments")
      .select("amount_cents, paid_at")
      .gte("paid_at", start.toISOString())
      .order("paid_at", { ascending: true });

    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of data ?? []) {
      const k = (r.paid_at as string).slice(0, 10);
      buckets.set(k, (buckets.get(k) ?? 0) + (r.amount_cents ?? 0));
    }
    return Array.from(buckets.entries()).map(([date, cents]) => ({ date, revenue: cents / 100 }));
  });

export const getAttendanceTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const start = new Date();
    start.setDate(start.getDate() - 13);
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("attendance_records")
      .select("check_in_at")
      .gte("check_in_at", start.toISOString());

    const buckets = new Map<string, number>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of data ?? []) {
      const k = (r.check_in_at as string).slice(0, 10);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
  });
