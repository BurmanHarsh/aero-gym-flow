import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Dumbbell,
  Edit2,
  Trash2,
  Upload,
  Image as ImageIcon,
  Check,
  Calendar,
  AlertTriangle,
  Zap,
  Eye,
  EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Membership Plans · Tank by Tapan" }] }),
  component: PlansPage,
});

interface Plan {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  price_cents: number;
  active: boolean;
  photo_url: string | null;
  created_at: string;
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function PlansPage() {
  const me = useCurrentUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dialog open states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // File upload state
  const [uploading, setUploading] = useState<string | null>(null); // holds planId during upload
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const isStaff = me.isAdmin;

  async function load() {
    setLoading(true);
    setError("");
    try {
      let query = supabase.from("membership_plans").select("*");
      
      // If the user is not staff, restrict them to only see active plans
      if (!isStaff) {
        query = query.eq("active", true);
      }

      const { data, error: fetchError } = await query.order("duration_days", {
        ascending: true,
      });

      if (fetchError) throw fetchError;
      setPlans((data ?? []) as Plan[]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load membership plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!me.loading) {
      load();
    }
  }, [me.loading, me.isAdmin, me.roles]);

  const handlePhotoUploadClick = (planId: string) => {
    fileInputRefs.current[planId]?.click();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, planId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(planId);

    const fileExt = file.name.split(".").pop();
    const filePath = `plans/${planId}-${Math.random()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("photos").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("membership_plans")
        .update({ photo_url: publicUrl })
        .eq("id", planId);

      if (updateError) throw updateError;

      toast.success("Plan photo updated successfully!");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl font-display">
            Membership Plans
          </h1>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Configure pricing, durations, and visuals for gym memberships."
              : "Choose the perfect fit for your fitness journey."}
          </p>
        </div>
        {isStaff && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-glow font-medium">
                <Plus className="mr-1.5 h-4 w-4" /> Add Plan
              </Button>
            </DialogTrigger>
            <AddPlanDialog
              onClose={() => {
                setIsAddOpen(false);
                load();
              }}
            />
          </Dialog>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          Loading plans...
        </div>
      ) : plans.length === 0 ? (
        <div className="py-20 text-center rounded-2xl border border-border bg-card/40">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground animate-pulse" />
          <p className="mt-4 text-sm font-medium">No plans available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isStaff ? "Create your first membership plan to get started." : "Check back later for available plans."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-accent/80 hover:shadow-md cursor-pointer"
            >
              {/* Photo section */}
              <div className="relative h-48 w-full overflow-hidden bg-muted">
                {plan.photo_url ? (
                  <img
                    src={plan.photo_url}
                    alt={plan.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gradient-primary opacity-90 transition duration-300 group-hover:scale-105">
                    <Dumbbell className="h-10 w-10 text-primary-foreground/80" />
                  </div>
                )}

                {/* Duration and Price tags */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 flex items-end justify-between">
                  <div className="rounded-lg bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md border border-white/10 uppercase tracking-wider">
                    {plan.duration_days} Days
                  </div>
                  <div className="text-lg font-bold text-white drop-shadow-md">
                    {fmtMoney(plan.price_cents)}
                  </div>
                </div>

                {/* Staff overlay for changing photo */}
                {isStaff && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                    <input
                      type="file"
                      accept="image/*"
                      ref={(el) => {
                        fileInputRefs.current[plan.id] = el;
                      }}
                      onChange={(e) => handlePhotoUpload(e, plan.id)}
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs"
                      disabled={uploading === plan.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhotoUploadClick(plan.id);
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploading === plan.id ? "Uploading..." : "Change Photo"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Plan body */}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-bold text-foreground truncate">
                    {plan.name}
                  </h3>
                  {isStaff && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        plan.active
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {plan.active ? (
                        <>
                          <Check className="h-2.5 w-2.5" /> Active
                        </>
                      ) : (
                        "Inactive"
                      )}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted-foreground leading-relaxed flex-1 whitespace-pre-wrap">
                  {plan.description || "Access to all primary gym facilities during working hours."}
                </p>

                {/* Staff Controls */}
                {isStaff && (
                  <div className="mt-5 flex gap-2 border-t border-border/60 pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5 text-xs h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPlan(plan);
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 gap-1.5 text-xs h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingPlan(plan);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(o) => !o && setEditingPlan(null)}>
        {editingPlan && (
          <EditPlanDialog
            plan={editingPlan}
            onClose={() => {
              setEditingPlan(null);
              load();
            }}
          />
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingPlan} onOpenChange={(o) => !o && setDeletingPlan(null)}>
        {deletingPlan && (
          <DeletePlanConfirm
            plan={deletingPlan}
            onClose={() => setDeletingPlan(null)}
            onConfirm={async () => {
              const { error: deleteError } = await supabase
                .from("membership_plans")
                .delete()
                .eq("id", deletingPlan.id);

              if (deleteError) {
                toast.error(deleteError.message);
                return;
              }

              toast.success("Membership plan deleted successfully");
              setDeletingPlan(null);
              load();
            }}
          />
        )}
      </Dialog>

      {/* Plan Details Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={(o) => !o && setSelectedPlan(null)}>
        {selectedPlan && (
          <PlanDetailDialog
            plan={selectedPlan}
            onClose={() => setSelectedPlan(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

interface PlanDetailDialogProps {
  plan: Plan;
  onClose: () => void;
}

function PlanDetailDialog({ plan, onClose }: PlanDetailDialogProps) {
  return (
    <DialogContent className="max-w-md overflow-hidden p-0 rounded-2xl border border-border bg-card">
      <div className="relative h-52 w-full overflow-hidden bg-muted">
        {plan.photo_url ? (
          <img
            src={plan.photo_url}
            alt={plan.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gradient-primary opacity-90">
            <Dumbbell className="h-12 w-12 text-primary-foreground/80" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
      </div>

      <div className="p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-foreground font-display">{plan.name}</h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                plan.active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              }`}
            >
              <span className={`mr-1 h-1.5 w-1.5 rounded-full ${plan.active ? "bg-success" : "bg-destructive"}`} />
              {plan.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              {plan.duration_days} Days
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</div>
            <div className="text-sm font-bold text-primary">
              {fmtMoney(plan.price_cents)}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">About this plan</h4>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {plan.description || "Access to all primary gym facilities during working hours."}
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button onClick={onClose} className="w-full gradient-primary text-primary-foreground font-medium shadow-glow">
            Done
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

/* Add Plan Dialog component */
function AddPlanDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const days = Number.parseInt(durationDays, 10);
    const rupees = Number.parseFloat(price);

    if (!cleanName) {
      toast.error("Plan name is required");
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Duration must be at least 1 day");
      return;
    }
    if (!Number.isFinite(rupees) || rupees < 0) {
      toast.error("Price must be 0 or more");
      return;
    }

    setBusy(true);

    try {
      // 1. Insert the new plan
      const { data: newPlan, error: insertError } = await supabase
        .from("membership_plans")
        .insert({
          name: cleanName,
          description: description.trim() || null,
          duration_days: days,
          price_cents: Math.round(rupees * 100),
          active,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. If a photo was selected, upload it using the new plan ID
      if (file && newPlan) {
        const fileExt = file.name.split(".").pop();
        const filePath = `plans/${newPlan.id}-${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("photos").getPublicUrl(filePath);

        const { error: updateError } = await supabase
          .from("membership_plans")
          .update({ photo_url: publicUrl })
          .eq("id", newPlan.id);

        if (updateError) throw updateError;
      }

      toast.success("Membership plan created successfully!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Add Membership Plan</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label htmlFor="add-name">Plan Name</Label>
          <Input
            id="add-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Annual Gold Access"
            required
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="add-duration">Duration (Days)</Label>
            <Input
              id="add-duration"
              type="number"
              min="1"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              placeholder="365"
              required
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="add-price">Price (INR)</Label>
            <Input
              id="add-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="12000"
              required
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="add-description">Description</Label>
          <Textarea
            id="add-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details about locker facilities, trainer slots, spa access, etc."
            rows={3}
            disabled={busy}
          />
        </div>

        <div>
          <Label htmlFor="add-photo">Plan Cover Photo</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="add-photo"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-xs"
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Available / Active</Label>
            <p className="text-[11px] text-muted-foreground">
              Inactive plans are hidden from members
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive(!active)}
            disabled={busy}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
              active ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                active ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="gradient-primary text-primary-foreground font-medium"
          >
            {busy ? "Creating..." : "Create Plan"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Edit Plan Dialog component */
function EditPlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [name, setName] = useState(plan.name);
  const [durationDays, setDurationDays] = useState(plan.duration_days.toString());
  const [price, setPrice] = useState((plan.price_cents / 100).toString());
  const [description, setDescription] = useState(plan.description || "");
  const [active, setActive] = useState(plan.active);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const days = Number.parseInt(durationDays, 10);
    const rupees = Number.parseFloat(price);

    if (!cleanName) {
      toast.error("Plan name is required");
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Duration must be at least 1 day");
      return;
    }
    if (!Number.isFinite(rupees) || rupees < 0) {
      toast.error("Price must be 0 or more");
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } = await supabase
        .from("membership_plans")
        .update({
          name: cleanName,
          description: description.trim() || null,
          duration_days: days,
          price_cents: Math.round(rupees * 100),
          active,
        })
        .eq("id", plan.id);

      if (updateError) throw updateError;

      toast.success("Membership plan updated successfully!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Membership Plan</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label htmlFor="edit-name">Plan Name</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-duration">Duration (Days)</Label>
            <Input
              id="edit-duration"
              type="number"
              min="1"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="edit-price">Price (INR)</Label>
            <Input
              id="edit-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="edit-description">Description</Label>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={busy}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Available / Active</Label>
            <p className="text-[11px] text-muted-foreground">
              Inactive plans are hidden from members
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive(!active)}
            disabled={busy}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
              active ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                active ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="gradient-primary text-primary-foreground font-medium"
          >
            {busy ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Delete Plan Confirmation Dialog component */
function DeletePlanConfirm({
  plan,
  onClose,
  onConfirm,
}: {
  plan: Plan;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
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
          <AlertTriangle className="h-5 w-5" /> Permanent Delete
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 pt-2 text-sm text-muted-foreground">
        <p>
          Are you sure you want to delete the plan <strong>{plan.name}</strong>?
        </p>
        <p className="bg-destructive/10 text-destructive text-xs border border-destructive/20 rounded-lg p-3">
          <strong>Important Warning:</strong> Deleting this plan will set the
          plan reference to null for any members currently assigned to it. They
          will remain active members but will no longer be linked to this specific plan.
        </p>
      </div>
      <DialogFooter className="pt-4 gap-2">
        <Button onClick={onClose} variant="outline" disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleDelete} variant="destructive" disabled={busy}>
          {busy ? "Deleting..." : "Delete Permanently"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
