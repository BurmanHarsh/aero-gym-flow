import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Package,
  Plus,
  Search,
  Trash2,
  Edit2,
  Activity,
  Tag,
  Zap,
  Wrench,
  Factory,
  ShieldAlert,
  ShoppingCart,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendInventorySaleEmail } from "@/lib/aerogym/email.functions";
import { getAuthCache } from "@/routes/_authenticated/route";
import {
  posLookupProductByBarcode,
  posRegisterProduct,
  posRestockProduct,
  posCheckoutCart,
  posGetBillingStats,
  posGenerateReportPDF
} from "@/lib/aerogym/pos.functions";
import { Barcode, ReceiptText, CalendarRange, Download, Ban, Headphones, Flame, Dumbbell, AlertTriangle, Sparkles, Footprints, Shield, Key } from "lucide-react";
import { BarChart as RechartsBarChart, Bar as RechartsBar, XAxis as RechartsXAxis, YAxis as RechartsYAxis, CartesianGrid as RechartsCartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer as RechartsResponsiveContainer } from "recharts";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory · Tank by Tapan" }] }),
  beforeLoad: () => {
    const cached = getAuthCache();
    if (!cached) throw redirect({ to: "/auth" });
  },
  component: InventoryPage,
});

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  quantity: number;
  min_stock_level: number;
  purchase_price_cents: number;
  sale_price_cents: number | null;
  supplier: string | null;
  photo_url: string | null;
  barcode: string | null;
  sku: string | null;
  gst_percentage: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ["Supplements", "Apparel", "Beverages", "Sanitation", "Other"] as const;

function money(c: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(c / 100);
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "Supplements":
      return Activity;
    case "Apparel":
      return Tag;
    case "Beverages":
      return Zap;
    case "Sanitation":
      return Wrench;
    default:
      return Package;
  }
}

async function insertInventoryItem(item: Omit<InventoryItem, "id" | "created_at" | "updated_at">) {
  const { error } = await (supabase as any)
    .from("inventory_items")
    .insert({
      name: item.name,
      quantity: item.quantity,
      min_stock_level: item.min_stock_level,
      purchase_price_cents: item.purchase_price_cents,
      sale_price_cents: item.sale_price_cents,
      category: item.category,
      supplier: item.supplier,
      description: item.description,
      photo_url: item.photo_url,
      barcode: item.barcode,
      sku: item.sku,
      gst_percentage: item.gst_percentage,
      active: item.active,
    });
    
  if (error) throw error;
}

async function updateInventoryItem(item: Partial<InventoryItem> & { id: string }) {
  const { error } = await (supabase as any)
    .from("inventory_items")
    .update({
      name: item.name,
      quantity: item.quantity,
      min_stock_level: item.min_stock_level,
      purchase_price_cents: item.purchase_price_cents,
      sale_price_cents: item.sale_price_cents,
      category: item.category,
      supplier: item.supplier,
      description: item.description,
      photo_url: item.photo_url,
      barcode: item.barcode,
      sku: item.sku,
      gst_percentage: item.gst_percentage,
      active: item.active,
    })
    .eq("id", item.id);
    
  if (error) throw error;
}

interface SaleRecord {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity: number;
  sale_price_cents: number;
  total_amount_cents: number;
  sold_at: string;
  sold_by: string | null;
  payment_method: string;
  coupon_code: string | null;
  coupon_discount_cents: number;
  buyer_email: string | null;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

function InventoryPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"catalog" | "sales" | "analytics">("catalog");

  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [deletingSale, setDeletingSale] = useState<SaleRecord | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showSellPOS, setShowSellPOS] = useState(false);
  const [cart, setCart] = useState<Array<{ item: InventoryItem; quantity: number }>>([]);

  const isStaff = me.isAdmin || me.roles.includes("front_desk");

  async function load() {
    setLoading(true);
    let { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .neq("category", "Equipment")
      .order("name", { ascending: true });

    if (error) {
      toast.error(error.message);
    } else {
      let items = (data ?? []) as InventoryItem[];

      // Filter based on stock status client-side
      if (statusFilter !== "all") {
        items = items.filter((item) => {
          if (statusFilter === "out") return item.quantity === 0;
          if (statusFilter === "low") return item.quantity > 0 && item.quantity <= item.min_stock_level;
          if (statusFilter === "ok") return item.quantity > item.min_stock_level;
          return true;
        });
      }

      setRows(items);
    }
    setLoading(false);
  }

  async function loadSales() {
    setSalesLoading(true);
    const { data, error } = await supabase
      .from("inventory_sales")
      .select("*, profiles:profiles(full_name, email)")
      .order("sold_at", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setSales((data ?? []) as any[]);
    }
    setSalesLoading(false);
  }

  useEffect(() => {
    if (activeTab === "sales") {
      loadSales();
    } else {
      load();
    }
  }, [activeTab, statusFilter]);

  const filtered = rows.filter((r) => {
    const term = q.toLowerCase();
    return (
      !term ||
      r.name.toLowerCase().includes(term) ||
      (r.description && r.description.toLowerCase().includes(term)) ||
      (r.supplier && r.supplier.toLowerCase().includes(term))
    );
  });

  const totals = {
    totalItems: rows.length,
    valuation: rows.reduce((s, r) => s + r.purchase_price_cents * r.quantity, 0),
    lowStock: rows.filter((r) => r.quantity > 0 && r.quantity <= r.min_stock_level).length,
    outOfStock: rows.filter((r) => r.quantity === 0).length,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory Catalog</h1>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Monitor and manage supplements, accessories, and stock levels."
              : "Browse supplements, apparel, and retail items available at the counter."}
          </p>
        </div>
        {isStaff && (
          <div className="flex items-center gap-2">
            {!showSellPOS ? (
              <Button
                onClick={() => {
                  setShowSellPOS(true);
                  setCart([]);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-glow"
              >
                <ShoppingCart className="mr-1.5 h-4 w-4" /> Sell Items
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setShowSellPOS(false);
                  load();
                }}
              >
                Back to Catalog
              </Button>
            )}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground shadow-glow">
                  <Plus className="mr-1 h-4 w-4" /> Add Item
                </Button>
              </DialogTrigger>
              <AddItemDialog isAdmin={me.isAdmin} onClose={() => { setAddOpen(false); load(); }} />
            </Dialog>
          </div>
        )}
      </header>

      {showSellPOS ? (
        <POSCartView
          rows={rows}
          cart={cart}
          setCart={setCart}
          onClose={() => {
            setShowSellPOS(false);
            load();
          }}
          userId={me.user?.id}
        />
      ) : (
        <>
          {/* Tab Switcher (Staff Only) */}
          {isStaff && (
            <div className="flex border-b border-border/80">
              <button
                onClick={() => setActiveTab("catalog")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                  activeTab === "catalog"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Catalog
              </button>
              <button
                onClick={() => setActiveTab("sales")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                  activeTab === "sales"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Sold Items
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                  activeTab === "analytics"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                POS Analytics
              </button>
            </div>
          )}

          {activeTab === "catalog" && (
            <>
          {/* Summary KPI Cards (Staff Only) */}
          {isStaff && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPI label="Total Catalog Items" value={rows.length.toString()} tone="primary" />
              {me.isAdmin && (
                <KPI label="Stock Valuation" value={money(totals.valuation)} tone="success" />
              )}
              <KPI label="Low Stock Items" value={totals.lowStock.toString()} tone="warning" />
              <KPI label="Out of Stock" value={totals.outOfStock.toString()} tone="destructive" />
            </div>
          )}

          {/* Filter and Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items, descriptions, suppliers..."
                className="pl-9 bg-background/50"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] bg-background/50">
                    <SelectValue placeholder="Stock Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock Statuses</SelectItem>
                    <SelectItem value="ok">In Stock (OK)</SelectItem>
                    <SelectItem value="low">Low Stock Warning</SelectItem>
                    <SelectItem value="out">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Inventory Items list */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading inventory...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">No inventory items match the criteria.</div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((item) => {
                  const CatIcon = getCategoryIcon(item.category);
                  let stockTone = "success";
                  let stockLabel = `${item.quantity} in stock`;
                  if (item.quantity === 0) {
                    stockTone = "destructive";
                    stockLabel = "Out of Stock";
                  } else if (item.quantity <= item.min_stock_level) {
                    stockTone = "warning";
                    stockLabel = `${item.quantity} Low Stock (Min ${item.min_stock_level})`;
                  }

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className="flex flex-col gap-3 px-5 py-4 hover:bg-accent/10 transition sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                      >
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          {item.photo_url ? (
                            <img
                              src={item.photo_url}
                              alt={item.name}
                              className="h-10 w-10 shrink-0 rounded-xl object-cover mt-0.5"
                            />
                          ) : (
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground mt-0.5">
                              <CatIcon className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-medium text-foreground">{item.name}</span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tracking-wider uppercase">
                                {item.category}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Factory className="h-3.5 w-3.5" />
                                {item.supplier ?? "No supplier listed"}
                              </span>
                              <StockPill tone={stockTone} label={stockLabel} />
                              {item.description && <span className="truncate max-w-[280px]">· {item.description}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 shrink-0 sm:justify-end">
                          {isStaff ? (
                            <>
                              <div className="text-right text-xs">
                                {me.isAdmin && (
                                  <div className="font-semibold text-foreground">Buy: {money(item.purchase_price_cents)}</div>
                                )}
                                {item.sale_price_cents ? (
                                  <div className="text-[11px] text-muted-foreground">Sell: {money(item.sale_price_cents)}</div>
                                ) : (
                                  <div className="text-[11px] text-muted-foreground italic">Not for retail</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingItem(item);
                                  }}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingItem(item);
                                  }}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-muted"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </>
                          ) : (
                            <div className="text-right">
                              {item.sale_price_cents && (
                                <div className="text-sm font-bold text-foreground">
                                  Price: {money(item.sale_price_cents)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "sales" && (
        /* Sold Items view */
        <div className="space-y-6">
          {(() => {
            const todayLocal = new Date();
            const todayYear = todayLocal.getFullYear();
            const todayMonth = String(todayLocal.getMonth() + 1).padStart(2, "0");
            const todayDay = String(todayLocal.getDate()).padStart(2, "0");
            const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

            const totalTillDate = sales.reduce((acc, s) => acc + s.total_amount_cents, 0);
            const totalToday = sales.reduce((acc, s) => {
              const saleLocalDateStr = new Date(s.sold_at).toLocaleDateString("en-CA");
              return saleLocalDateStr === todayStr ? acc + s.total_amount_cents : acc;
            }, 0);

            const filteredSales = sales.filter((sale) => {
              const saleLocalDateStr = new Date(sale.sold_at).toLocaleDateString("en-CA");
              if (startDate && saleLocalDateStr < startDate) return false;
              if (endDate && saleLocalDateStr > endDate) return false;
              return true;
            });

            return (
              <>
                {/* Summary Metrics */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sold Today</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-400">{money(totalToday)}</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sold Till Date</div>
                    <div className="mt-1 text-2xl font-bold text-primary">{money(totalTillDate)}</div>
                  </div>
                </div>

                {isStaff && (
                  <>
                    {/* Date Filters */}
                    <div className="flex flex-wrap items-end gap-4 bg-card border border-border rounded-2xl p-5">
                      <div className="flex-1 min-w-[200px] space-y-1.5">
                        <Label htmlFor="start-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start Date</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="bg-background/50 h-10"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px] space-y-1.5">
                        <Label htmlFor="end-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">End Date</Label>
                        <Input
                          id="end-date"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-background/50 h-10"
                        />
                      </div>
                      <div>
                        {(startDate || endDate) && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setStartDate("");
                              setEndDate("");
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground h-10"
                          >
                            Clear Filters
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Sales Records List */}
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                      {salesLoading ? (
                        <div className="p-10 text-center text-sm text-muted-foreground">Loading sold items...</div>
                      ) : filteredSales.length === 0 ? (
                        <div className="p-12 text-center text-sm text-muted-foreground">No sold items match the criteria.</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {filteredSales.map((sale) => {
                            const formattedDate = new Date(sale.sold_at).toLocaleString();
                            return (
                              <div key={sale.id} className="flex flex-col gap-3 px-5 py-4 hover:bg-accent/10 transition sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4 min-w-0 flex-1">
                                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success mt-0.5">
                                    <ShoppingCart className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-2">
                                      <span className="font-semibold text-foreground">{sale.item_name}</span>
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tracking-wider uppercase">
                                        {sale.quantity} {sale.quantity === 1 ? "unit" : "units"} sold
                                      </span>
                                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase ${sale.payment_method === "upi" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                                        {sale.payment_method || "cash"}
                                      </span>
                                      {sale.coupon_code && (
                                        <span className="inline-flex items-center rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-primary uppercase">
                                          Coupon: {sale.coupon_code} (-{money(sale.coupon_discount_cents ?? 0)})
                                        </span>
                                      )}
                                      <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground border border-border/30">
                                        To: {sale.buyer_email || "Walk-in Customer"}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                      <span>Sold at {formattedDate}</span>
                                      <span>·</span>
                                      <span>By {sale.profiles?.full_name ?? "System / Staff"}{sale.profiles?.email ? ` (${sale.profiles.email})` : ""}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-4 shrink-0 sm:justify-end">
                                  <div className="text-right">
                                    <div className="text-sm font-bold text-foreground">{money(sale.total_amount_cents)}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {sale.coupon_discount_cents ? (
                                        <>
                                          <span className="line-through mr-1">{money(sale.sale_price_cents * sale.quantity)}</span>
                                          <span>{money(sale.sale_price_cents)} each</span>
                                        </>
                                      ) : (
                                        <span>{money(sale.sale_price_cents)} each</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {activeTab === "analytics" && (
        <POSAnalyticsView isAdmin={me.isAdmin} />
      )}
    </>
  )}

      {/* Edit Item Dialog */}
      {editingItem && (
        <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
          <EditItemDialog
            item={editingItem}
            isAdmin={me.isAdmin}
            onClose={() => { setEditingItem(null); load(); }}
          />
        </Dialog>
      )}

      {/* Delete Item Dialog */}
      {deletingItem && (
        <Dialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
          <DeleteItemConfirm
            item={deletingItem}
            onClose={() => setDeletingItem(null)}
            onConfirm={async () => {
              if (!deletingItem) return;
              const { error } = await supabase.from("inventory_items").delete().eq("id", deletingItem.id);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Inventory item deleted permanently");
              setDeletingItem(null);
              load();
            }}
          />
        </Dialog>
      )}



      {/* Delete Sale Dialog */}
      {deletingSale && (
        <Dialog open={!!deletingSale} onOpenChange={(o) => !o && setDeletingSale(null)}>
          <DeleteSaleConfirm
            sale={deletingSale}
            onClose={() => setDeletingSale(null)}
            onConfirm={async () => {
              if (!deletingSale) return;
              try {
                // 1. Restore stock in catalog if item_id is present
                if (deletingSale.item_id) {
                  const { data: item, error: fetchError } = await supabase
                    .from("inventory_items")
                    .select("quantity")
                    .eq("id", deletingSale.item_id)
                    .maybeSingle();

                  if (fetchError) throw fetchError;

                  if (item) {
                    const { error: itemUpdateError } = await supabase
                      .from("inventory_items")
                      .update({ quantity: item.quantity + deletingSale.quantity })
                      .eq("id", deletingSale.item_id);

                    if (itemUpdateError) throw itemUpdateError;
                  }
                }

                // 2. Delete the sale record
                const { error: deleteError } = await supabase
                  .from("inventory_sales")
                  .delete()
                  .eq("id", deletingSale.id);

                if (deleteError) throw deleteError;

                toast.success("Sale record deleted and stock restored successfully");
                setDeletingSale(null);
                loadSales();
                load(); // Refresh catalog stock count
              } catch (err: any) {
                toast.error(err.message || "Failed to delete sale record");
              }
            }}
          />
        </Dialog>
      )}

      {/* Edit Sale Dialog */}
      {editingSale && (
        <Dialog open={!!editingSale} onOpenChange={(o) => !o && setEditingSale(null)}>
          <EditSaleDialog
            sale={editingSale}
            onClose={() => { setEditingSale(null); loadSales(); }}
          />
        </Dialog>
      )}

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

interface ItemDetailDialogProps {
  item: InventoryItem;
  onClose: () => void;
}

function ItemDetailDialog({ item, onClose }: ItemDetailDialogProps) {
  const CatIcon = getCategoryIcon(item.category);
  let stockTone = "success";
  let stockLabel = `${item.quantity} in stock`;
  if (item.quantity === 0) {
    stockTone = "destructive";
    stockLabel = "Out of Stock";
  } else if (item.quantity <= item.min_stock_level) {
    stockTone = "warning";
    stockLabel = `${item.quantity} Low Stock (Min ${item.min_stock_level})`;
  }

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
            <CatIcon className="h-12 w-12 text-primary-foreground/80" />
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
              {item.sale_price_cents ? money(item.sale_price_cents) : "Not for retail"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock Status</div>
            <div className="text-xs font-bold mt-0.5">
              <StockPill tone={stockTone} label={stockLabel} />
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
            <span className="text-foreground font-semibold">{item.min_stock_level} units</span>
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

function StockPill({ tone, label }: { tone: string; label: string }) {
  const map: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize ${map[tone] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone: "warning" | "success" | "primary" | "destructive" }) {
  const tones: Record<typeof tone, string> = {
    warning: "text-warning",
    success: "text-success",
    primary: "text-primary",
    destructive: "text-destructive",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold md:text-2xl ${tones[tone]}`}>{value}</div>
    </div>
  );
}

/* Add Item Dialog Component */
function AddItemDialog({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minStock, setMinStock] = useState("5");
  const [purchasePrice, setPurchasePrice] = useState(isAdmin ? "" : "0");
  const [salePrice, setSalePrice] = useState("");
  const [category, setCategory] = useState<string>("Supplements");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [gstPercentage, setGstPercentage] = useState("18");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      let uploadedUrl = null;
      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const filePath = `products/${Math.random().toString(36).substring(2, 15)}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("photos").upload(filePath, photoFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(filePath);
        uploadedUrl = publicUrl;
      }

      await insertInventoryItem({
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        min_stock_level: parseInt(minStock) || 5,
        purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
        sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
        category,
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        photo_url: uploadedUrl,
        barcode: barcode.trim() || null,
        sku: sku.trim() || null,
        gst_percentage: parseInt(gstPercentage) || 0,
        active: true,
      });

      toast.success("Inventory item added successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin">
      <DialogHeader>
        <DialogTitle>Add Inventory Item</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Item Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Optimum Whey 1kg, Gym T-Shirt L"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Barcode</Label>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type barcode"
            />
          </div>
          <div>
            <Label>SKU (Optional)</Label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. WHEY-CHO-1KG"
            />
          </div>
        </div>
        {isAdmin && (
          <div>
            <Label>Item Photo (Optional)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="bg-background/50 cursor-pointer"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Min Stock Warning Level</Label>
            <Input
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              required
            />
          </div>
        </div>
        
        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Purchase Cost (Rs)</Label>
              <Input
                type="number"
                min="0.00"
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Sale Price (Rs, Optional)</Label>
              <Input
                type="number"
                min="0.00"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="Leave empty if not for retail"
              />
            </div>
          </div>
        ) : (
          <div>
            <Label>Sale Price (Rs, Optional)</Label>
            <Input
              type="number"
              min="0.00"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="Leave empty if not for retail"
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supplier Name</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. HealthMart, CleanCare"
            />
          </div>
          <div>
            <Label>GST %</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={gstPercentage}
              onChange={(e) => setGstPercentage(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Flavor, size, specs or details..."
            rows={2}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground font-medium">
            {busy ? "Saving..." : "Save Item"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Edit Item Dialog Component */
function EditItemDialog({ item, onClose, isAdmin }: { item: InventoryItem; onClose: () => void; isAdmin: boolean }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [minStock, setMinStock] = useState(item.min_stock_level.toString());
  const [purchasePrice, setPurchasePrice] = useState((item.purchase_price_cents / 100).toString());
  const [salePrice, setSalePrice] = useState(item.sale_price_cents ? (item.sale_price_cents / 100).toString() : "");
  const [category, setCategory] = useState(item.category);
  const [supplier, setSupplier] = useState(item.supplier ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  const [sku, setSku] = useState(item.sku ?? "");
  const [gstPercentage, setGstPercentage] = useState(item.gst_percentage.toString());
  const [active, setActive] = useState(item.active);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      let uploadedUrl = item.photo_url;
      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const filePath = `products/${Math.random().toString(36).substring(2, 15)}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("photos").upload(filePath, photoFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(filePath);
        uploadedUrl = publicUrl;
      }

      await updateInventoryItem({
        id: item.id,
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        min_stock_level: parseInt(minStock) || 5,
        purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
        sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
        category,
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        photo_url: uploadedUrl,
        barcode: barcode.trim() || null,
        sku: sku.trim() || null,
        gst_percentage: parseInt(gstPercentage) || 0,
        active: active,
      });

      toast.success("Inventory item updated successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin">
      <DialogHeader>
        <DialogTitle>Edit Inventory Item</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Item Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Barcode</Label>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type barcode"
            />
          </div>
          <div>
            <Label>SKU (Optional)</Label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. WHEY-CHO-1KG"
            />
          </div>
        </div>
        {isAdmin && (
          <div>
            <Label>Item Photo (Optional)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="bg-background/50 cursor-pointer"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Min Stock Warning Level</Label>
            <Input
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              required
            />
          </div>
        </div>

        {isAdmin ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Purchase Cost (Rs)</Label>
              <Input
                type="number"
                min="0.00"
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Sale Price (Rs, Optional)</Label>
              <Input
                type="number"
                min="0.00"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="Not for retail"
              />
            </div>
          </div>
        ) : (
          <div>
            <Label>Sale Price (Rs, Optional)</Label>
            <Input
              type="number"
              min="0.00"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="Not for retail"
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supplier Name</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div>
            <Label>GST %</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={gstPercentage}
              onChange={(e) => setGstPercentage(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={active ? "true" : "false"} onValueChange={(val) => setActive(val === "true")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active (Available for POS)</SelectItem>
                <SelectItem value="false">Inactive (Archived)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground font-medium">
            {busy ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Delete Item Confirmation Component */
function DeleteItemConfirm({ item, onClose, onConfirm }: { item: InventoryItem; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" /> Permanent Delete
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 pt-2 text-sm text-muted-foreground">
        <p>Are you sure you want to delete this inventory item: <strong>{item.name}</strong>?</p>
        <p>This action cannot be undone. It will permanently remove the record from your inventory lists.</p>
      </div>
      <DialogFooter className="pt-4 gap-2">
        <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
        <Button onClick={handleDelete} variant="destructive" disabled={busy}>
          {busy ? "Deleting..." : "Delete Record"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* Edit Sale Dialog Component */
function EditSaleDialog({ sale, onClose }: { sale: SaleRecord; onClose: () => void }) {
  const [quantity, setQuantity] = useState(sale.quantity.toString());
  const [salePrice, setSalePrice] = useState((sale.sale_price_cents / 100).toString());
  const [paymentMethod, setPaymentMethod] = useState<string>(sale.payment_method || "cash");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity) || 0;
    const price = parseFloat(salePrice) || 0;

    if (qty <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }
    if (price < 0) {
      toast.error("Price cannot be negative");
      return;
    }

    setBusy(true);

    try {
      const salePriceCents = Math.round(price * 100);
      const totalAmountCents = qty * salePriceCents;

      // 1. If item_id is not null, verify and update catalog stock
      if (sale.item_id) {
        // Fetch current catalog item details
        const { data: item, error: fetchError } = await supabase
          .from("inventory_items")
          .select("quantity")
          .eq("id", sale.item_id)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (item) {
          const availableStock = item.quantity + sale.quantity;
          if (qty > availableStock) {
            toast.error(`Cannot set quantity to ${qty}. Maximum available stock is ${availableStock}.`);
            setBusy(false);
            return;
          }

          // Update catalog item stock
          const { error: itemUpdateError } = await supabase
            .from("inventory_items")
            .update({ quantity: availableStock - qty })
            .eq("id", sale.item_id);

          if (itemUpdateError) throw itemUpdateError;
        }
      }

      // 2. Update sale record
      const { error: saleUpdateError } = await supabase
        .from("inventory_sales")
        .update({
          quantity: qty,
          sale_price_cents: salePriceCents,
          total_amount_cents: totalAmountCents,
          payment_method: paymentMethod,
        })
        .eq("id", sale.id);

      if (saleUpdateError) throw saleUpdateError;

      toast.success("Sale record updated successfully!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update sale record");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Sale Record</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="rounded-xl bg-muted/40 border border-border p-3 space-y-1">
          <div className="text-xs text-muted-foreground uppercase font-medium">Item Name</div>
          <div className="font-semibold text-foreground">{sale.item_name}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantity Sold</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div>
            <Label>Unit Sale Price (Rs)</Label>
            <Input
              type="number"
              min="0.00"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              required
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Payment Method</Label>
          <div className="grid grid-cols-2 gap-2 bg-muted/30 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              disabled={busy}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${
                paymentMethod === "cash"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm"
                  : "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("upi")}
              disabled={busy}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${
                paymentMethod === "upi"
                  ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30 shadow-sm"
                  : "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50"
              }`}
            >
              UPI
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center bg-primary/10 border border-primary/20 rounded-xl p-3">
          <span className="text-sm font-medium">New Total Charge:</span>
          <span className="text-lg font-bold text-primary">
            Rs {((parseInt(quantity) || 0) * (parseFloat(salePrice) || 0)).toLocaleString()}
          </span>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground font-medium">
            {busy ? "Save Changes" : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

interface POSCartViewProps {
  rows: InventoryItem[];
  cart: Array<{ item: InventoryItem; quantity: number }>;
  setCart: React.Dispatch<React.SetStateAction<Array<{ item: InventoryItem; quantity: number }>>>;
  onClose: () => void;
  userId?: string | null;
}

// Payment Service Abstraction
class MockPaymentService {
  static async processPayment(_method: string, _amountCents: number): Promise<{ success: boolean; transactionId: string }> {
    const mockTxId = "TXN-PL-" + Math.floor(Math.random() * 89999999 + 10000000);
    return { success: true, transactionId: mockTxId };
  }
}

function POSCartView({ rows, cart, setCart, onClose, userId }: POSCartViewProps) {
  const [scanValue, setScanValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "emi">("cash");
  const [busy, setBusy] = useState(false);
  const [payingPineLabs, setPayingPineLabs] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<{ invoice_number: string; sale_id: string } | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number; upto: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [allProfiles, setAllProfiles] = useState<{ email: string; full_name: string | null }[]>([]);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [prefilledBarcode, setPrefilledBarcode] = useState("");
  const [restockProduct, setRestockProduct] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState("10");

  const scanInputRef = useRef<HTMLInputElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const sendSaleEmailFn = useServerFn(sendInventorySaleEmail);

  // Keep barcode scanner focused
  useEffect(() => {
    scanInputRef.current?.focus();
    const interval = setInterval(() => {
      if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        scanInputRef.current?.focus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch profiles for autocomplete
  useEffect(() => {
    supabase
      .from("profiles")
      .select("email, full_name")
      .then(({ data }) => {
        if (data) setAllProfiles(data);
      });
  }, []);

  // Keyboard shortcuts event listener
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setPaymentMethod("cash");
        toast.info("Selected Payment: Cash");
      } else if (e.key === "F3") {
        e.preventDefault();
        setPaymentMethod("card");
        toast.info("Selected Payment: Card");
      } else if (e.key === "F4") {
        e.preventDefault();
        setPaymentMethod("upi");
        toast.info("Selected Payment: UPI");
      } else if (e.key === "F5") {
        e.preventDefault();
        setPaymentMethod("emi");
        toast.info("Selected Payment: EMI");
      } else if (e.key === "Escape") {
        e.preventDefault();
        setCart([]);
        setAppliedCoupon(null);
        toast.info("Cart cleared");
      }
    };
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [setCart]);

  const addToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        if (existing.quantity >= item.quantity) {
          toast.error(`Cannot add more than in-stock quantity (${item.quantity})`);
          return prev;
        }
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
    toast.success(`Added ${item.name} to cart`);
  };

  const updateQty = (itemId: string, newQty: number, maxQty: number) => {
    if (newQty <= 0) {
      removeFromCart(itemId);
      return;
    }
    if (newQty > maxQty) {
      toast.error(`Cannot exceed in-stock quantity (${maxQty})`);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.item.id === itemId ? { ...i, quantity: newQty } : i))
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.item.id !== itemId));
  };

  const handleBarcodeScan = async (barcode: string) => {
    // 1. Search local state
    const local = rows.find(r => r.barcode === barcode);
    if (local) {
      if (local.quantity <= 0) {
        toast.error(`"${local.name}" is out of stock!`);
        return;
      }
      addToCart(local);
      return;
    }

    // 2. Call server lookup
    setBusy(true);
    try {
      const item = await posLookupProductByBarcode({ data: { barcode } });
      if (item) {
        if (item.quantity <= 0) {
          toast.error(`"${item.name}" is out of stock!`);
        } else {
          addToCart(item as any);
        }
      } else {
        // Barcode not found, open Register product
        toast.info("Barcode not registered. Open registration dialog...");
        setPrefilledBarcode(barcode);
        setAddProductOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to search product");
    } finally {
      setBusy(false);
    }
  };

  const handleScanInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = scanValue.trim();
      if (val) {
        handleBarcodeScan(val);
        setScanValue("");
      }
    }
  };

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    const searchCode = couponCode.trim().toUpperCase();
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", searchCode)
        .eq("active", true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error("Invalid or expired coupon");
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          percent: data.discount_percent,
          upto: data.discount_upto_cents,
        });
        toast.success(`Coupon "${data.code}" applied!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Coupon verification failed");
    } finally {
      setCheckingCoupon(false);
    }
  }

  // Pricing calculations
  // Item Cost is purchase_price_cents
  // Item retail Price is sale_price_cents
  const subtotalCents = cart.reduce((acc, c) => acc + (c.item.sale_price_cents ?? 0) * c.quantity, 0);
  const totalGstCents = cart.reduce((acc, c) => {
    const itemTotal = (c.item.sale_price_cents ?? 0) * c.quantity;
    return acc + Math.round(itemTotal * c.item.gst_percentage / 100);
  }, 0);
  
  let discountCents = 0;
  const subtotalWithGst = subtotalCents + totalGstCents;
  if (appliedCoupon && subtotalWithGst > 0) {
    discountCents = Math.min((subtotalWithGst * appliedCoupon.percent) / 100, appliedCoupon.upto);
  }

  const grandTotalCents = Math.max(0, subtotalWithGst - discountCents);
  const cgstCents = Math.round(totalGstCents / 2);
  const sgstCents = Math.round(totalGstCents / 2);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    const emailToUse = buyerEmail.trim();
    if (!emailToUse) {
      toast.error("Customer email is required for POS transactions.");
      return;
    }

    setBusy(true);

    let transactionId: string | null = null;

    // Simulate Pine Labs if Card/UPI/EMI
    if (paymentMethod !== "cash") {
      setPayingPineLabs(true);
      try {
        const paymentRes = await MockPaymentService.processPayment(paymentMethod, grandTotalCents);
        if (!paymentRes.success) {
          throw new Error("Pine Labs POS Payment Rejected");
        }
        transactionId = paymentRes.transactionId;
        toast.success(`Pine Labs Transaction Approved: ${transactionId}`);
      } catch (err: any) {
        toast.error(err.message || "POS card swipe failed");
        setPayingPineLabs(false);
        setBusy(false);
        return;
      }
      setPayingPineLabs(false);
    }

    try {
      // Call server checkout function
      const result = (await posCheckoutCart({
        data: {
          paymentMethod,
          discountCents,
          subtotalCents,
          cgstCents,
          sgstCents,
          totalGstCents,
          grandTotalCents,
          transactionId,
          items: cart.map(c => ({
            itemId: c.item.id,
            quantity: c.quantity,
            purchasePriceCents: c.item.purchase_price_cents,
            sellingPriceCents: c.item.sale_price_cents ?? 0,
            gstPercentage: c.item.gst_percentage
          }))
        }
      })) as any;

      if (!result?.success) {
        throw new Error("POS Checkout transaction was rejected by DB");
      }

      setCheckoutResult(result);
      toast.success(`Checkout complete! Invoice: ${result.invoice_number}`);

      // Try sending receipt email
      try {
        const matched = allProfiles.find(p => p.email.toLowerCase() === emailToUse.toLowerCase());
        const customerName = matched?.full_name || "Customer";
        await sendSaleEmailFn({
          data: {
            to: emailToUse,
            name: customerName,
            items: cart.map(c => ({
              name: c.item.name,
              quantity: c.quantity,
              price: money(c.quantity * (c.item.sale_price_cents ?? 0))
            })),
            totalAmount: money(grandTotalCents),
            paymentMethod,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            discountAmount: appliedCoupon ? money(discountCents) : null
          }
        });
      } catch (emailErr) {
        console.warn("Failed sending receipt email", emailErr);
      }

      // Automatically open print sheet
      window.print();
      setCart([]);
      setAppliedCoupon(null);
      setCheckoutResult(null);
      setBuyerEmail("");

    } catch (err: any) {
      toast.error(err.message || "Failed completing POS transaction");
    } finally {
      setBusy(false);
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    const qty = parseInt(restockQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Invalid restock quantity");
      return;
    }
    setBusy(true);
    try {
      const res = await posRestockProduct({
        data: {
          id: restockProduct.id,
          quantityToAdd: qty
        }
      });
      toast.success(`Successfully restocked ${res.name}. New Stock: ${res.newStock}`);
      setRestockProduct(null);
    } catch (err: any) {
      toast.error(err.message || "Restock failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] animate-in fade-in duration-200">
      
      {/* Left side: Barcode input + products lists */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card border border-border rounded-2xl p-4">
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary animate-pulse" />
            <Input
              ref={scanInputRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={handleScanInputKeyDown}
              placeholder="Barcode Scanner Active (Scan items or type barcode)..."
              className="pl-11 bg-background/50 font-mono text-sm tracking-wider"
              disabled={busy || payingPineLabs}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const b = prompt("Enter barcode to restock:");
                if (b) {
                  const match = rows.find(r => r.barcode === b);
                  if (match) {
                    setRestockProduct(match);
                  } else {
                    toast.error("Barcode not registered");
                  }
                }
              }}
              className="text-xs"
            >
              Restock Item
            </Button>
          </div>
        </div>

        {/* Scan Results / Quick products grid */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Top Quick Retail items</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {rows
              .filter(r => r.sale_price_cents && r.sale_price_cents > 0 && r.active)
              .slice(0, 6)
              .map((item) => {
                const CatIcon = getCategoryIcon(item.category);
                const cartItem = cart.find(c => c.item.id === item.id);
                const stock = item.quantity - (cartItem?.quantity ?? 0);

                return (
                  <div
                    key={item.id}
                    onClick={() => stock > 0 && addToCart(item)}
                    className={`flex flex-col justify-between rounded-xl border border-border/80 bg-background/30 p-3 hover:border-primary/50 transition cursor-pointer select-none ${stock <= 0 ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="rounded-lg bg-muted p-1 text-muted-foreground">
                        <CatIcon className="h-4 w-4" />
                      </div>
                      <span className={`text-[9px] font-bold uppercase rounded px-1 ${item.quantity <= item.min_stock_level ? "bg-warning/20 text-warning" : "bg-success/20 text-success"}`}>
                        {stock} left
                      </span>
                    </div>
                    <div className="mt-3">
                      <p className="font-semibold text-xs text-foreground truncate">{item.name}</p>
                      <p className="text-xs font-bold text-primary mt-1">{money(item.sale_price_cents ?? 0)}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Right side: Cart list & calculator */}
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between min-h-[520px] shadow-sm">
        
        {/* Cart Listing */}
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Retail Cart</h3>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary font-mono">
              {cart.reduce((sum, c) => sum + c.quantity, 0)} qty
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <Barcode className="h-12 w-12 text-muted-foreground/30 mb-2 stroke-[1.5]" />
              <p className="text-sm font-semibold">POS Terminal Ready</p>
              <p className="text-[11px] mt-1 text-muted-foreground/80 max-w-[200px]">Scan barcodes on packaging to add items automatically.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[220px] divide-y divide-border/60 pr-1 scrollbar-thin">
              {cart.map((c) => (
                <div key={c.item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{c.item.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      {money(c.item.sale_price_cents ?? 0)} + {c.item.gst_percentage}% GST
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => updateQty(c.item.id, c.quantity - 1, c.item.quantity)}
                      className="h-5 w-5 rounded border border-border bg-background hover:bg-muted text-foreground flex items-center justify-center font-bold text-xs"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-semibold font-mono text-xs">{c.quantity}</span>
                    <button
                      onClick={() => updateQty(c.item.id, c.quantity + 1, c.item.quantity)}
                      className="h-5 w-5 rounded border border-border bg-background hover:bg-muted text-foreground flex items-center justify-center font-bold text-xs"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(c.item.id)}
                      className="ml-1 h-5 w-5 text-muted-foreground hover:text-destructive flex items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & checkout controls */}
        {cart.length > 0 && (
          <div className="space-y-3 border-t border-border pt-4 mt-4">
            
            {/* Buyer email autofill suggestions */}
            <div className="relative">
              <Label className="mb-1 block text-[10px] uppercase font-bold text-muted-foreground">
                Customer Email *
              </Label>
              <Input
                type="email"
                value={buyerEmail}
                onChange={(e) => {
                  setBuyerEmail(e.target.value);
                  setShowEmailSuggestions(true);
                }}
                onFocus={() => setShowEmailSuggestions(true)}
                onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 250)}
                placeholder="search member email..."
                className="bg-card h-8 text-xs font-medium"
                disabled={busy}
              />
              {showEmailSuggestions && buyerEmail.length >= 3 && (
                (() => {
                  const filtered = allProfiles.filter(p => p.email.toLowerCase().includes(buyerEmail.toLowerCase()));
                  if (filtered.length === 0) return null;
                  return (
                    <ul className="absolute left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-card shadow-lg divide-y divide-border/60">
                      {filtered.map(p => (
                        <li
                          key={p.email}
                          onMouseDown={() => {
                            setBuyerEmail(p.email);
                            setShowEmailSuggestions(false);
                          }}
                          className="px-3 py-1.5 text-xs hover:bg-muted cursor-pointer transition flex flex-col"
                        >
                          <span className="font-semibold text-foreground">{p.email}</span>
                          {p.full_name && <span className="text-[10px] text-muted-foreground">{p.full_name}</span>}
                        </li>
                      ))}
                    </ul>
                  );
                })()
              )}
            </div>

            {/* Coupon Code input */}
            <div className="flex gap-1.5">
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="coupon (optional)"
                className="bg-card uppercase font-mono h-8 text-xs"
                disabled={busy}
              />
              <Button
                variant="outline"
                onClick={applyCoupon}
                disabled={busy || !couponCode}
                className="h-8 text-xs px-3"
              >
                Apply
              </Button>
            </div>

            {/* Payment Method selector buttons */}
            <div>
              <Label className="mb-1 block text-[10px] uppercase font-bold text-muted-foreground">Payment Method</Label>
              <div className="grid grid-cols-4 gap-1 bg-muted/30 p-0.5 rounded-lg border border-border">
                {(["cash", "card", "upi", "emi"] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-1.5 px-1 rounded text-[10px] font-bold uppercase transition border ${
                      paymentMethod === method
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Calculations break down */}
            <div className="rounded-lg bg-muted/40 border border-border p-2.5 space-y-1 text-xs text-muted-foreground font-medium">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{money(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>CGST (half):</span>
                <span>{money(cgstCents)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>SGST (half):</span>
                <span>{money(sgstCents)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-foreground">
                <span>Total GST:</span>
                <span>{money(totalGstCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Discount:</span>
                  <span>- {money(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/40 pt-1.5 font-bold text-foreground text-sm">
                <span>Grand Total:</span>
                <span className="text-emerald-400">{money(grandTotalCents)}</span>
              </div>
            </div>

            <Button
              onClick={handleCheckout}
              disabled={busy || cart.length === 0 || !buyerEmail.trim()}
              className="w-full h-10 gradient-primary text-primary-foreground font-semibold shadow-glow"
            >
              {payingPineLabs ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin text-sm">🔄</span> Swiping Pine Labs POS...
                </span>
              ) : busy ? (
                "Saving Checkout..."
              ) : (
                "Checkout & Print Receipt"
              )}
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          onClick={onClose}
          disabled={busy || payingPineLabs}
          className="w-full text-xs text-muted-foreground hover:text-foreground mt-2"
        >
          Close Terminal
        </Button>
      </div>

      {/* Hidden printable 80mm thermal receipt */}
      <div id="thermal-receipt" className="p-4 bg-white text-black font-mono text-xs w-[80mm] leading-tight hidden print:block">
        <div className="text-center space-y-1">
          <h2 className="text-sm font-bold">TANK BY TAPAN</h2>
          <p className="text-[10px]">Strength & Conditioning Club</p>
          <p className="text-[9px]">Civil Lines, Aligarh, UP</p>
          <p className="text-[9px]">GSTIN: 09AAACT7429M1Z9</p>
          <p className="border-b border-dashed border-black my-2"></p>
        </div>
        <div className="space-y-0.5 text-[10px]">
          <p><strong>Invoice:</strong> {checkoutResult?.invoice_number || "INV-POS-TEMP"}</p>
          <p><strong>Date:</strong> {new Date().toLocaleString()}</p>
          <p><strong>Cashier:</strong> Staff</p>
          <p><strong>Buyer:</strong> {buyerEmail}</p>
          <p className="border-b border-dashed border-black my-2"></p>
        </div>
        <table className="w-full text-[10px] text-left">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="pb-1">Item</th>
              <th className="pb-1 text-center">Qty</th>
              <th className="pb-1 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {cart.map(c => (
              <tr key={c.item.id}>
                <td className="py-1 max-w-[40mm] truncate">{c.item.name}</td>
                <td className="py-1 text-center">{c.quantity}</td>
                <td className="py-1 text-right">{( (c.item.sale_price_cents ?? 0) * c.quantity / 100 ).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-dashed border-black pt-2 mt-2 space-y-1 text-[10px] text-right">
          <p>Subtotal: Rs {(subtotalCents / 100).toFixed(2)}</p>
          <p>CGST (half): Rs {(cgstCents / 100).toFixed(2)}</p>
          <p>SGST (half): Rs {(sgstCents / 100).toFixed(2)}</p>
          <p>Total GST: Rs {(totalGstCents / 100).toFixed(2)}</p>
          {discountCents > 0 && <p className="text-black">Discount: - Rs {(discountCents / 100).toFixed(2)}</p>}
          <p className="text-xs font-bold border-t border-dashed border-black pt-1">
            Grand Total: Rs {(grandTotalCents / 100).toFixed(2)}
          </p>
        </div>
        <div className="text-center mt-4 space-y-1 text-[9px]">
          <p>Paid via: <span className="uppercase font-bold">{paymentMethod}</span></p>
          <p>Thank you for shopping at TANK! 💪</p>
          <p>Keep training heavy!</p>
        </div>
      </div>

      {/* Restock dialog popup */}
      {restockProduct && (
        <Dialog open={!!restockProduct} onOpenChange={(o) => !o && setRestockProduct(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Restock product</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRestockSubmit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{restockProduct.name}</p>
                <p className="text-xs text-muted-foreground">Current Stock: <strong className="text-foreground">{restockProduct.quantity} units</strong></p>
              </div>
              <div>
                <Label>Quantity to Add</Label>
                <Input
                  type="number"
                  min="1"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  required
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRestockProduct(null)} disabled={busy}>Cancel</Button>
                <Button type="submit" size="sm" disabled={busy} className="gradient-primary text-primary-foreground font-semibold">
                  {busy ? "Updating..." : "Restock"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Product Modal (prefilled barcode) */}
      {addProductOpen && (
        <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
          <DialogContent className="max-w-md bg-card border border-border">
            <DialogHeader>
              <DialogTitle>Register New Product</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <p className="text-xs text-muted-foreground bg-primary/10 border border-primary/20 p-2.5 rounded-lg mb-4">
                You scanned a new barcode: <strong className="font-mono text-foreground">{prefilledBarcode}</strong>. Please enter the product information to register it in the inventory.
              </p>
              <AddItemDialogPrefilled
                barcode={prefilledBarcode}
                isAdmin={true}
                onClose={() => {
                  setAddProductOpen(false);
                  setPrefilledBarcode("");
                  onClose(); // Reload inventory
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}

// Prefilled barcode add dialog
function AddItemDialogPrefilled({ barcode, isAdmin, onClose }: { barcode: string; isAdmin: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [minStock, setMinStock] = useState("5");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [category, setCategory] = useState<string>("Supplements");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [gstPercentage, setGstPercentage] = useState("18");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      await insertInventoryItem({
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        min_stock_level: parseInt(minStock) || 5,
        purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
        sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
        category,
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        photo_url: null,
        barcode: barcode,
        sku: sku.trim() || null,
        gst_percentage: parseInt(gstPercentage) || 0,
        active: true,
      });

      toast.success("Inventory item registered successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to register item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 pt-1">
      <div>
        <Label>Product Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monster Energy Drink 350ml"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Barcode (Scanned)</Label>
          <Input value={barcode} disabled className="bg-muted font-mono" />
        </div>
        <div>
          <Label>SKU (Optional)</Label>
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. MONSTER-350"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Initial Quantity *</Label>
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Min Stock Level *</Label>
          <Input
            type="number"
            min="0"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Purchase Price (Rs) *</Label>
          <Input
            type="number"
            min="0.00"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <Label>Sale Price (Rs) *</Label>
          <Input
            type="number"
            min="0.00"
            step="0.01"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>GST %</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={gstPercentage}
            onChange={(e) => setGstPercentage(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <Label>Supplier</Label>
        <Input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="e.g. Coca-Cola Distributors"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Product specs or notes..."
          rows={2}
        />
      </div>
      <DialogFooter className="pt-2 gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground font-semibold">
          {busy ? "Registering..." : "Register Product"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* Delete Sale Confirmation Component */
function DeleteSaleConfirm({ sale, onClose, onConfirm }: { sale: SaleRecord; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" /> Delete Sale Record
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 pt-2 text-sm text-muted-foreground">
        <p>Are you sure you want to delete the sale record for <strong>{sale.item_name}</strong> ({sale.quantity} units)?</p>
        <p>This will permanently remove the sale entry from the history log. This action cannot be undone.</p>
      </div>
      <DialogFooter className="pt-4 gap-2">
        <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
        <Button onClick={handleDelete} variant="destructive" disabled={busy}>
          {busy ? "Deleting..." : "Delete Record"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function POSAnalyticsView({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  
  const [reportType, setReportType] = useState<"sales" | "gst" | "profit" | "inventory">("sales");
  const [reportStart, setReportStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [reportEnd, setReportEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    posGetBillingStats()
      .then((data) => {
        setStats(data);
      })
      .catch((err) => {
        toast.error(err.message || "Failed to load billing stats");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleDownloadReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setDownloading(true);
    try {
      const base64 = await posGenerateReportPDF({
        data: {
          reportType,
          dateRange: { from: reportStart, to: reportEnd }
        }
      });
      
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${base64}`;
      link.download = `POS_Report_${reportType}_${reportStart}_to_${reportEnd}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("PDF report generated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">Analyzing transactions & stock logs...</span>
        </div>
      </div>
    );
  }

  const adminStats = stats?.adminStats;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today's Sales</div>
          <div className="text-xl font-bold text-emerald-400 font-mono">
            {money(stats?.todayRevenue ?? 0)}
          </div>
          <p className="text-[10px] text-muted-foreground">{stats?.todaySalesCount ?? 0} transactions</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-1 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Units Sold Today</div>
          <div className="text-xl font-bold text-primary font-mono">
            {stats?.todayProductsCount ?? 0} units
          </div>
          <p className="text-[10px] text-muted-foreground">supplement/retail stock</p>
        </div>

        {isAdmin && adminStats && (
          <>
            <div className="rounded-2xl border border-border bg-card p-4 space-y-1 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today's Net Profit</div>
              <div className="text-xl font-bold text-indigo-400 font-mono">
                {money(adminStats.todayProfit)}
              </div>
              <p className="text-[10px] text-muted-foreground">after cost of goods sold</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-1 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">This Month Profit</div>
              <div className="text-xl font-bold text-primary font-mono">
                {money(adminStats.thisMonthProfit)}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Last month: {money(adminStats.prevMonthProfit)}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Charts panel */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/40">
            <ReceiptText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm">Monthly Revenue vs Net Profit</h3>
          </div>
          
          {isAdmin && adminStats?.monthlyProfitData ? (
            <div className="h-64 w-full">
              <RechartsResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={adminStats.monthlyProfitData}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <RechartsXAxis dataKey="month" stroke="#9ca3af" fontSize={10} />
                  <RechartsYAxis stroke="#9ca3af" fontSize={10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: "#0b1020", borderColor: "#1f2937" }}
                    labelStyle={{ color: "#ffffff", fontWeight: "bold" }}
                  />
                  <RechartsBar dataKey="revenue" name="Revenue (Rs)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <RechartsBar dataKey="profit" name="Net Profit (Rs)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
              Sales charts are only available for authorized administrators.
            </div>
          )}
        </div>

        {/* Report generator sidebar panel */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/40">
            <CalendarRange className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm">Export PDF Reports</h3>
          </div>

          <form onSubmit={handleDownloadReport} className="space-y-3">
            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Report Type</Label>
              <Select value={reportType} onValueChange={(val: any) => setReportType(val)}>
                <SelectTrigger className="h-9 text-xs bg-muted/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales & Revenue</SelectItem>
                  <SelectItem value="gst">GST Tax Report</SelectItem>
                  {isAdmin && <SelectItem value="profit">Profit/Margin Analysis</SelectItem>}
                  <SelectItem value="inventory">Inventory Evaluation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportType !== "inventory" && (
              <>
                <div>
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">From Date</Label>
                  <Input
                    type="date"
                    value={reportStart}
                    onChange={(e) => setReportStart(e.target.value)}
                    className="h-9 text-xs bg-muted/40"
                    required
                  />
                </div>

                <div>
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">To Date</Label>
                  <Input
                    type="date"
                    value={reportEnd}
                    onChange={(e) => setReportEnd(e.target.value)}
                    className="h-9 text-xs bg-muted/40"
                    required
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              disabled={downloading}
              className="w-full h-9 gradient-primary text-primary-foreground font-semibold mt-2 text-xs"
            >
              {downloading ? (
                <span className="flex items-center gap-1.5 justify-center">
                  <span className="animate-spin text-xs">🔄</span> Generating PDF...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 justify-center">
                  <Download className="h-3.5 w-3.5" /> Download Report
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>

    </div>
  );
}
