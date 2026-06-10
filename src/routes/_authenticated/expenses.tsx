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
  Wallet,
  Building,
  Zap,
  Briefcase,
  Dumbbell,
  Wrench,
  Megaphone,
  Receipt,
  Plus,
  Search,
  Trash2,
  Edit2,
  Calendar,
  CreditCard,
  Banknote,
  Smartphone,
  ShieldAlert,
  Download,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses · Tank by Tapan" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).in("role", ["admin", "front_desk"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: ExpensesPage,
});

interface Expense {
  id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  category: string;
  date: string;
  payment_method: string;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ["Rent", "Utilities", "Salaries", "Equipment", "Maintenance", "Marketing", "Other"] as const;
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Card"] as const;

function money(c: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(c / 100);
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "Rent":
      return Building;
    case "Utilities":
      return Zap;
    case "Salaries":
      return Briefcase;
    case "Equipment":
      return Dumbbell;
    case "Maintenance":
      return Wrench;
    case "Marketing":
      return Megaphone;
    default:
      return Receipt;
  }
}

function getMethodIcon(method: string) {
  switch (method) {
    case "Card":
      return CreditCard;
    case "Bank Transfer":
      return Wallet;
    case "UPI":
      return Smartphone;
    default:
      return Banknote;
  }
}

function ExpensesPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  async function load() {
    setLoading(true);
    let query = supabase.from("expenses").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    
    if (categoryFilter !== "all") {
      query = query.eq("category", categoryFilter);
    }
    if (methodFilter !== "all") {
      query = query.eq("payment_method", methodFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as Expense[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [categoryFilter, methodFilter]);

  const filtered = rows.filter((r) => {
    const term = q.toLowerCase();
    return !term || r.title.toLowerCase().includes(term) || (r.description && r.description.toLowerCase().includes(term));
  });

  const totals = {
    total: rows.reduce((s, r) => s + r.amount_cents, 0),
    rent: rows.filter((r) => r.category === "Rent").reduce((s, r) => s + r.amount_cents, 0),
    salaries: rows.filter((r) => r.category === "Salaries").reduce((s, r) => s + r.amount_cents, 0),
    utilities: rows.filter((r) => r.category === "Utilities").reduce((s, r) => s + r.amount_cents, 0),
  };

  function handleExportCSV() {
    if (filtered.length === 0) {
      toast.error("No expenses to export");
      return;
    }
    const dataToExport = filtered.map(r => ({
      "Title": r.title,
      "Category": r.category,
      "Amount (INR)": r.amount_cents / 100,
      "Date": new Date(r.date).toLocaleDateString(),
      "Payment Method": r.payment_method,
      "Description": r.description ?? ""
    }));

    const headers = Object.keys(dataToExport[0]).join(",");
    const csvRows = dataToExport.map(row => 
      Object.values(row).map(val => {
        const str = String(val).replace(/"/g, '""');
        return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
      }).join(",")
    );
    const csvContent = "\uFEFF" + [headers, ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `expenses_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV export downloaded");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Expense Management</h1>
          <p className="text-sm text-muted-foreground">Track operating expenses, rent, payouts, and utility bills.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-glow">
                <Plus className="mr-1 h-4 w-4" /> Add Expense
              </Button>
            </DialogTrigger>
            <AddExpenseDialog onClose={() => { setAddOpen(false); load(); }} />
          </Dialog>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Total Expenses" value={money(totals.total)} tone="destructive" />
        <KPI label="Rent & Space" value={money(totals.rent)} tone="primary" />
        <KPI label="Staff Payouts" value={money(totals.salaries)} tone="success" />
        <KPI label="Utilities & Bills" value={money(totals.utilities)} tone="warning" />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search expenses..."
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
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[145px] bg-background/50">
                <SelectValue placeholder="Payment Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Expense Log */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading expenses...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No expenses found matching the criteria.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((item) => {
              const CatIcon = getCategoryIcon(item.category);
              const MethodIcon = getMethodIcon(item.payment_method);
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
                      <span className="font-medium text-foreground">{item.title}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tracking-wider uppercase">
                        {item.category}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(item.date).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MethodIcon className="h-3.5 w-3.5" />
                        {item.payment_method}
                      </span>
                      {item.description && <span className="truncate max-w-[280px]">· {item.description}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-foreground">{money(item.amount_cents)}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        onClick={() => setEditingExpense(item)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        onClick={() => setDeletingExpense(item)}
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

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(o) => !o && setEditingExpense(null)}>
        {editingExpense && (
          <EditExpenseDialog
            expense={editingExpense}
            onClose={() => { setEditingExpense(null); load(); }}
          />
        )}
      </Dialog>

      {/* Delete Expense Dialog */}
      <Dialog open={!!deletingExpense} onOpenChange={(o) => !o && setDeletingExpense(null)}>
        {deletingExpense && (
          <DeleteExpenseConfirm
            expense={deletingExpense}
            onClose={() => setDeletingExpense(null)}
            onConfirm={async () => {
              if (!deletingExpense) return;
              const { error } = await supabase.from("expenses").delete().eq("id", deletingExpense.id);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Expense record deleted permanently");
              setDeletingExpense(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
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

/* Add Expense Dialog Component */
function AddExpenseDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Rent");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<string>("Bank Transfer");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    const { error } = await supabase.from("expenses").insert({
      title: title.trim(),
      amount_cents: Math.round(parseFloat(amount) * 100),
      category,
      date,
      payment_method: paymentMethod,
      description: description.trim() || null,
      recorded_by: userId,
    });

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Expense logged successfully");
    setBusy(false);
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Log New Expense</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. June Rent, Electricity Bill"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount (Rs)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
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
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Description (Optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional details about the expense"
            rows={2}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Save Expense"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Edit Expense Dialog Component */
function EditExpenseDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState((expense.amount_cents / 100).toString());
  const [category, setCategory] = useState(expense.category);
  const [date, setDate] = useState(expense.date);
  const [paymentMethod, setPaymentMethod] = useState(expense.payment_method);
  const [description, setDescription] = useState(expense.description ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase
      .from("expenses")
      .update({
        title: title.trim(),
        amount_cents: Math.round(parseFloat(amount) * 100),
        category,
        date,
        payment_method: paymentMethod,
        description: description.trim() || null,
      })
      .eq("id", expense.id);

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Expense updated successfully");
    setBusy(false);
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Expense Details</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount (Rs)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
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
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

/* Delete Expense Confirmation Component */
function DeleteExpenseConfirm({ expense, onClose, onConfirm }: { expense: Expense; onClose: () => void; onConfirm: () => Promise<void> }) {
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
        <p>Are you sure you want to delete this expense record: <strong>{expense.title}</strong>?</p>
        <p>This action cannot be undone. It will permanently remove the record from your expense logs.</p>
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
