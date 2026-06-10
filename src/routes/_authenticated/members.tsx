import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Plus, Phone, Mail, Calendar, User, Upload, Trash2, Edit2, ShieldAlert, HeartPulse, Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({ meta: [{ title: "Members - Tank by Tapan" }] }),
  component: MembersPage,
});

interface Member {
  id: string;
  member_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
  expires_at: string | null;
  plan_id: string | null;
  joined_at: string;
  gender: string | null;
  address: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  medical_info: string | null;
  photo_url: string | null;
  notes: string | null;
}

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price_cents: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_cents: number;
  status: string;
  issued_at: string;
}

function MembersPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planError, setPlanError] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Profile Drawer / Edit Dialog / Delete Dialog states
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);

  async function load() {
    setLoading(true);
    const [m, p, prof] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("membership_plans").select("*").eq("active", true),
      supabase.from("profiles").select("email, avatar_url"),
    ]);

    const profilesMap = new Map<string, string>();
    (prof.data ?? []).forEach((pr) => {
      if (pr.email && pr.avatar_url) {
        profilesMap.set(pr.email.toLowerCase(), pr.avatar_url);
      }
    });

    const merged = ((m.data ?? []) as Member[]).map((member) => {
      const emailKey = member.email?.toLowerCase();
      const profileAvatar = emailKey ? profilesMap.get(emailKey) : null;
      return {
        ...member,
        photo_url: member.photo_url || profileAvatar || null,
      };
    });
    
    setRows(merged);
    setPlans((p.data ?? []) as Plan[]);
    setPlanError(p.error?.message ?? "");

    // Also update selectedMember state with the new details if it is currently open
    setSelectedMember((current) => {
      if (!current) return null;
      const found = merged.find((x) => x.id === current.id);
      return found ?? current;
    });

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || r.full_name.toLowerCase().includes(t) || r.phone.includes(t) || r.member_code.toLowerCase().includes(t);
  });

  const isStaff = me.isAdmin || me.roles.includes("front_desk");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Members</h1>
          <p className="text-sm text-muted-foreground">{rows.length} total · {rows.filter((r) => r.status === "active").length} active</p>
        </div>
        {isStaff && (
          <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) load(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-glow"><Plus className="mr-1 h-4 w-4" /> Add member</Button>
            </DialogTrigger>
            <AddMemberDialog plans={plans} planError={planError} onClose={() => { setOpen(false); load(); }} />
          </Dialog>
        )}
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or code..." className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading members...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium">No members yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add your first member to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMember(m)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-accent/30"
              >
                {m.photo_url && !brokenImages[m.id] ? (
                  <img
                    src={m.photo_url}
                    alt={m.full_name}
                    onError={() => setBrokenImages((prev) => ({ ...prev, [m.id]: true }))}
                    className="h-10 w-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
                    {m.full_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{m.full_name}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{m.member_code}</span>
                  </div>
                   <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {isStaff && (
                      <>
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {m.phone}</span>
                        {m.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {m.email}</span>}
                      </>
                    )}
                    {m.expires_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> exp {m.expires_at}</span>}
                  </div>
                </div>
                <StatusPill status={m.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detailed Member Profile Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={(o) => !o && setSelectedMember(null)}>
        {selectedMember && (
          <MemberProfileDialog
            member={selectedMember}
            plans={plans}
            me={me}
            onClose={() => { setSelectedMember(null); load(); }}
            onEdit={() => setEditingMember(selectedMember)}
            onDelete={() => setDeletingMember(selectedMember)}
            onChangeStatus={async (nextStatus) => {
              if (!selectedMember) return;
              const { error } = await supabase.from("members").update({ status: nextStatus }).eq("id", selectedMember.id);
              if (error) { toast.error(error.message); return; }
              toast.success(`Membership status updated to ${nextStatus}`);
              setSelectedMember({ ...selectedMember, status: nextStatus });
              load();
            }}
          />
        )}
      </Dialog>

      {/* Edit Member Details Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(o) => !o && setEditingMember(null)}>
        {editingMember && (
          <EditMemberDialog
            member={editingMember}
            plans={plans}
            onClose={() => {
              setEditingMember(null);
              load();
            }}
          />
        )}
      </Dialog>

      {/* Delete Member Confirmation Dialog */}
      <Dialog open={!!deletingMember} onOpenChange={(o) => !o && setDeletingMember(null)}>
        {deletingMember && (
          <DeleteMemberConfirm
            member={deletingMember}
            onClose={() => setDeletingMember(null)}
            onConfirm={async () => {
              if (!deletingMember) return;
              const { error } = await supabase.from("members").delete().eq("id", deletingMember.id);
              if (error) { toast.error(error.message); return; }
              toast.success("Member profile deleted permanently");
              setDeletingMember(null);
              setSelectedMember(null);
              load();
            }}
          />
        )}
      </Dialog>
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

/* Add Member Dialog component */
function AddMemberDialog({ plans, planError, onClose }: { plans: Plan[]; planError: string; onClose: () => void }) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [plan_id, setPlanId] = useState<string>(plans[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan_id && plans[0]?.id) setPlanId(plans[0].id);
  }, [plan_id, plans]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    const plan = plans.find((p) => p.id === plan_id);
    const expires_at = plan
      ? new Date(Date.now() + plan.duration_days * 86400000).toISOString().slice(0, 10)
      : null;
    const { error, data } = await supabase
      .from("members")
      .insert({ full_name, phone, email: email || null, plan_id: plan_id || null, expires_at, created_by: userId })
      .select()
      .single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    if (plan && data) {
      const total = plan.price_cents;
      // Auto-generate PAID invoice since payment was received offline during sign-up
      const { data: invData, error: invErr } = await supabase
        .from("invoices")
        .insert({
          member_id: data.id,
          plan_id: plan.id,
          amount_cents: total,
          total_cents: total,
          status: "paid",
          paid_at: new Date().toISOString(),
          due_date: null,
          created_by: userId,
        })
        .select()
        .single();

      if (invErr) {
        toast.error("Member added, but failed to create invoice: " + invErr.message);
      } else if (invData) {
        // Auto-generate payment record to track financial inflow in billing tab
        const { error: payErr } = await supabase.from("payments").insert({
          invoice_id: invData.id,
          amount_cents: total,
          method: paymentMethod,
          reference: "Paid on signup",
          recorded_by: userId,
        });
        if (payErr) {
          toast.error("Failed to log payment record: " + payErr.message);
        }
      }
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
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <Label>Plan</Label>
          <Select value={plan_id} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
            <SelectContent>
              {plans.length === 0 ? (
                <SelectItem value="no-plans" disabled>
                  {planError ? "Could not load plans" : "No active plans found"}
                </SelectItem>
              ) : plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} - {p.duration_days}d - Rs {(p.price_cents / 100).toLocaleString()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {planError && <p className="mt-1 text-xs text-destructive">{planError}</p>}
          {!planError && plans.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Add a membership plan from the admin dashboard first.</p>
          )}
        </div>
        <div>
          <Label>Payment Method</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy || plans.length === 0} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Add member"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Detailed Profile Dialog Component */
function MemberProfileDialog({
  member,
  plans,
  me,
  onClose,
  onEdit,
  onDelete,
  onChangeStatus,
}: {
  member: Member;
  plans: Plan[];
  me: ReturnType<typeof useCurrentUser>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (s: string) => Promise<void>;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const isStaff = me.isStaff;

  const [showRenew, setShowRenew] = useState(false);
  const [renewPlanId, setRenewPlanId] = useState(plans[0]?.id ?? "");
  const [renewMethod, setRenewMethod] = useState<"cash" | "upi" | "card" | "bank">("upi");
  const [renewRef, setRenewRef] = useState("");
  const [renewing, setRenewing] = useState(false);

  useEffect(() => {
    if (plans.length > 0 && !renewPlanId) {
      setRenewPlanId(plans[0].id);
    }
  }, [plans, renewPlanId]);

  async function handleRenewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renewPlanId) return;
    setRenewing(true);

    const plan = plans.find((p) => p.id === renewPlanId);
    if (!plan) {
      toast.error("Plan not found");
      setRenewing(false);
      return;
    }

    try {
      let baseDate = new Date();
      if (member.status === "active" && member.expires_at) {
        const currentExpiry = new Date(member.expires_at);
        if (currentExpiry.getTime() > Date.now()) {
          baseDate = currentExpiry;
        }
      }
      
      const newExpiry = new Date(baseDate.getTime() + plan.duration_days * 86400000)
        .toISOString()
        .slice(0, 10);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const { error: memberErr } = await supabase
        .from("members")
        .update({
          plan_id: plan.id,
          expires_at: newExpiry,
          status: "active",
        })
        .eq("id", member.id);

      if (memberErr) throw memberErr;

      const { data: invData, error: invErr } = await supabase
        .from("invoices")
        .insert({
          member_id: member.id,
          plan_id: plan.id,
          amount_cents: plan.price_cents,
          total_cents: plan.price_cents,
          status: "paid",
          paid_at: new Date().toISOString(),
          due_date: null,
          created_by: userId,
        })
        .select()
        .single();

      if (invErr) throw invErr;

      const { error: payErr } = await supabase.from("payments").insert({
        invoice_id: invData.id,
        amount_cents: plan.price_cents,
        method: renewMethod,
        reference: renewRef.trim() || "Membership Renewal",
        recorded_by: userId,
      });

      if (payErr) throw payErr;

      toast.success("Membership successfully renewed!");
      setShowRenew(false);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to renew membership");
    } finally {
      setRenewing(false);
    }
  }

  const activePlan = plans.find((p) => p.id === member.plan_id)?.name ?? "No plan";

  useEffect(() => {
    setImageError(false);
  }, [member.id]);

  useEffect(() => {
    setLoadingHistory(true);
    supabase
      .from("invoices")
      .select("id, invoice_number, total_cents, status, issued_at")
      .eq("member_id", member.id)
      .order("issued_at", { ascending: false })
      .then(({ data }) => {
        setInvoices((data ?? []) as Invoice[]);
        setLoadingHistory(false);
      });
  }, [member.id]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const fileExt = file.name.split(".").pop();
    const filePath = `${member.id}-${Math.random()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage.from("photos").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("members")
        .update({ photo_url: publicUrl })
        .eq("id", member.id);

      if (updateError) throw updateError;



      toast.success("Photo uploaded successfully");
      onClose(); // Reload data via closing and reloading
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  if (showRenew) {
    return (
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renew Membership: {member.full_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleRenewSubmit} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="renew-plan">Select Plan</Label>
            <Select value={renewPlanId} onValueChange={setRenewPlanId}>
              <SelectTrigger id="renew-plan"><SelectValue placeholder="Select a plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} - {p.duration_days}d - Rs {(p.price_cents / 100).toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="renew-method">Payment Method</Label>
            <Select value={renewMethod} onValueChange={(v: any) => setRenewMethod(v)}>
              <SelectTrigger id="renew-method"><SelectValue placeholder="Select payment method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="renew-ref">Reference (optional)</Label>
            <Input id="renew-ref" value={renewRef} onChange={(e) => setRenewRef(e.target.value)} placeholder="Txn id, receipt no. etc." />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setShowRenew(false)} disabled={renewing}>
              Back
            </Button>
            <Button type="submit" disabled={renewing || !renewPlanId} className="gradient-primary text-primary-foreground">
              {renewing ? "Renewing..." : "Record Renewal & Pay"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <div className="flex items-center gap-4 border-b border-border pb-4">
          {member.photo_url && !imageError ? (
            <img
              src={member.photo_url}
              alt={member.full_name}
              onError={() => setImageError(true)}
              className="h-16 w-16 rounded-2xl object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-primary text-xl font-bold text-primary-foreground">
              {member.full_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl font-bold">{member.full_name}</DialogTitle>
            <p className="text-sm text-muted-foreground">{member.member_code} · Joined {new Date(member.joined_at).toLocaleDateString()}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusPill status={member.status} />
            {isStaff && (
              <Select value={member.status} onValueChange={onChangeStatus}>
                <SelectTrigger className="h-7 w-24 text-[10px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {["active", "expired", "frozen", "cancelled"].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </DialogHeader>

      <Tabs defaultValue="details" className="mt-2">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="photo">Photo & Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 pt-3">
          <div className="grid grid-cols-2 gap-4">
            {isStaff && (
              <>
                <div>
                  <span className="text-xs uppercase text-muted-foreground">Phone</span>
                  <p className="text-sm font-medium">{member.phone}</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-muted-foreground">Email</span>
                  <p className="text-sm font-medium">{member.email ?? "—"}</p>
                </div>
              </>
            )}
            <div>
              <span className="text-xs uppercase text-muted-foreground">Active Plan</span>
              <p className="text-sm font-medium">{activePlan}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-muted-foreground">Valid Until</span>
              <p className="text-sm font-medium">{member.expires_at ?? "—"}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-muted-foreground">Gender</span>
              <p className="text-sm font-medium capitalize">{member.gender ?? "—"}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-muted-foreground">DOB</span>
              <p className="text-sm font-medium">{member.date_of_birth ?? "—"}</p>
            </div>
          </div>
          <div>
            <span className="text-xs uppercase text-muted-foreground">Address</span>
            <p className="text-sm font-medium">{member.address ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
            {isStaff && (
              <>
                <div className="flex items-center gap-2 text-warning">
                  <ShieldAlert className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Emergency Contact</span>
                </div>
                <p className="text-sm font-medium">{member.emergency_contact ?? "No contact details provided."}</p>
                <div className="border-t border-border/30 pt-1.5" />
              </>
            )}

            <div className="flex items-center gap-2 text-destructive">
              <HeartPulse className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Medical Information</span>
            </div>
            <p className="text-sm font-medium">{member.medical_info ?? "No medical alerts logged."}</p>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-3 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing & Plan History</div>
          {loadingHistory ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No invoice history found.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5 text-xs">
                  <div>
                    <span className="font-mono text-muted-foreground">{inv.invoice_number}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Issued {new Date(inv.issued_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-foreground">Rs {(inv.total_cents / 100).toLocaleString()}</span>
                    <span className={`block text-[10px] font-medium capitalize mt-0.5 ${inv.status === 'paid' ? 'text-success' : 'text-warning'}`}>{inv.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photo" className="space-y-4 pt-3">
          {isStaff ? (
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Set Profile Photo</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <Input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} className="text-xs" />
                {uploading && <span className="text-xs text-muted-foreground animate-pulse">Uploading...</span>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Only staff can modify member photos.</p>
          )}

          <div className="border-t border-border pt-4 flex flex-wrap gap-2">
            {isStaff && (
              <Button onClick={() => setShowRenew(true)} className="flex-1 gap-1.5 text-xs gradient-primary text-primary-foreground shadow-glow min-w-[140px]">
                <RefreshCw className="h-3.5 w-3.5" /> Renew Membership
              </Button>
            )}
            {isStaff && (
              <Button onClick={onEdit} variant="outline" className="flex-1 gap-1.5 text-xs min-w-[140px]">
                <Edit2 className="h-3.5 w-3.5" /> Edit Profile
              </Button>
            )}
            {isStaff && (
              <Button onClick={onDelete} variant="destructive" className="flex-1 gap-1.5 text-xs min-w-[140px]">
                <Trash2 className="h-3.5 w-3.5" /> Delete Member
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

/* Edit Member Details Dialog Component */
function EditMemberDialog({ member, plans, onClose }: { member: Member; plans: Plan[]; onClose: () => void }) {
  const me = useCurrentUser();
  const isStaff = me.isStaff;
  const [fullName, setFullName] = useState(member.full_name);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email ?? "");
  const [gender, setGender] = useState(member.gender ?? "male");
  const [dob, setDob] = useState(member.date_of_birth ?? "");
  const [address, setAddress] = useState(member.address ?? "");
  const [planId, setPlanId] = useState(member.plan_id ?? "");
  const [status, setStatus] = useState(member.status);
  const [emergencyContact, setEmergencyContact] = useState(member.emergency_contact ?? "");
  const [medicalInfo, setMedicalInfo] = useState(member.medical_info ?? "");
  const [notes, setNotes] = useState(member.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase
      .from("members")
      .update({
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        gender,
        date_of_birth: dob || null,
        address: address.trim() || null,
        plan_id: planId || null,
        status,
        emergency_contact: emergencyContact.trim() || null,
        medical_info: medicalInfo.trim() || null,
        notes: notes.trim() || null,
      })
      .eq("id", member.id);

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Member profile updated successfully");
    setBusy(false);
    onClose();
  }

  return (
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto scrollbar-thin">
      <DialogHeader>
        <DialogTitle>Edit Member Profile</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div>
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date of Birth</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
          <div>
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} - {p.duration_days}d</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Membership Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={!isStaff}>
              <SelectTrigger className="capitalize"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["active", "expired", "frozen", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Emergency Contact</Label><Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Name & Phone" /></div>
        </div>

        <div><Label>Address</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Physical address" rows={2} /></div>
        <div><Label>Medical Information (Conditions/Alerts)</Label><Textarea value={medicalInfo} onChange={(e) => setMedicalInfo(e.target.value)} placeholder="Asthma, heart condition, allergies, etc." rows={2} /></div>
        <div><Label>Internal Staff Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="General remarks" rows={2} /></div>

        <DialogFooter className="pt-2">
          <Button type="button" onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Delete Member Confirmation Component */
function DeleteMemberConfirm({ member, onClose, onConfirm }: { member: Member; onClose: () => void; onConfirm: () => Promise<void> }) {
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
        <p>Are you sure you want to delete <strong>{member.full_name}</strong>?</p>
        <p>This action is irreversible. It will permanently remove their member profile, attendance checks, and active invoice registry.</p>
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
