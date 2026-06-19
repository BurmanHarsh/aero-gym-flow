import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { revertStripePayment } from "@/lib/aerogym/billing.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Banknote, CreditCard, Smartphone, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { sendReceiptEmail } from "@/lib/aerogym/email.functions";


export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing · Tank by Tapan" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).in("role", ["admin"]);
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: BillingPage,
});

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price_cents: number;
}

interface Invoice {
  id: string; invoice_number: string; member_id: string;
  amount_cents: number; total_cents: number; status: string;
  issued_at: string; due_date: string | null;
  coupon_code?: string | null; coupon_discount_cents?: number | null;
  member: { full_name: string; member_code: string; email: string | null } | null;
}

function money(c: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(c / 100); }
const TABS = ["all", "pending", "paid", "overdue"] as const;

function BillingPage() {
  const me = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Invoice | null>(null);
  const isStaff = me.isAdmin;
  const [issueOpen, setIssueOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    supabase.from("membership_plans").select("*").eq("active", true).then(({ data }) => {
      setPlans(data as Plan[] ?? []);
    });
  }, []);

  function handleExportPDF() {
    if (rows.length === 0) {
      toast.error("No invoices to export");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups to export PDF.");
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Invoices Report - Tank by Tapan</title>
          <style>
            body {
              font-family: ui-sans-serif, system-ui, sans-serif;
              background-color: #ffffff;
              color: #111827;
              padding: 24px;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 4px;
              color: #14b8a6;
            }
            .subtitle {
              font-size: 14px;
              color: #6b7280;
              margin-bottom: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
            }
            th, td {
              border-bottom: 1px solid #e5e7eb;
              padding: 12px 8px;
              text-align: left;
              font-size: 13px;
            }
            th {
              background-color: #f9fafb;
              font-weight: 600;
              color: #374151;
            }
            .status-paid {
              color: #059669;
              font-weight: 600;
            }
            .status-pending {
              color: #d97706;
              font-weight: 600;
            }
            .status-refunded {
              color: #2563eb;
              font-weight: 600;
            }
            .status-overdue {
              color: #dc2626;
              font-weight: 600;
            }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Tank by Tapan</h1>
          <div class="subtitle">Invoices Report · Generated on ${new Date().toLocaleDateString()}</div>
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Member Name</th>
                <th>Member Code</th>
                <th>Amount (INR)</th>
                <th>Status</th>
                <th>Issued Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td style="font-family: monospace;">${r.invoice_number}</td>
                  <td>${r.member?.full_name ?? "Walk-in Member"}</td>
                  <td style="font-family: monospace;">${r.member?.member_code ?? "—"}</td>
                  <td>Rs ${((r.total_cents) / 100).toLocaleString()}</td>
                  <td><span class="status-${r.status}">${r.status.toUpperCase()}</span></td>
                  <td>${new Date(r.issued_at).toLocaleDateString()}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  async function load() {
    if (me.loading) return;
    setLoading(true);
    const isStaff = me.isAdmin || me.roles.includes("front_desk");
    if (!isStaff) {
      setLoading(false);
      return;
    }
    let q = supabase.from("invoices").select("*, member:members(full_name, member_code, email)").order("issued_at", { ascending: false }).limit(200);
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q;
    setRows((data ?? []) as Invoice[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [tab, me.loading, me.isAdmin, me.user?.id]);

  const totals = {
    pending: rows.filter(r => r.status === "pending").reduce((s, r) => s + r.total_cents, 0),
    paid: rows.filter(r => r.status === "paid").reduce((s, r) => s + r.total_cents, 0),
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Billing</h1>
        <p className="text-sm text-muted-foreground">Invoices, payments and collection health.</p>
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
        <div className="flex items-center gap-2">
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="h-9 text-xs">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Export PDF
          </Button>
          {isStaff && (
            <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gradient-primary text-primary-foreground shadow-glow h-9 text-xs">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Issue Invoice
                </Button>
              </DialogTrigger>
              <IssueInvoiceDialog plans={plans} onClose={() => { setIssueOpen(false); load(); }} />
            </Dialog>
          )}
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
  const m: Record<string, string> = { paid: "bg-success/15 text-success", pending: "bg-warning/15 text-warning", overdue: "bg-destructive/15 text-destructive", cancelled: "bg-muted text-muted-foreground", refunded: "bg-blue-500/15 text-blue-400" };
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
  const me = useCurrentUser();
  const isStaff = me.isStaff;
  const receiptEmail = useServerFn(sendReceiptEmail);
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "bank">("upi");
  const [amount, setAmount] = useState((invoice.total_cents / 100).toString());
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isPaid = invoice.status === "paid";
  const revertPayment = useServerFn(revertStripePayment);
  const [payments, setPayments] = useState<Array<{ id: string; amount_cents: number; method: string; reference: string | null; created_at?: string }>>([]);

  async function record(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);

    const cents = Math.round(parseFloat(amount) * 100);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("payments").insert({ invoice_id: invoice.id, amount_cents: cents, method, reference: ref || null, recorded_by: userData.user?.id ?? null });
    if (error) { toast.error(error.message); setBusy(false); return; }
    if (cents >= invoice.total_cents) {
      await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id);
      
      // Trigger receipt email if member has an email address
      if (invoice.member?.email) {
        receiptEmail({
          data: {
            to: invoice.member.email,
            name: invoice.member.full_name,
            invoiceNumber: invoice.invoice_number,
            amount: money(cents),
            method: method
          }
        }).catch((err) => {
          console.error("Failed to send payment receipt email:", err);
        });
      }
    }
    toast.success("Payment recorded"); setBusy(false); onClose();
  }

  useEffect(() => {
    let mounted = true;
    supabase.from("payments").select("id, amount_cents, method, reference, created_at").eq("invoice_id", invoice.id).order("created_at", { ascending: false }).then(({ data }) => {
      if (!mounted) return;
      setPayments((data ?? []) as any);
    });
    return () => { mounted = false; };
  }, [invoice.id]);

  async function handleRevert(paymentId: string) {
    setConfirmingPaymentId(paymentId);
  }

  async function confirmRevert() {
    if (!confirmingPaymentId) return;
    try {
      setBusy(true);
      const res = await revertPayment({ data: { paymentId: confirmingPaymentId } });
      toast.success("Payment reverted successfully");
      setConfirmingPaymentId(null);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revert payment");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteInvoice() {
    try {
      setBusy(true);
      const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
      if (error) throw error;
      toast.success("Invoice deleted successfully");
      setConfirmingDelete(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete invoice");
    } finally {
      setBusy(false);
    }
  }


  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invoice {invoice.invoice_number}</DialogTitle>
      </DialogHeader>
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground">{invoice.member?.full_name}</div>
          {invoice.member?.email && (
            <div className="text-xs text-muted-foreground mt-0.5">{invoice.member.email}</div>
          )}
          <div className="mt-1 text-2xl font-bold">{money(invoice.total_cents)}</div>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={invoice.status} />
            {invoice.coupon_code && (
              <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                Coupon: {invoice.coupon_code} (-{money(invoice.coupon_discount_cents ?? 0)})
              </span>
            )}
          </div>
        </div>
        {me.isAdmin && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)} disabled={busy} className="gradient-destructive shrink-0">
            Delete Invoice
          </Button>
        )}
      </div>
      {payments.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-medium">Payments</div>
          <div className="space-y-2">
            {payments.map((p) => {
              const alreadyReverted = p.amount_cents <= 0 || payments.some((x) => x.reference === `revert:${p.id}` || (x.reference && x.reference.includes(`revert:${p.id}`)));
              return (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-card p-2">
                  <div className="text-sm">
                    <div className="font-medium">{money(p.amount_cents)}</div>
                    <div className="text-xs text-muted-foreground">{p.method}{p.reference ? ` · ${p.reference}` : ""}</div>
                  </div>
                  <div>
                    {isStaff && !alreadyReverted && (
                      <Button variant="destructive" size="sm" onClick={() => handleRevert(p.id)} disabled={busy}>
                        Revert payment
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
          <div>
            <Label>Amount (INR)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Txn id / receipt no." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
              {busy ? "Processing..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      )}

      {/* Revert Payment Confirmation Dialog */}
      <Dialog open={!!confirmingPaymentId} onOpenChange={(o) => !o && setConfirmingPaymentId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revert Payment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to revert this payment? The invoice will return to pending status.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmingPaymentId(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRevert} disabled={busy} className="gradient-destructive">
              {busy ? "Reverting..." : "Revert Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Invoice Confirmation Dialog */}
      <Dialog open={confirmingDelete} onOpenChange={(o) => !o && setConfirmingDelete(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this invoice? This action is permanent and will also delete all associated payments.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteInvoice} disabled={busy} className="gradient-destructive">
              {busy ? "Deleting..." : "Delete Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DialogContent>
  );
}

function IssueInvoiceDialog({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const [members, setMembers] = useState<Array<{ id: string; full_name: string; member_code: string }>>([]);
  const [memberId, setMemberId] = useState("");
  const [title, setTitle] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "bank">("upi");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("members").select("id, full_name, member_code").order("full_name").then(({ data }) => {
      setMembers(data ?? []);
      if (data && data.length > 0) setMemberId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (planId) {
      const plan = plans.find(p => p.id === planId);
      if (plan) {
        setTitle(`Membership Plan - ${plan.name}`);
        setAmount((plan.price_cents / 100).toString());
      }
    }
  }, [planId, plans]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId || !title.trim() || !amount) {
      toast.error("Please fill in all required fields");
      return;
    }
    setBusy(true);

    const cents = Math.round(parseFloat(amount) * 100);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    try {
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          member_id: memberId,
          plan_id: planId || null,
          amount_cents: cents,
          total_cents: cents,
          status,
          paid_at: status === "paid" ? new Date().toISOString() : null,
          created_by: userId,
          invoice_number: `INV-${new Date().toISOString().slice(2,7).replace(/-/g,'')}-${Math.floor(100000 + Math.random() * 900000)}`
        } as any)
        .select()
        .single();

      if (invErr) throw invErr;

      if (status === "paid" && inv) {
        const { error: payErr } = await supabase.from("payments").insert({
          invoice_id: inv.id,
          amount_cents: cents,
          method,
          reference: ref.trim() || "Manual Invoice Payment",
          recorded_by: userId
        });
        if (payErr) throw payErr;
      }

      toast.success("Invoice issued successfully!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to issue invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Issue Manual Invoice</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label htmlFor="issue-member">Select Member</Label>
          <select
            id="issue-member"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="w-full rounded-md border border-input bg-card py-2 px-3 text-sm outline-none transition focus:border-ring"
            required
          >
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.full_name} ({m.member_code})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="issue-plan">Select Plan (Optional)</Label>
            <select
              id="issue-plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full rounded-md border border-input bg-card py-2 px-3 text-sm outline-none transition focus:border-ring"
            >
              <option value="">Custom / One-time</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="issue-status">Status</Label>
            <select
              id="issue-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full rounded-md border border-input bg-card py-2 px-3 text-sm outline-none transition focus:border-ring"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="issue-title">Item / Title</Label>
          <Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Locker Rent, Supplement sale" required />
        </div>

        <div>
          <Label htmlFor="issue-amount">Amount (INR)</Label>
          <Input id="issue-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>

        {status === "paid" && (
          <div className="border-t border-border/40 pt-3 space-y-3">
            <div>
              <Label>Payment Method</Label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {([["upi", Smartphone, "UPI"], ["cash", Banknote, "Cash"], ["card", CreditCard, "Card"], ["bank", Wallet, "Bank"]] as const).map(([k, Icon, lbl]) => (
                  <button type="button" key={k} onClick={() => setMethod(k)} className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition ${method === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" /> {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="issue-ref">Reference (optional)</Label>
              <Input id="issue-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Txn id, receipt number, etc." />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground w-full">
            {busy ? "Issuing..." : "Issue Invoice"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
