import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const { error } = await supabase
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
    });
    
  if (error) throw error;
}

async function updateInventoryItem(item: Partial<InventoryItem> & { id: string }) {
  const { error } = await supabase
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
  const [activeTab, setActiveTab] = useState<"catalog" | "sales">("catalog");

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
            </div>
          )}

          {activeTab === "catalog" ? (
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
      ) : (
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

        <div className="grid grid-cols-2 gap-3">
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

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
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

function POSCartView({ rows, cart, setCart, onClose, userId }: POSCartViewProps) {
  const [posSearch, setPosSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");
  const [busy, setBusy] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number; upto: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [allProfiles, setAllProfiles] = useState<{ email: string; full_name: string | null }[]>([]);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const sendSaleEmailFn = useServerFn(sendInventorySaleEmail);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("email, full_name")
      .then(({ data }) => {
        if (data) setAllProfiles(data);
      });
  }, []);

  const sellableItems = rows.filter(
    (item) => item.sale_price_cents && item.sale_price_cents > 0 && item.quantity > 0
  );

  const filteredItems = sellableItems.filter((item) =>
    item.name.toLowerCase().includes(posSearch.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(posSearch.toLowerCase())) ||
    (item.supplier && item.supplier.toLowerCase().includes(posSearch.toLowerCase()))
  );

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
    setAppliedCoupon(null);
  };

  async function applyCoupon() {
    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }
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
        toast.error("Invalid or expired coupon code");
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          percent: data.discount_percent,
          upto: data.discount_upto_cents,
        });
        toast.success(`Coupon "${data.code}" applied successfully!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to validate coupon");
    } finally {
      setCheckingCoupon(false);
    }
  }

  const totalCents = cart.reduce(
    (acc, val) => acc + val.quantity * (val.item.sale_price_cents ?? 0),
    0
  );

  let discountCents = 0;
  if (appliedCoupon && totalCents > 0) {
    discountCents = Math.min((totalCents * appliedCoupon.percent) / 100, appliedCoupon.upto);
  }
  const finalTotalCents = totalCents - discountCents;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    const emailToUse = buyerEmail.trim();
    if (!emailToUse) {
      toast.error("Customer Email is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToUse)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      let distributedDiscountSum = 0;
      const saleInserts = cart.map((c, index) => {
        const grossCents = c.quantity * (c.item.sale_price_cents ?? 0);
        
        let itemDiscount = 0;
        if (discountCents > 0 && totalCents > 0) {
          if (index === cart.length - 1) {
            itemDiscount = discountCents - distributedDiscountSum;
          } else {
            itemDiscount = Math.round((grossCents / totalCents) * discountCents);
            distributedDiscountSum += itemDiscount;
          }
        }
        
        const netCents = Math.max(0, grossCents - itemDiscount);

        return supabase.from("inventory_sales").insert({
          item_id: c.item.id,
          item_name: c.item.name,
          quantity: c.quantity,
          sale_price_cents: c.item.sale_price_cents ?? 0,
          total_amount_cents: netCents,
          sold_by: userId || null,
          payment_method: paymentMethod,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
          coupon_discount_cents: itemDiscount,
          buyer_email: buyerEmail.trim() || null,
        });
      });

      const itemUpdates = cart.map((c) =>
        supabase
          .from("inventory_items")
          .update({ quantity: c.item.quantity - c.quantity })
          .eq("id", c.item.id)
      );

      const results = await Promise.all([...saleInserts, ...itemUpdates]);
      
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;

      // Send receipt email to the buyer
      const matchedProfile = allProfiles.find(p => p.email.toLowerCase() === emailToUse.toLowerCase());
      const customerName = matchedProfile?.full_name || "Customer";
      const emailItems = cart.map(c => ({
        name: c.item.name,
        quantity: c.quantity,
        price: money(c.quantity * (c.item.sale_price_cents ?? 0)),
      }));

      try {
        await sendSaleEmailFn({
          data: {
            to: emailToUse,
            name: customerName,
            items: emailItems,
            totalAmount: money(finalTotalCents),
            paymentMethod,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            discountAmount: appliedCoupon ? money(discountCents) : null,
          }
        });
      } catch (emailErr) {
        console.error("Failed to send sale receipt email:", emailErr);
        toast.error("Receipt email failed to send, but checkout succeeded.");
      }

      toast.success("Transaction completed successfully!");
      setCart([]);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to process transaction");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] animate-in fade-in duration-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Select Products</h2>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Search products..."
              className="pl-9 bg-card"
            />
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No sellable products found.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredItems.map((item) => {
              const CatIcon = getCategoryIcon(item.category);
              const cartItem = cart.find((i) => i.item.id === item.id);
              const remainingStock = item.quantity - (cartItem?.quantity ?? 0);

              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <CatIcon className="h-4 w-4" />
                      </div>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase">
                        {item.category}
                      </span>
                    </div>

                    <div className="mt-3">
                      <h4 className="font-semibold text-foreground truncate">{item.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.supplier ?? "No supplier"}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border/40">
                    <div>
                      <div className="text-sm font-bold text-foreground">{money(item.sale_price_cents ?? 0)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {remainingStock > 0 ? `${remainingStock} in stock` : "Max added"}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => addToCart(item)}
                      disabled={remainingStock <= 0}
                      className="h-8 px-3 gradient-primary text-primary-foreground shadow-sm"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between min-h-[500px]">
        <div className="space-y-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Shopping Cart</h3>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {cart.reduce((sum, c) => sum + c.quantity, 0)} items
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium">Cart is empty</p>
              <p className="text-xs mt-0.5">Click "Add" on any product to build a sale.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[300px] divide-y divide-border/60 pr-1 scrollbar-thin">
              {cart.map((c) => (
                <div key={c.item.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground truncate">{c.item.name}</div>
                    <div className="text-muted-foreground mt-0.5">{money(c.item.sale_price_cents ?? 0)} each</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateQty(c.item.id, c.quantity - 1, c.item.quantity)}
                      className="h-6 w-6 rounded border border-border hover:bg-muted text-foreground flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-semibold">{c.quantity}</span>
                    <button
                      onClick={() => updateQty(c.item.id, c.quantity + 1, c.item.quantity)}
                      className="h-6 w-6 rounded border border-border hover:bg-muted text-foreground flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(c.item.id)}
                      className="ml-1 h-6 w-6 text-muted-foreground hover:text-destructive flex items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-border pt-4 mt-4">
          {cart.length > 0 && (
            <>
              <div className="relative">
                <Label htmlFor="buyer-email" className="mb-2 block text-xs uppercase font-medium text-muted-foreground">
                  Customer Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="buyer-email"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => {
                    setBuyerEmail(e.target.value);
                    setShowEmailSuggestions(true);
                  }}
                  onFocus={() => setShowEmailSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
                  placeholder="Enter or search customer email..."
                  disabled={busy}
                  className="bg-card h-9 text-xs"
                  required
                />
                {showEmailSuggestions && buyerEmail.length >= 3 && (
                  (() => {
                    const filteredProfiles = allProfiles.filter(p => p.email.toLowerCase().includes(buyerEmail.toLowerCase()));
                    if (filteredProfiles.length === 0) return null;
                    return (
                      <ul className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-lg divide-y divide-border/60">
                        {filteredProfiles.map((p) => (
                          <li
                            key={p.email}
                            onMouseDown={() => {
                              setBuyerEmail(p.email);
                              setShowEmailSuggestions(false);
                            }}
                            className="px-3 py-1.5 text-xs hover:bg-muted cursor-pointer transition flex flex-col gap-0.5"
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

              <div>
                <Label className="mb-2 block text-xs uppercase font-medium text-muted-foreground">Coupon Code (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="e.g. WELCOME10"
                    disabled={busy || checkingCoupon}
                    className="bg-card uppercase font-mono h-9 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyCoupon}
                    disabled={busy || checkingCoupon || !couponCode}
                    className="shrink-0 h-9 text-xs"
                  >
                    {checkingCoupon ? "Applying..." : "Apply"}
                  </Button>
                </div>
                {appliedCoupon && (
                  <p className="mt-1 text-xs text-emerald-400 font-medium">
                    Coupon applied! {appliedCoupon.percent}% off (max Rs {appliedCoupon.upto / 100})
                  </p>
                )}
              </div>

              <div>
                <Label className="mb-2 block text-xs uppercase font-medium text-muted-foreground">Payment Method</Label>
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

              <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{money(totalCents)}</span>
                </div>
                {discountCents > 0 && (
                  <div className="flex justify-between text-emerald-400 font-medium">
                    <span>Discount:</span>
                    <span>- {money(discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/40 pt-1.5 font-bold text-foreground text-sm">
                  <span>Total Charge:</span>
                  <span className="text-primary">{money(finalTotalCents)}</span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={busy || cart.length === 0 || !buyerEmail.trim()}
                className="w-full gradient-primary text-primary-foreground font-semibold shadow-glow"
              >
                {busy ? "Processing transaction..." : "Complete Sale"}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="w-full border-dashed border-border hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
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
