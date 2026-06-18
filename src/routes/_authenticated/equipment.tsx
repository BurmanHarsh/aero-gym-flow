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
  Plus,
  Search,
  Trash2,
  Edit2,
  Dumbbell,
  Wrench,
  Factory,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/equipment")({
  head: () => ({ meta: [{ title: "Equipment & Servicing · Tank by Tapan" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).in("role", ["admin"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: EquipmentPage,
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
  created_at: string;
  updated_at: string;
  // Servicing fields
  last_serviced_at?: string | null;
  next_service_due?: string | null;
  servicing_notes?: string | null;
  condition?: "working" | "needs_service" | "repairing" | "broken" | null;
}

interface EquipmentExtra {
  last_serviced_at?: string | null;
  next_service_due?: string | null;
  servicing_notes?: string | null;
  condition?: "working" | "needs_service" | "repairing" | "broken" | null;
}

function money(c: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(c / 100);
}

// Local Storage Fallback Sync
const getStoredServicing = (): Record<string, EquipmentExtra> => {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("equipment_servicing_data");
  if (!stored) return {};
  try {
    return JSON.parse(stored) as Record<string, EquipmentExtra>;
  } catch {
    return {};
  }
};

const saveStoredServicing = (data: Record<string, EquipmentExtra>) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("equipment_servicing_data", JSON.stringify(data));
  }
};

async function insertInventoryItem(item: Omit<InventoryItem, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      name: item.name,
      quantity: item.quantity,
      min_stock_level: item.min_stock_level,
      purchase_price_cents: item.purchase_price_cents,
      sale_price_cents: item.sale_price_cents,
      category: "Equipment",
      supplier: item.supplier,
      description: item.description,
      last_serviced_at: item.last_serviced_at,
      next_service_due: item.next_service_due,
      servicing_notes: item.servicing_notes,
      condition: item.condition,
    } as any)
    .select()
    .single();

  if (error) {
    console.warn("Supabase insert with servicing columns failed, trying fallback:", error.message);
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from("inventory_items")
      .insert({
        name: item.name,
        quantity: item.quantity,
        min_stock_level: item.min_stock_level,
        purchase_price_cents: item.purchase_price_cents,
        sale_price_cents: item.sale_price_cents,
        category: "Equipment",
        supplier: item.supplier,
        description: item.description,
      })
      .select()
      .single();
      
    if (fallbackErr) throw fallbackErr;
    
    if (fallbackData) {
      const stored = getStoredServicing();
      stored[fallbackData.id] = {
        last_serviced_at: item.last_serviced_at,
        next_service_due: item.next_service_due,
        servicing_notes: item.servicing_notes,
        condition: item.condition,
      };
      saveStoredServicing(stored);
    }
  } else if (data) {
    const stored = getStoredServicing();
    stored[data.id] = {
      last_serviced_at: item.last_serviced_at,
      next_service_due: item.next_service_due,
      servicing_notes: item.servicing_notes,
      condition: item.condition,
    };
    saveStoredServicing(stored);
  }
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
      category: "Equipment",
      supplier: item.supplier,
      description: item.description,
      last_serviced_at: item.last_serviced_at,
      next_service_due: item.next_service_due,
      servicing_notes: item.servicing_notes,
      condition: item.condition,
    } as any)
    .eq("id", item.id);

  if (error) {
    console.warn("Supabase update with servicing columns failed, trying fallback:", error.message);
    const { error: fallbackErr } = await supabase
      .from("inventory_items")
      .update({
        name: item.name,
        quantity: item.quantity,
        min_stock_level: item.min_stock_level,
        purchase_price_cents: item.purchase_price_cents,
        sale_price_cents: item.sale_price_cents,
        category: "Equipment",
        supplier: item.supplier,
        description: item.description,
      })
      .eq("id", item.id);
      
    if (fallbackErr) throw fallbackErr;
  }

  const stored = getStoredServicing();
  stored[item.id] = {
    last_serviced_at: item.last_serviced_at,
    next_service_due: item.next_service_due,
    servicing_notes: item.servicing_notes,
    condition: item.condition,
  };
  saveStoredServicing(stored);
}

function EquipmentPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);

  async function load() {
    setLoading(true);
    let { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("category", "Equipment")
      .order("name", { ascending: true });

    if (error) {
      toast.error(error.message);
    } else {
      let items = (data ?? []) as InventoryItem[];
      
      // Merge extra local storage data
      const storedData = getStoredServicing();
      items = items.map((item) => {
        const extra = storedData[item.id] || {};
        return {
          ...item,
          last_serviced_at: item.last_serviced_at ?? extra.last_serviced_at ?? null,
          next_service_due: item.next_service_due ?? extra.next_service_due ?? null,
          servicing_notes: item.servicing_notes ?? extra.servicing_notes ?? null,
          condition: item.condition ?? extra.condition ?? "working",
        };
      });

      // Filter based on stock status client-side
      if (statusFilter !== "all") {
        items = items.filter((item) => {
          if (statusFilter === "out") return item.quantity === 0;
          if (statusFilter === "low") return item.quantity > 0 && item.quantity <= item.min_stock_level;
          if (statusFilter === "ok") return item.quantity > item.min_stock_level;
          return true;
        });
      }

      // Filter based on condition
      if (conditionFilter !== "all") {
        items = items.filter((item) => item.condition === conditionFilter);
      }

      setRows(items);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [statusFilter, conditionFilter]);

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
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Equipment & Servicing</h1>
          <p className="text-sm text-muted-foreground">
            Monitor gym machines, weights, maintenance logs, and servicing status.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground shadow-glow">
              <Plus className="mr-1 h-4 w-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <AddEquipmentDialog onClose={() => { setAddOpen(false); load(); }} />
        </Dialog>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Total Equipment Items" value={rows.length.toString()} tone="primary" />
        <KPI label="Equipment Valuation" value={money(totals.valuation)} tone="success" />
        <KPI label="Low Stock Equipment" value={totals.lowStock.toString()} tone="warning" />
        <KPI label="Out of Stock" value={totals.outOfStock.toString()} tone="destructive" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search equipment, descriptions, suppliers..."
            className="pl-9 bg-background/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="w-[145px] bg-background/50">
                <SelectValue placeholder="Condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conditions</SelectItem>
                <SelectItem value="working">Working</SelectItem>
                <SelectItem value="needs_service">Needs Service</SelectItem>
                <SelectItem value="repairing">Repairing</SelectItem>
                <SelectItem value="broken">Broken</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[145px] bg-background/50">
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

      {/* Equipment List */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading equipment...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No equipment items match the criteria.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((item) => {
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
                  className="flex flex-col gap-3 px-5 py-4 hover:bg-accent/10 transition sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground mt-0.5">
                      <Dumbbell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-foreground">{item.name}</span>
                        {item.condition && (
                          <ConditionPill condition={item.condition} />
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Factory className="h-3.5 w-3.5" />
                          {item.supplier ?? "No supplier listed"}
                        </span>
                        <StockPill tone={stockTone} label={stockLabel} />
                        {item.description && <span className="truncate max-w-[280px]">· {item.description}</span>}
                      </div>

                      {/* Equipment-specific Servicing Row */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground border border-border/20 max-w-2xl">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-primary" />
                          Serviced: <strong>{item.last_serviced_at ? new Date(item.last_serviced_at).toLocaleDateString() : "Never"}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Wrench className="h-3 w-3 text-secondary" />
                          Next due: <strong>{item.next_service_due ? new Date(item.next_service_due).toLocaleDateString() : "Not scheduled"}</strong>
                        </span>
                        {item.servicing_notes && (
                          <span className="truncate max-w-[250px]">
                            Note: <em>{item.servicing_notes}</em>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 shrink-0 sm:justify-end">
                    <div className="text-right text-xs">
                      <div className="font-semibold text-foreground">Buy: {money(item.purchase_price_cents)}</div>
                      {item.sale_price_cents ? (
                        <div className="text-[11px] text-muted-foreground">Sell: {money(item.sale_price_cents)}</div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground italic">Not for retail</div>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        onClick={() => setEditingItem(item)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        onClick={() => setDeletingItem(item)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-muted"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Item Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
        {editingItem && (
          <EditEquipmentDialog
            item={editingItem}
            onClose={() => { setEditingItem(null); load(); }}
          />
        )}
      </Dialog>

      {/* Delete Item Dialog */}
      <Dialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
        {deletingItem && (
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
              toast.success("Equipment deleted permanently");
              setDeletingItem(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
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

function ConditionPill({ condition }: { condition: string }) {
  const map: Record<string, string> = {
    working: "bg-success/15 text-success",
    needs_service: "bg-warning/15 text-warning",
    repairing: "bg-info/15 text-info",
    broken: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold capitalize border border-current/20 ${map[condition] ?? "bg-muted text-muted-foreground"}`}>
      {condition.replace("_", " ")}
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

/* Add Equipment Dialog */
function AddEquipmentDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [minStock, setMinStock] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<string>("working");
  const [lastServiced, setLastServiced] = useState("");
  const [nextServiceDue, setNextServiceDue] = useState("");
  const [servicingNotes, setServicingNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      await insertInventoryItem({
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        min_stock_level: parseInt(minStock) || 1,
        purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
        sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
        category: "Equipment",
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        condition: condition as any,
        last_serviced_at: lastServiced || null,
        next_service_due: nextServiceDue || null,
        servicing_notes: servicingNotes || null,
      });

      toast.success("Equipment added successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to add equipment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin">
      <DialogHeader>
        <DialogTitle>Add Equipment</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Equipment Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Treadmill Pro T5, Cable Crossover Station"
            required
          />
        </div>
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
            <Label>Min Stock Level (Warning)</Label>
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
              placeholder="If reselling to members"
            />
          </div>
        </div>
        <div>
          <Label>Supplier Name</Label>
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="e.g. FitGear India, Lifeline Fitness"
          />
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4.5 space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Servicing & Condition Details</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Current Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="working">Working</SelectItem>
                  <SelectItem value="needs_service">Needs Service</SelectItem>
                  <SelectItem value="repairing">Repairing</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Last Serviced At</Label>
              <Input
                type="date"
                value={lastServiced}
                onChange={(e) => setLastServiced(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Next Service Due Date</Label>
            <Input
              type="date"
              value={nextServiceDue}
              onChange={(e) => setNextServiceDue(e.target.value)}
            />
          </div>

          <div>
            <Label>Servicing & Maintenance Notes</Label>
            <Textarea
              value={servicingNotes}
              onChange={(e) => setServicingNotes(e.target.value)}
              placeholder="Include specific issue details, parts required or maintenance schedule..."
              rows={2}
            />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brand, color, dimensions, specifications..."
            rows={2}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Save Equipment"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Edit Equipment Dialog */
function EditEquipmentDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [minStock, setMinStock] = useState(item.min_stock_level.toString());
  const [purchasePrice, setPurchasePrice] = useState((item.purchase_price_cents / 100).toString());
  const [salePrice, setSalePrice] = useState(item.sale_price_cents ? (item.sale_price_cents / 100).toString() : "");
  const [supplier, setSupplier] = useState(item.supplier ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [condition, setCondition] = useState<string>(item.condition ?? "working");
  const [lastServiced, setLastServiced] = useState(item.last_serviced_at ? item.last_serviced_at.slice(0, 10) : "");
  const [nextServiceDue, setNextServiceDue] = useState(item.next_service_due ? item.next_service_due.slice(0, 10) : "");
  const [servicingNotes, setServicingNotes] = useState(item.servicing_notes ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      await updateInventoryItem({
        id: item.id,
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        min_stock_level: parseInt(minStock) || 1,
        purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
        sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
        category: "Equipment",
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        condition: condition as any,
        last_serviced_at: lastServiced || null,
        next_service_due: nextServiceDue || null,
        servicing_notes: servicingNotes || null,
      });

      toast.success("Equipment updated successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update equipment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin">
      <DialogHeader>
        <DialogTitle>Edit Equipment</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Equipment Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
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
            <Label>Min Stock Level (Warning)</Label>
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
        <div>
          <Label>Supplier Name</Label>
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4.5 space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Servicing & Condition Details</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Current Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="working">Working</SelectItem>
                  <SelectItem value="needs_service">Needs Service</SelectItem>
                  <SelectItem value="repairing">Repairing</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Last Serviced At</Label>
              <Input
                type="date"
                value={lastServiced}
                onChange={(e) => setLastServiced(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Next Service Due Date</Label>
            <Input
              type="date"
              value={nextServiceDue}
              onChange={(e) => setNextServiceDue(e.target.value)}
            />
          </div>

          <div>
            <Label>Servicing & Maintenance Notes</Label>
            <Textarea
              value={servicingNotes}
              onChange={(e) => setServicingNotes(e.target.value)}
              placeholder="Include specific issue details, parts required or maintenance schedule..."
              rows={2}
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
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
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
        <p>Are you sure you want to delete this equipment item: <strong>{item.name}</strong>?</p>
        <p>This action cannot be undone. It will permanently remove the record from your equipment lists.</p>
      </div>
      <DialogFooter className="pt-4 gap-2">
        <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
        <Button onClick={handleDelete} variant="destructive" disabled={busy}>
          {busy ? "Deleting..." : "Delete Permanently"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
