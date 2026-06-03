import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Phone, Mail, Calendar } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({ meta: [{ title: "Members · AeroGym OS" }] }),
  component: MembersPage,
});

interface Member {
  id: string; member_code: string; full_name: string; phone: string; email: string | null;
  status: string; expires_at: string | null; plan_id: string | null; joined_at: string;
}
interface Plan { id: string; name: string; duration_days: number; price_cents: number; }

function MembersPage() {
  const [rows, setRows] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("membership_plans").select("*").eq("active", true),
    ]);
    setRows((m.data ?? []) as Member[]);
    setPlans((p.data ?? []) as Plan[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || r.full_name.toLowerCase().includes(t) || r.phone.includes(t) || r.member_code.toLowerCase().includes(t);
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Members</h1>
          <p className="text-sm text-muted-foreground">{rows.length} total · {rows.filter(r => r.status === "active").length} active</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="mr-1 h-4 w-4" /> Add member</Button>
          </DialogTrigger>
          <AddMemberDialog plans={plans} onClose={() => { setOpen(false); load(); }} />
        </Dialog>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or code…" className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading members…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium">No members yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add your first member to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-accent/30">
                <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
                  {m.full_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{m.full_name}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{m.member_code}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {m.phone}</span>
                    {m.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {m.email}</span>}
                    {m.expires_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> exp {m.expires_at}</span>}
                  </div>
                </div>
                <StatusPill status={m.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    expired: "bg-destructive/15 text-destructive",
    frozen: "bg-info/15 text-info",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

function AddMemberDialog({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [plan_id, setPlanId] = useState<string>(plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const plan = plans.find((p) => p.id === plan_id);
    const expires_at = plan
      ? new Date(Date.now() + plan.duration_days * 86400000).toISOString().slice(0, 10)
      : null;
    const { error, data } = await supabase
      .from("members")
      .insert({ full_name, phone, email: email || null, plan_id: plan_id || null, expires_at })
      .select()
      .single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    if (plan && data) {
      const total = plan.price_cents;
      await supabase.from("invoices").insert({
        member_id: data.id, plan_id: plan.id, amount_cents: total, total_cents: total, status: "pending",
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
    }
    toast.success("Member added");
    setBusy(false);
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Full name</Label><Input value={full_name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
          <div><Label>Email (optional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div>
          <Label>Plan</Label>
          <Select value={plan_id} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} · {p.duration_days}d · ₹{(p.price_cents/100).toLocaleString()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">{busy ? "Saving…" : "Add member"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
