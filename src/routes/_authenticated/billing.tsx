import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { confirmStripeCheckoutSession, createStripeCheckoutSession, revertStripePayment } from "@/lib/aerogym/billing.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Banknote, CreditCard, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { sendReceiptEmail } from "@/lib/aerogym/email.functions";


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
  const me = useCurrentUser();
  const confirmStripePayment = useServerFn(confirmStripeCheckoutSession);
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Invoice | null>(null);

  async function load() {
    if (me.loading) return;
    setLoading(true);
    let q = supabase.from("invoices").select("*, member:members(full_name, member_code)").order("issued_at", { ascending: false }).limit(200);
    if (me.isAdmin) {
      if (tab !== "all") q = q.eq("status", tab);
    } else {
      q = q.eq("created_by", me.user?.id ?? "").eq("status", "pending");
    }
    const { data } = await q;
    setRows((data ?? []) as Invoice[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [tab, me.loading, me.isAdmin, me.user?.id]);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
    if (!sessionId || me.loading) return;

    confirmStripePayment({ data: { sessionId } })
      .then((result) => {
        if (result.paid) {
          toast.success("Payment completed");
          load();
        } else {
          toast.message("Payment still pending", { description: `Stripe status: ${result.status}` });
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not confirm Stripe payment"))
      .finally(() => {
        window.history.replaceState({}, "", window.location.pathname);
      });
  }, [confirmStripePayment, me.loading]);

  const totals = {
    pending: rows.filter(r => r.status === "pending").reduce((s, r) => s + r.total_cents, 0),
    paid: rows.filter(r => r.status === "paid").reduce((s, r) => s + r.total_cents, 0),
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Billing</h1>
        <p className="text-sm text-muted-foreground">{me.isAdmin ? "Invoices, payments and collection." : "Your pending bills only."}</p>
      </header>

      {me.isAdmin ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label="Pending" value={money(totals.pending)} tone="warning" />
          <KPI label="Paid" value={money(totals.paid)} tone="success" />
          <KPI label="Total invoices" value={rows.length.toString()} tone="primary" />
          <KPI label="Collection rate" value={`${rows.length ? Math.round((rows.filter(r => r.status === "paid").length / rows.length) * 100) : 0}%`} tone="secondary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KPI label="My pending" value={money(totals.pending)} tone="warning" />
          <KPI label="Pending bills" value={rows.length.toString()} tone="primary" />
        </div>
      )}

      {me.isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${tab === t ? "gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
            ))}
          </div>
        </div>
      ) : null}

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
  const me = useCurrentUser();
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "bank">("upi");
  const [amount, setAmount] = useState((invoice.total_cents / 100).toString());
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const isPaid = invoice.status === "paid";
  const sendReceipt = useServerFn(sendReceiptEmail);
  const createCheckout = useServerFn(createStripeCheckoutSession);
  const revertPayment = useServerFn(revertStripePayment);
  const isStripeMode = method === "card" || method === "upi";
  const [payments, setPayments] = useState<Array<{ id: string; amount_cents: number; method: string; reference: string | null; created_at?: string }>>([]);

  async function record(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    if (isStripeMode) {
      createCheckout({ data: { invoiceId: invoice.id, method, origin: window.location.origin } })
        .then(({ url }) => {
          window.location.assign(url);
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Could not start Stripe payment");
          setBusy(false);
        });
      return;
    }

    const cents = Math.round(parseFloat(amount) * 100);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("payments").insert({ invoice_id: invoice.id, amount_cents: cents, method, reference: ref || null, recorded_by: userData.user?.id ?? null });
    if (error) { toast.error(error.message); setBusy(false); return; }
    if (cents >= invoice.total_cents) {
      await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id);
    }
    const { data: m } = await supabase.from("members").select("email, full_name").eq("id", invoice.member_id).maybeSingle();
    if (m?.email) {
      sendReceipt({ data: { to: m.email, name: m.full_name, invoiceNumber: invoice.invoice_number, amount: money(cents), method } }).catch(() => {});
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


  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Invoice {invoice.invoice_number}</DialogTitle></DialogHeader>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="text-xs uppercase text-muted-foreground">{invoice.member?.full_name}</div>
        <div className="mt-1 text-2xl font-bold">{money(invoice.total_cents)}</div>
        <StatusBadge status={invoice.status} />
      </div>
      {payments.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-medium">Payments</div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-card p-2">
                <div className="text-sm">
                  <div className="font-medium">{money(p.amount_cents)}</div>
                  <div className="text-xs text-muted-foreground">{p.method}{p.reference ? ` · ${p.reference}` : ""}</div>
                </div>
                <div>
                  {me.isAdmin && (
                    <Button variant="destructive" size="sm" onClick={() => handleRevert(p.id)} disabled={busy}>
                      Revert payment
                    </Button>
                  )}
                </div>
              </div>
            ))}
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
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isStripeMode} required />
            {isStripeMode && (
              <p className="mt-1 text-xs text-muted-foreground">
                {method === "upi" ? "Stripe will show a UPI QR on desktop or open the UPI app on mobile." : "Stripe will collect the card payment securely."}
              </p>
            )}
          </div>
          {!isStripeMode && <div><Label>Reference (optional)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Txn id / receipt no." /></div>}
          <DialogFooter>
            <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
              {busy ? "Processing..." : isStripeMode ? `Pay with ${method === "upi" ? "UPI QR" : "card"}` : "Record payment"}
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
    </DialogContent>
  );
}
