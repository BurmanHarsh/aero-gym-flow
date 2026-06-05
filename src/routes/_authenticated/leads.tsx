import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads · Tank by Tapan" }] }),
  component: LeadsPage,
});

interface Lead {
  id: string; full_name: string; phone: string; email: string | null;
  source: string | null; status: string; notes: string | null; created_at: string;
}

const STATUSES = ["new", "contacted", "trial", "converted", "lost"] as const;
const COLORS: Record<string, string> = {
  new: "bg-info/15 text-info",
  contacted: "bg-warning/15 text-warning",
  trial: "bg-secondary/15 text-secondary",
  converted: "bg-success/15 text-success",
  lost: "bg-destructive/15 text-destructive",
};

function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(200);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lead updated");
    load();
  }

  const grouped = STATUSES.map((s) => ({ status: s, items: leads.filter((l) => l.status === s) }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Lead pipeline</h1>
          <p className="text-sm text-muted-foreground">{leads.length} total leads</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="mr-1 h-4 w-4" /> New lead</Button>
          </DialogTrigger>
          <AddLeadDialog onClose={() => { setOpen(false); load(); }} />
        </Dialog>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-4 overflow-x-auto md:grid-cols-5">
          {grouped.map((col) => (
            <div key={col.status} className="min-w-[240px] rounded-2xl border border-border bg-card/40 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${COLORS[col.status]}`}>{col.status}</span>
                  <span className="text-xs text-muted-foreground">{col.items.length}</span>
                </div>
              </div>
              <div className="space-y-2">
                {col.items.length === 0 && <div className="px-1 text-xs text-muted-foreground">Nothing here</div>}
                {col.items.map((l) => (
                  <div key={l.id} className="rounded-xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="text-sm font-medium">{l.full_name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>
                      {l.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{l.email}</span>}
                    </div>
                    {l.source && <div className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{l.source}</div>}
                    <Select value={l.status} onValueChange={(v) => updateStatus(l.id, v)}>
                      <SelectTrigger className="mt-2 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddLeadDialog({ onClose }: { onClose: () => void }) {
  const [full_name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(""); const [source, setSource] = useState("walk-in");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("leads").insert({ full_name, phone, email: email || null, source });
    if (error) { toast.error(error.message); setBusy(false); return; }
    toast.success("Lead added"); setBusy(false); onClose();
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New lead</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Full name</Label><Input value={full_name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div>
          <Label>Source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["walk-in", "referral", "instagram", "google", "facebook", "other"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter><Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">{busy ? "Saving…" : "Add lead"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
