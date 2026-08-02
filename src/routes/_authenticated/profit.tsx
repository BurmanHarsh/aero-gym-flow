import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { getAuthCache } from "@/routes/_authenticated/route";
import {
  getProfitAnalytics,
  generateMonthReportPDF,
  type ProfitAnalyticsData,
} from "@/lib/aerogym/profit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Users,
  Package,
  Wallet,
  Pill,
  RefreshCw,
  Search,
  Sparkles,
  Calendar,
  BarChart3,
  ChevronDown,
  ChevronRight,
  UserCheck,
  ShieldAlert,
  FileText,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/profit")({
  head: () => ({ meta: [{ title: "Profit Analytics · Tank by Tapan" }] }),
  beforeLoad: () => {
    const cached = getAuthCache();
    if (!cached) throw redirect({ to: "/auth" });
    if (!cached.roles.includes("admin")) throw redirect({ to: "/dashboard" });
  },
  component: ProfitPage,
});

function formatMoney(cents: number): string {
  const isNegative = cents < 0;
  const abs = Math.abs(cents) / 100;
  const formatted = abs.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return `${isNegative ? "-" : ""}₹${formatted}`;
}

type ChartMetric = "netProfit" | "memberRevenue" | "inventoryProfit" | "expenses";

const METRIC_CONFIGS: Record<ChartMetric, { label: string; key: string; color: string }> = {
  netProfit: { label: "Final Net Profit", key: "netProfit", color: "#10b981" }, // Emerald
  memberRevenue: { label: "Member Registered Revenue", key: "memberRevenue", color: "#3b82f6" }, // Blue
  inventoryProfit: { label: "Inventory Sales Profit", key: "inventoryProfit", color: "#8b5cf6" }, // Purple
  expenses: { label: "Operating Expenses", key: "expenses", color: "#f43f5e" }, // Rose
};

function CustomBarCursor(props: any) {
  const { x, y, width, height } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;

  // Render a tight 44px rounded highlight pill centered around the bar
  const pillWidth = Math.min(44, width);
  const pillX = x + (width - pillWidth) / 2;

  return (
    <rect
      x={pillX}
      y={y}
      width={pillWidth}
      height={height}
      fill="rgba(255, 255, 255, 0.08)"
      rx={6}
      ry={6}
    />
  );
}

function ProfitPage() {
  const [data, setData] = useState<ProfitAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  // Single Bar Selection Metric for Chart
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>("netProfit");

  // Track expanded month cards (set of monthKey strings)
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // Search filter inside current month expanded tables
  const [searchQuery, setSearchQuery] = useState("");

  // Determine current calendar month key e.g. "2026-08"
  const currentMonthKey = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, []);

  // Generate full 12-month calendar year timeline for 2026 so upcoming months can raise dynamically
  const monthlyChartData = useMemo(() => {
    if (!data) return [];

    const dbMap = new Map<string, (typeof data.monthlyBreakdown)[0]>();
    data.monthlyBreakdown.forEach((m) => dbMap.set(m.monthKey, m));

    const currentYear = new Date().getFullYear() || 2026;
    const timeline: Array<{
      month: string;
      memberRevenue: number;
      inventoryProfit: number;
      supplementsProfit: number;
      expenses: number;
      netProfit: number;
    }> = [];

    for (let mIdx = 1; mIdx <= 12; mIdx++) {
      const mStr = String(mIdx).padStart(2, "0");
      const monthKey = `${currentYear}-${mStr}`;
      const dObj = new Date(currentYear, mIdx - 1, 1);
      const monthLabel = dObj.toLocaleString("default", { month: "short", year: "numeric" });

      const mRecord = dbMap.get(monthKey);

      timeline.push({
        month: monthLabel,
        memberRevenue: mRecord ? mRecord.memberRevenueCents / 100 : 0,
        inventoryProfit: mRecord ? mRecord.inventoryProfitCents / 100 : 0,
        supplementsProfit: mRecord ? mRecord.supplementsProfitCents / 100 : 0,
        expenses: mRecord ? mRecord.expensesCents / 100 : 0,
        netProfit: mRecord ? mRecord.netProfitCents / 100 : 0,
      });
    }

    return timeline;
  }, [data]);

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await getProfitAnalytics();
      setData(res);

      // Auto-expand the most recent month by default
      if (res.monthlyBreakdown && res.monthlyBreakdown.length > 0) {
        setExpandedMonths({ [res.monthlyBreakdown[0].monthKey]: true });
      }
      if (isRefresh) toast.success("Profit analytics updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to load profit analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleMonthExpand = (monthKey: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  const handleDownloadPDF = async (monthKey: string, monthLabel: string, reportType: "members" | "supplements") => {
    const btnKey = `${monthKey}-${reportType}`;
    try {
      setDownloadingPdf(btnKey);
      toast.loading(`Generating ${reportType === "members" ? "Member Payments" : "Supplements Profit"} PDF for ${monthLabel}...`, { id: "pdf-gen" });
      
      const res = await generateMonthReportPDF({ data: { monthKey, reportType, monthLabel } });
      
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${res.base64}`;
      link.download = res.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(`Downloaded ${res.filename}`, { id: "pdf-gen" });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate PDF report", { id: "pdf-gen" });
    } finally {
      setDownloadingPdf(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Calculating financial metrics & profit analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-destructive">
        <ShieldAlert className="h-10 w-10" />
        <p className="font-semibold">Failed to load profit data.</p>
        <Button onClick={() => loadData()}>Try Again</Button>
      </div>
    );
  }

  const activeMetricConfig = METRIC_CONFIGS[selectedMetric];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Profit Analytics
            </h1>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
              Executive View
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Comprehensive financial breakdown: Member registered revenue, supplement sales, operating expenses & net profit till date.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* ─── 1. TOP FEATURED HERO CARD (FINAL TOTAL NET PROFIT TILL DATE) ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/95 via-primary to-indigo-900 p-6 md:p-8 text-primary-foreground shadow-xl">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 grid gap-6 md:grid-cols-12 md:items-center">
          <div className="md:col-span-8 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Final Cumulative Net Profit Till Date
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl text-white">
              {formatMoney(data.finalNetProfitTillDateCents)}
            </h2>
            <p className="text-xs md:text-sm text-white/80 max-w-xl">
              Calculated as: <span className="font-semibold text-white">(Member Registered Revenue + Inventory Profit) - Operating Expenses</span>
            </p>
          </div>

          <div className="md:col-span-4 flex flex-col gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-md border border-white/15 text-white">
            <div className="flex items-center justify-between text-xs font-medium opacity-90">
              <span>Overall Net Profit Margin</span>
              <span className="font-bold text-emerald-300">{data.overallMarginPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, data.overallMarginPercent))}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-white/10">
              <div>
                <span className="block text-white/70">Gross Inflow</span>
                <span className="font-semibold">
                  {formatMoney(data.memberRevenueTillDateCents + data.inventorySalesTillDateCents)}
                </span>
              </div>
              <div>
                <span className="block text-white/70">Total Outflow</span>
                <span className="font-semibold">
                  {formatMoney(data.inventoryCostTillDateCents + data.expensesTillDateCents)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. SECONDARY KPI METRICS GRID ─── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Member Registered Revenue */}
        <div className="rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Member Registered Revenue
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(data.memberRevenueTillDateCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Final paid price collected from registered members
            </p>
          </div>
        </div>

        {/* Inventory POS Profit */}
        <div className="rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Inventory Sales Profit
            </span>
            <div className="rounded-lg bg-purple-500/10 p-2.5 text-purple-600 dark:text-purple-400">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(data.inventoryProfitTillDateCents)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Supplements:</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {formatMoney(data.supplementsProfitTillDateCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Expenses
            </span>
            <div className="rounded-lg bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {formatMoney(data.expensesTillDateCents)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cumulative business operating costs & outlays
            </p>
          </div>
        </div>

        {/* Latest Month Spotlight Card */}
        <div className="rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {data.monthlyBreakdown[0] ? data.monthlyBreakdown[0].monthLabel : "Latest Month"} Net
            </span>
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {data.monthlyBreakdown[0] ? formatMoney(data.monthlyBreakdown[0].netProfitCents) : formatMoney(0)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground flex justify-between">
              <span>Members: {data.monthlyBreakdown[0] ? formatMoney(data.monthlyBreakdown[0].memberRevenueCents) : "₹0"}</span>
              <span>Inv: {data.monthlyBreakdown[0] ? formatMoney(data.monthlyBreakdown[0].inventoryProfitCents) : "₹0"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. SINGLE BAR MONTHLY TREND CHART WITH SELECTION DROPDOWN ─── */}
      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Monthly Performance Chart
            </h3>
            <p className="text-xs text-muted-foreground">
              Showing single metric bar per month. Use the dropdown to switch between Net Profit, Member Revenue, Inventory Profit, or Expenses.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="metric-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Select Metric:
            </label>
            <select
              id="metric-select"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as ChartMetric)}
              className="h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs font-bold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="netProfit">Final Net Profit</option>
              <option value="memberRevenue">Member Registered Revenue</option>
              <option value="inventoryProfit">Inventory Sales Profit</option>
              <option value="expenses">Operating Expenses</option>
            </select>
          </div>
        </div>

        {monthlyChartData.length > 0 ? (
          <div className="h-64 pt-2 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} barCategoryGap="10%">
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={<CustomBarCursor />}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#f8fafc",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                  }}
                  itemStyle={{ color: activeMetricConfig.color, fontWeight: "bold" }}
                  formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, activeMetricConfig.label]}
                />
                <Bar
                  dataKey={activeMetricConfig.key}
                  name={activeMetricConfig.label}
                  fill={activeMetricConfig.color}
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
            No monthly transactions recorded yet.
          </div>
        )}
      </div>

      {/* ─── 4. MONTH-WISE FINANCIAL LOG (EXPANDABLE) ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Month-Wise Financial Log
            </h3>
            <p className="text-xs text-muted-foreground">
              Current month displays full interactive details inline. Previous months expand to generate and download Member & Supplement PDF reports.
            </p>
          </div>
        </div>

        {data.monthlyBreakdown.map((mMonth, idx) => {
          const isExpanded = !!expandedMonths[mMonth.monthKey];
          const isCurrentMonth = mMonth.monthKey === currentMonthKey || idx === 0;

          const monthSupplements = mMonth.supplements || [];
          const monthMembers = mMonth.members || [];

          const filteredSupplements = searchQuery.trim()
            ? monthSupplements.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
            : monthSupplements;

          const filteredMembers = searchQuery.trim()
            ? monthMembers.filter(
                (m) =>
                  m.memberName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.memberCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.planName.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : monthMembers;

          return (
            <div
              key={mMonth.monthKey}
              className="rounded-xl border bg-card shadow-sm overflow-hidden transition-all border-border hover:border-primary/30"
            >
              {/* Month Accordion Header */}
              <button
                type="button"
                onClick={() => toggleMonthExpand(mMonth.monthKey)}
                className="w-full p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-muted/20 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                      {mMonth.monthLabel}
                      {isCurrentMonth ? (
                        <span className="rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2.5 py-0.5 text-[10px] font-semibold">
                          Active Month
                        </span>
                      ) : (
                        <span className="rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2 py-0.5 text-[10px] font-semibold">
                          PDF Reports Available
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {monthMembers.length} member payments · {monthSupplements.length} supplement sales
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs md:text-right">
                  <div>
                    <span className="block text-muted-foreground">Members Paid</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {formatMoney(mMonth.memberRevenueCents)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Supplements Profit</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">
                      {formatMoney(mMonth.supplementsProfitCents)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Operating Expenses</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {formatMoney(mMonth.expensesCents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <div>
                      <span className="block text-muted-foreground">Net Profit</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(mMonth.netProfitCents)}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground ml-2" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground ml-2" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-6 border-t bg-background/50">
                  {isCurrentMonth ? (
                    /* ─── CURRENT MONTH: FULL INLINE INTERACTIVE TABLES ─── */
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-foreground">
                          {mMonth.monthLabel} Current Month Live Records
                        </h5>
                        <div className="relative w-full max-w-xs">
                          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Filter records..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 text-xs h-8"
                          />
                        </div>
                      </div>

                      {/* 1. Current Month Supplements Table */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h6 className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5 uppercase tracking-wider">
                            <Pill className="h-4 w-4" />
                            Supplements Profit ({mMonth.monthLabel})
                          </h6>
                          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                            Total Supp Net Profit: {formatMoney(mMonth.supplementsProfitCents)}
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-muted/60 text-muted-foreground font-semibold border-b">
                              <tr>
                                <th className="p-2.5">Product Name</th>
                                <th className="p-2.5 text-right">Purchase Price (COGS)</th>
                                <th className="p-2.5 text-right">Sale Price</th>
                                <th className="p-2.5 text-right">Units Sold</th>
                                <th className="p-2.5 text-right">Total Revenue</th>
                                <th className="p-2.5 text-right">Total Cost</th>
                                <th className="p-2.5 text-right">Net Profit</th>
                                <th className="p-2.5 text-right">Margin %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {filteredSupplements.map((item, iIdx) => (
                                <tr key={`${item.itemId}-${iIdx}`} className="hover:bg-muted/20">
                                  <td className="p-2.5 font-semibold text-foreground">{item.name}</td>
                                  <td className="p-2.5 text-right text-muted-foreground">
                                    {formatMoney(item.purchasePriceCents)}
                                  </td>
                                  <td className="p-2.5 text-right font-medium">{formatMoney(item.salePriceCents)}</td>
                                  <td className="p-2.5 text-right font-bold text-foreground">{item.unitsSold}</td>
                                  <td className="p-2.5 text-right">{formatMoney(item.totalRevenueCents)}</td>
                                  <td className="p-2.5 text-right text-muted-foreground">{formatMoney(item.totalCostCents)}</td>
                                  <td className="p-2.5 text-right font-bold text-purple-600 dark:text-purple-400">
                                    {formatMoney(item.netProfitCents)}
                                  </td>
                                  <td className="p-2.5 text-right">
                                    <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                                      {item.marginPercent}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              {filteredSupplements.length === 0 && (
                                <tr>
                                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                                    No supplement sales recorded for {mMonth.monthLabel}.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 2. Current Month Members Table */}
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <h6 className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                            <Users className="h-4 w-4" />
                            Member Registered Payments ({mMonth.monthLabel})
                          </h6>
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                            Total Member Revenue: {formatMoney(mMonth.memberRevenueCents)}
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-muted/60 text-muted-foreground font-semibold border-b">
                              <tr>
                                <th className="p-2.5">Member Name</th>
                                <th className="p-2.5">Member Code</th>
                                <th className="p-2.5">Plan Package</th>
                                <th className="p-2.5">Invoice No</th>
                                <th className="p-2.5">Payment Date</th>
                                <th className="p-2.5 text-right">Discount / Coupon</th>
                                <th className="p-2.5 text-right">Registered Price Paid</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {filteredMembers.map((m) => (
                                <tr key={m.id} className="hover:bg-muted/20">
                                  <td className="p-2.5 font-semibold text-foreground flex items-center gap-2">
                                    <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                                    {m.memberName}
                                  </td>
                                  <td className="p-2.5 font-mono text-muted-foreground">{m.memberCode}</td>
                                  <td className="p-2.5 font-medium text-foreground">{m.planName}</td>
                                  <td className="p-2.5 font-mono text-muted-foreground">{m.invoiceNumber}</td>
                                  <td className="p-2.5 text-muted-foreground">
                                    {new Date(m.paidAt).toLocaleDateString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </td>
                                  <td className="p-2.5 text-right text-rose-500 font-medium">
                                    {m.discountCents > 0 ? `-${formatMoney(m.discountCents)}` : "—"}
                                  </td>
                                  <td className="p-2.5 text-right font-bold text-blue-600 dark:text-blue-400 text-sm">
                                    {formatMoney(m.amountCents)}
                                  </td>
                                </tr>
                              ))}
                              {filteredMembers.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                                    No member payments recorded for {mMonth.monthLabel}.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ─── PREVIOUS MONTHS: DOWNLOADABLE PDF ACTION CARDS ─── */
                    <div className="space-y-4 py-2">
                      <div className="flex items-center justify-between border-b pb-3">
                        <div>
                          <h5 className="text-sm font-bold text-foreground">
                            {mMonth.monthLabel} Archived Financial PDF Reports
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            Generate and download official PDF statements for {mMonth.monthLabel} registered members and supplement sales.
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          Net Profit: {formatMoney(mMonth.netProfitCents)}
                        </span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 pt-2">
                        {/* Member Report PDF Button */}
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 flex flex-col justify-between space-y-4 hover:border-blue-500/40 transition-all">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-blue-500/15 p-2.5 text-blue-600 dark:text-blue-400">
                              <FileText className="h-6 w-6" />
                            </div>
                            <div>
                              <h6 className="text-sm font-bold text-foreground">
                                Member Payments PDF Report
                              </h6>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Download official PDF statement of all member registrations, plan packages & amounts paid for {mMonth.monthLabel}.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-blue-500/10">
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                              Revenue: {formatMoney(mMonth.memberRevenueCents)}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => handleDownloadPDF(mMonth.monthKey, mMonth.monthLabel, "members")}
                              disabled={downloadingPdf === `${mMonth.monthKey}-members`}
                              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-xs"
                            >
                              <Download className={`h-4 w-4 ${downloadingPdf === `${mMonth.monthKey}-members` ? "animate-bounce" : ""}`} />
                              Download PDF
                            </Button>
                          </div>
                        </div>

                        {/* Supplements Report PDF Button */}
                        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5 flex flex-col justify-between space-y-4 hover:border-purple-500/40 transition-all">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-purple-500/15 p-2.5 text-purple-600 dark:text-purple-400">
                              <FileSpreadsheet className="h-6 w-6" />
                            </div>
                            <div>
                              <h6 className="text-sm font-bold text-foreground">
                                Supplements Profit PDF Report
                              </h6>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Download itemized PDF statement of supplement sales, purchase price COGS, sale prices & net profit for {mMonth.monthLabel}.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-purple-500/10">
                            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                              Net Profit: {formatMoney(mMonth.supplementsProfitCents)}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => handleDownloadPDF(mMonth.monthKey, mMonth.monthLabel, "supplements")}
                              disabled={downloadingPdf === `${mMonth.monthKey}-supplements`}
                              className="bg-purple-600 hover:bg-purple-700 text-white gap-2 text-xs"
                            >
                              <Download className={`h-4 w-4 ${downloadingPdf === `${mMonth.monthKey}-supplements` ? "animate-bounce" : ""}`} />
                              Download PDF
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
