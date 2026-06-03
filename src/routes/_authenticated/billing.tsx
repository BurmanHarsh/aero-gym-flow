import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Banknote, CreditCard, Smartphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing · AeroGym OS" }] }),
  component: BillingPage,
});

interface Invoice {
  id: string; invoice_number: string; member_id: string;
  amount_cents: number; total_cents: number; status: string;
  issued_at: string; due_date: string | null;
  member: { full_name: string; member_code: string } | null;
}

function money(c: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(c / 100); }
const TABS = ["all", "pending", "paid", "overdue"] as const;

function BillingPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Invoice | null>(null);

  async function load() {
    setLoading(true);
    let q = supabase.from("invoices").select("*, member:members(full_name, member_code)").order("issued_at", { ascending: false }).limit(200);
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q;
    setRows((data ?? []) as Invoice[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [tab]);

  const totals = {
    pending: rows.filter(r => r.status === "pending").reduce((s, r) => s + r.total_cents, 0),
    paid: rows.filter(r => r.status === "paid").reduce((s, r) => s + r.total_cents, 0),
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Billing</h1>
        <p className="text-sm text-muted-foreground">Invoices, payments and collection.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Pending" value={money(totals.pending)} tone="warning" />
        <KPI label="Paid" value={money(totals.paid)} tone="success" />
        <KPI label="Total invoices" value={rows.length.toString()} tone="primary" />
        <KPI label="Collection rate" value={`${rows.length ? Math.round((rows.filter(r => r.status === "paid").length / rows.length) * 100) : 0}%`} tone="secondary" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${tab === t ? "gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div> :
        rows.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">No invoices in this view.</div> :
        <div className="divide-y divide-border">
          {rows.map((inv) => (
            <button key={inv.id} onClick={() => setActive(inv)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-accent/30">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Wallet className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{inv.member?.full_name ?? "—"}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{inv.invoice_number}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">Issued {new Date(inv.issued_at).toLocaleDateString()}{inv.due_date && ` · Due ${inv.due_date}`}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{money(inv.total_cents)}</div>
                <StatusBadge status={inv.status} />
              </div>
            </button>
          ))}
        </div>}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        {active && <PaymentDialog invoice={active} onClose={() => { setActive(null); load(); }} />}
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, string> = { paid: "bg-success/15 text-success", pending: "bg-warning/15 text-warning", overdue: "bg-destructive/15 text-destructive", cancelled: "bg-muted text-muted-foreground" };
  return <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${m[status] ?? "bg-muted"}`}>{status}</span>;
}

function KPI({ label, value, tone }: { label: string; value: string; tone: "warning" | "success" | "primary" | "secondary" }) {
  const tones: Record<typeof tone, string> = { warning: "text-warning", success: "text-success", primary: "text-primary", secondary: "text-secondary" };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function PaymentDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "bank">("upi");
  const [amount, setAmount] = useState((invoice.total_cents / 100).toString());
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const isPaid = invoice.status === "paid";

  async function record(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const cents = Math.round(parseFloat(amount) * 100);
    const { error } = await supabase.from("payments").insert({ invoice_id: invoice.id, amount_cents: cents, method, reference: ref || null });
    if (error) { toast.error(error.message); setBusy(false); return; }
    if (cents >= invoice.total_cents) {
      await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id);
    }
    toast.success("Payment recorded"); setBusy(false); onClose();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Invoice {invoice.invoice_number}</DialogTitle></DialogHeader>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="text-xs uppercase text-muted-foreground">{invoice.member?.full_name}</div>
        <div className="mt-1 text-2xl font-bold">{money(invoice.total_cents)}</div>
        <StatusBadge status={invoice.status} />
      </div>
      {!isPaid && (
        <form onSubmit={record} className="space-y-3">
          <div>
            <Label>Method</Label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {([["upi", Smartphone, "UPI"], ["cash", Banknote, "Cash"], ["card", CreditCard, "Card"], ["bank", Wallet, "Bank"]] as const).map(([k, Icon, lbl]) => (
                <button type="button" key={k} onClick={() => setMethod(k)} className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition ${method === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" /> {lbl}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Amount (INR)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
          <div><Label>Reference (optional)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Txn id / receipt no." /></div>
          <DialogFooter><Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">{busy ? "Recording…" : "Record payment"}</Button></DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
