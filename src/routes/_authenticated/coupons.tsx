import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Percent, Plus, Trash2, ShieldAlert, CheckCircle, XCircle } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/coupons")({
  head: () => ({ meta: [{ title: "Coupons · Tank by Tapan" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin");
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: CouponsPage,
});

interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  discount_upto_cents: number;
  active: boolean;
  created_at: string;
  max_uses: number | null;
  used_count: number;
}

function CouponsPage() {
  const me = useCurrentUser();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);

  // Form states
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountUpto, setDiscountUpto] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase
      .from("coupons") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setCoupons((data ?? []) as Coupon[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!me.loading) {
      load();
    }
  }, [me.loading]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !discountPercent || !discountUpto) {
      toast.error("Please fill in all fields");
      return;
    }

    const percent = parseInt(discountPercent);
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      toast.error("Discount percentage must be between 1 and 100");
      return;
    }

    const uptoCents = Math.round(parseFloat(discountUpto) * 100);
    if (isNaN(uptoCents) || uptoCents < 0) {
      toast.error("Discount cap must be a valid positive amount");
      return;
    }

    setBusy(true);
    const formattedCode = code.toUpperCase().replace(/\s+/g, "");

    const { data: createdCoupon, error } = await (supabase
      .from("coupons") as any)
      .insert({
        code: formattedCode,
        discount_percent: percent,
        discount_upto_cents: uptoCents,
        active: true,
        max_uses: maxUses.trim() ? parseInt(maxUses) : null,
        used_count: 0,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      // Log audit event
      await supabase.from("audit_logs").insert({
        actor_id: me.user?.id ?? null,
        actor_email: me.user?.email ?? null,
        action: "COUPON_CREATE",
        entity_type: "coupons",
        entity_id: createdCoupon.id,
        metadata: {
          code: createdCoupon.code,
          discount_percent: createdCoupon.discount_percent,
          discount_upto_cents: createdCoupon.discount_upto_cents
        }
      });
      toast.success("Coupon created successfully!");
      setIsAddOpen(false);
      setCode("");
      setDiscountPercent("");
      setDiscountUpto("");
      setMaxUses("");
      load();
    }
    setBusy(false);
  }

  async function toggleStatus(coupon: Coupon) {
    const { error } = await supabase
      .from("coupons")
      .update({ active: !coupon.active })
      .eq("id", coupon.id);

    if (error) {
      toast.error(error.message);
    } else {
      // Log audit event
      await supabase.from("audit_logs").insert({
        actor_id: me.user?.id ?? null,
        actor_email: me.user?.email ?? null,
        action: coupon.active ? "COUPON_DEACTIVATE" : "COUPON_ACTIVATE",
        entity_type: "coupons",
        entity_id: coupon.id,
        metadata: { code: coupon.code }
      });
      toast.success(`Coupon ${coupon.code} ${!coupon.active ? "activated" : "deactivated"}`);
      load();
    }
  }

  async function handleDelete() {
    if (!deletingCoupon) return;
    setBusy(true);
    const { error } = await supabase.from("coupons").delete().eq("id", deletingCoupon.id);

    if (error) {
      toast.error(error.message);
    } else {
      // Log audit event
      await supabase.from("audit_logs").insert({
        actor_id: me.user?.id ?? null,
        actor_email: me.user?.email ?? null,
        action: "COUPON_DELETE",
        entity_type: "coupons",
        entity_id: deletingCoupon.id,
        metadata: { code: deletingCoupon.code }
      });
      toast.success("Coupon deleted successfully");
      setDeletingCoupon(null);
      load();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl font-display">Coupons</h1>
          <p className="text-sm text-muted-foreground">Manage discount codes for membership registrations and POS sales.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground shadow-glow">
              <Plus className="mr-1.5 h-4 w-4" /> Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create New Coupon</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="code">Coupon Code</Label>
                <Input
                  id="code"
                  placeholder="e.g. WELCOME10"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="percent">Discount %</Label>
                  <Input
                    id="percent"
                    type="number"
                    min="1"
                    max="100"
                    placeholder="10"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="upto">Discount Upto (Rs)</Label>
                  <Input
                    id="upto"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="500"
                    value={discountUpto}
                    onChange={(e) => setDiscountUpto(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="max-uses">Max Uses (Optional)</Label>
                <Input
                  id="max-uses"
                  type="number"
                  min="1"
                  placeholder="e.g. 50 — leave blank for unlimited"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Leave blank for unlimited uses.</p>
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
                  {busy ? "Creating..." : "Create Coupon"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading coupons...</div>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Percent className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">No coupons found</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a coupon to start offering discounts.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => (
            <div
              key={coupon.id}
              className={`rounded-2xl border bg-card p-5 transition hover:shadow-md relative overflow-hidden ${
                coupon.active ? "border-border" : "border-border/40 opacity-70"
              }`}
            >
              {/* Top Accent Strip */}
              <div className={`absolute top-0 inset-x-0 h-1.5 ${coupon.active ? "gradient-primary" : "bg-muted"}`} />

              <div className="flex items-start justify-between mt-1">
                <div>
                  <span className="font-mono text-lg font-black tracking-wide bg-muted px-2 py-0.5 rounded-lg border border-border">
                    {coupon.code}
                  </span>
                  <div className="mt-3 space-y-1">
                    <div className="text-sm font-semibold text-foreground">
                      {coupon.discount_percent}% Off
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Up to Rs {(coupon.discount_upto_cents / 100).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Used: <span className="font-semibold text-foreground">{coupon.used_count}</span>
                      {coupon.max_uses != null ? (
                        <span> / {coupon.max_uses} <span className="text-[10px]">(limit)</span></span>
                      ) : (
                        <span className="text-[10px]"> (unlimited)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleStatus(coupon)}
                    className={`p-1.5 rounded-lg border transition ${
                      coupon.active
                        ? "bg-success/15 border-success/30 text-success hover:bg-success/20"
                        : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                    }`}
                    title={coupon.active ? "Click to Deactivate" : "Click to Activate"}
                  >
                    {coupon.active ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </button>
                  <Button
                    onClick={() => setDeletingCoupon(coupon)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-muted"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deletingCoupon} onOpenChange={(o) => !o && setDeletingCoupon(null)}>
        {deletingCoupon && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" /> Delete Coupon?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground pt-1">
              Are you sure you want to permanently delete coupon <strong>{deletingCoupon.code}</strong>? This action cannot be undone.
            </p>
            <DialogFooter className="pt-4 gap-2">
              <Button onClick={() => setDeletingCoupon(null)} variant="outline" disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleDelete} variant="destructive" disabled={busy} className="gradient-destructive">
                {busy ? "Deleting..." : "Delete Coupon"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
