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
  Dumbbell,
  Activity,
  Tag,
  Zap,
  Wrench,
  AlertTriangle,
  Factory,
  ShieldAlert,
  Archive,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory · Tank by Tapan" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin");
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
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
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ["Equipment", "Supplements", "Apparel", "Beverages", "Sanitation", "Other"] as const;

function money(c: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(c / 100);
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "Equipment":
      return Dumbbell;
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

function InventoryPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);

  async function load() {
    setLoading(true);
    let query = supabase.from("inventory_items").select("*").order("name", { ascending: true });

    if (categoryFilter !== "all") {
      query = query.eq("category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
    } else {
      let items = (data ?? []) as InventoryItem[];
      
      // Client-side status filtering since stock status depends on quantity vs min_stock_level
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

  useEffect(() => {
    load();
  }, [categoryFilter, statusFilter]);

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
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Monitor equipment, supplements, accessories, and stock levels.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground shadow-glow">
              <Plus className="mr-1 h-4 w-4" /> Add Item
            </Button>
          </DialogTrigger>
          <AddItemDialog onClose={() => { setAddOpen(false); load(); }} />
        </Dialog>
      </header>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Total Catalog Items" value={rows.length.toString()} tone="primary" />
        <KPI label="Stock Valuation" value={money(totals.valuation)} tone="success" />
        <KPI label="Low Stock Items" value={totals.lowStock.toString()} tone="warning" />
        <KPI label="Out of Stock" value={totals.outOfStock.toString()} tone="destructive" />
      </div>

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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] bg-background/50">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
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

      {/* Inventory Items Log */}
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
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-accent/10 transition"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <CatIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-foreground">{item.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tracking-wider uppercase">
                        {item.category}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Factory className="h-3.5 w-3.5" />
                        {item.supplier ?? "No supplier listed"}
                      </span>
                      <span>· Buy: {money(item.purchase_price_cents)}</span>
                      {item.sale_price_cents && <span>· Sell: {money(item.sale_price_cents)}</span>}
                      {item.description && <span className="truncate max-w-[280px]">· {item.description}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <StockPill tone={stockTone} label={stockLabel} />
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
          <EditItemDialog
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
              toast.success("Inventory item deleted permanently");
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
function AddItemDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minStock, setMinStock] = useState("5");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [category, setCategory] = useState<string>("Equipment");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase.from("inventory_items").insert({
      name: name.trim(),
      quantity: parseInt(quantity) || 0,
      min_stock_level: parseInt(minStock) || 5,
      purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
      sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
      category,
      supplier: supplier.trim() || null,
      description: description.trim() || null,
    });

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Inventory item added successfully");
    setBusy(false);
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Inventory Item</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Item Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hex Dumbbell 12.5kg, Optimum Whey 1kg"
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
              placeholder="e.g. FitGear Inc, HealthMart"
            />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Extra details about size, color, specifications..."
            rows={2}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Save Item"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Edit Item Dialog Component */
function EditItemDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [minStock, setMinStock] = useState(item.min_stock_level.toString());
  const [purchasePrice, setPurchasePrice] = useState((item.purchase_price_cents / 100).toString());
  const [salePrice, setSalePrice] = useState(item.sale_price_cents ? (item.sale_price_cents / 100).toString() : "");
  const [category, setCategory] = useState(item.category);
  const [supplier, setSupplier] = useState(item.supplier ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase
      .from("inventory_items")
      .update({
        name: name.trim(),
        quantity: parseInt(quantity) || 0,
        min_stock_level: parseInt(minStock) || 5,
        purchase_price_cents: Math.round(parseFloat(purchasePrice) * 100) || 0,
        sale_price_cents: salePrice ? Math.round(parseFloat(salePrice) * 100) : null,
        category,
        supplier: supplier.trim() || null,
        description: description.trim() || null,
      })
      .eq("id", item.id);

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Inventory item updated successfully");
    setBusy(false);
    onClose();
  }

  return (
    <DialogContent>
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
        <p>Are you sure you want to delete this inventory item: <strong>{item.name}</strong>?</p>
        <p>This action cannot be undone. It will permanently remove the record from your inventory lists.</p>
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
