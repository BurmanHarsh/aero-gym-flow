import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, User, Edit2, Trash2, ShieldAlert, Dumbbell, Award, Clock } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/trainers")({
  head: () => ({ meta: [{ title: "Trainers - Tank by Tapan" }] }),
  component: TrainersPage,
});

interface Trainer {
  id: string;
  name: string;
  specialization: string;
  shift: string;
  status: "floor" | "session" | "break" | "off";
  avatar: string;
}

const INITIAL_TRAINERS: Trainer[] = [
  { id: "1", name: "Vikram Singh", specialization: "Strength & Conditioning", shift: "06:00 AM - 11:00 AM", status: "floor", avatar: "VS" },
  { id: "2", name: "Priya Sharma", specialization: "Yoga & Pilates", shift: "07:00 AM - 12:00 PM", status: "session", avatar: "PS" },
  { id: "3", name: "Rahul Verma", specialization: "Cardio & HIIT", shift: "04:00 PM - 09:00 PM", status: "break", avatar: "RV" },
  { id: "4", name: "Sneha Patel", specialization: "Weight Loss & PT", shift: "05:00 PM - 10:00 PM", status: "off", avatar: "SP" },
];

const getFallbackTrainers = (): Trainer[] => {
  if (typeof window === "undefined") return INITIAL_TRAINERS;
  const stored = localStorage.getItem("fallback_trainers");
  if (!stored) {
    localStorage.setItem("fallback_trainers", JSON.stringify(INITIAL_TRAINERS));
    return INITIAL_TRAINERS;
  }
  try {
    return JSON.parse(stored) as Trainer[];
  } catch {
    return INITIAL_TRAINERS;
  }
};

const saveFallbackTrainers = (list: Trainer[]) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("fallback_trainers", JSON.stringify(list));
  }
};

function TrainersPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<Trainer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  
  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [deletingTrainer, setDeletingTrainer] = useState<Trainer | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("trainers")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("Could not query trainers table (migration may not be applied). Falling back to LocalStorage.");
        setRows(getFallbackTrainers());
        setUsingFallback(true);
      } else {
        setRows((data ?? []) as Trainer[]);
        setUsingFallback(false);
      }
    } catch (err) {
      console.error("Trainer load error:", err);
      setRows(getFallbackTrainers());
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (usingFallback) {
      // Sync across multiple tabs of the same browser in sandbox mode
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "fallback_trainers") {
          setRows(getFallbackTrainers());
        }
      };
      window.addEventListener("storage", handleStorageChange);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
      };
    } else {
      // Supabase Realtime subscription to automatically sync changes across all clients/users
      const channel = supabase
        .channel("trainers-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trainers",
          },
          (payload) => {
            console.log("Realtime change detected:", payload);
            // Re-fetch the updated database state
            supabase
              .from("trainers")
              .select("*")
              .order("created_at", { ascending: true })
              .then(({ data, error }) => {
                if (!error && data) {
                  setRows(data as Trainer[]);
                }
              });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [usingFallback]);

  const handleCycleStatus = async (id: string, currentStatus: Trainer["status"]) => {
    if (!me.isAdmin) return;

    const statusCycle: Record<Trainer["status"], Trainer["status"]> = {
      floor: "session",
      session: "break",
      break: "off",
      off: "floor",
    };
    const nextStatus = statusCycle[currentStatus];
    const statusLabels: Record<Trainer["status"], string> = {
      floor: "Active on floor",
      session: "In PT Session",
      break: "On Break",
      off: "Off Duty",
    };

    if (usingFallback) {
      const updated = rows.map((t) => (t.id === id ? { ...t, status: nextStatus } : t));
      setRows(updated);
      saveFallbackTrainers(updated);
      toast.success(`Trainer status updated to ${statusLabels[nextStatus]}`);
    } else {
      const { error } = await supabase
        .from("trainers")
        .update({ status: nextStatus })
        .eq("id", id);
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Trainer status updated to ${statusLabels[nextStatus]}`);
        load();
      }
    }
  };

  const filtered = rows.filter((t) => {
    const term = q.toLowerCase();
    return !term || t.name.toLowerCase().includes(term) || t.specialization.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Trainers</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} total · {rows.filter((t) => t.status === "floor" || t.status === "session").length} active on duty
            {usingFallback && <span className="ml-2 text-warning text-xs font-semibold">(LocalStorage Sandbox Mode)</span>}
          </p>
        </div>
        {me.isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-glow">
                <Plus className="mr-1 h-4 w-4" /> Add trainer
              </Button>
            </DialogTrigger>
            <AddTrainerDialog
              usingFallback={usingFallback}
              onClose={() => { setAddOpen(false); load(); }}
              currentTrainers={rows}
            />
          </Dialog>
        )}
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by trainer name or specialization..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading trainers...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-border bg-card">
          <p className="text-sm font-medium">No trainers found</p>
          <p className="mt-1 text-xs text-muted-foreground">Add trainers to manage their shifts and specialities.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:border-border/80 hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                {t.avatar ? (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl gradient-primary text-base font-bold text-primary-foreground">
                    {t.avatar}
                  </div>
                ) : (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <User className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="truncate font-semibold text-foreground">{t.name}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Award className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t.specialization}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t.shift}</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-4">
                {me.isAdmin ? (
                  <button
                    onClick={() => handleCycleStatus(t.id, t.status)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition hover:opacity-80 cursor-pointer ${getStatusBadge(t.status)}`}
                    title="Click to cycle status"
                  >
                    {getStatusLabel(t.status)}
                  </button>
                ) : (
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${getStatusBadge(t.status)}`}>
                    {getStatusLabel(t.status)}
                  </span>
                )}

                {me.isAdmin && (
                  <div className="flex gap-2 opacity-60 transition group-hover:opacity-100">
                    <Button
                      onClick={() => setEditingTrainer(t)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      onClick={() => setDeletingTrainer(t)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Trainer Dialog */}
      <Dialog open={!!editingTrainer} onOpenChange={(o) => !o && setEditingTrainer(null)}>
        {editingTrainer && (
          <EditTrainerDialog
            trainer={editingTrainer}
            usingFallback={usingFallback}
            currentTrainers={rows}
            onClose={() => { setEditingTrainer(null); load(); }}
          />
        )}
      </Dialog>

      {/* Delete Trainer Dialog */}
      <Dialog open={!!deletingTrainer} onOpenChange={(o) => !o && setDeletingTrainer(null)}>
        {deletingTrainer && (
          <DeleteTrainerConfirm
            trainer={deletingTrainer}
            usingFallback={usingFallback}
            currentTrainers={rows}
            onClose={() => setDeletingTrainer(null)}
            onConfirm={async () => {
              if (!deletingTrainer) return;
              if (usingFallback) {
                const updated = rows.filter((r) => r.id !== deletingTrainer.id);
                setRows(updated);
                saveFallbackTrainers(updated);
                toast.success("Trainer profile deleted successfully");
              } else {
                const { error } = await supabase.from("trainers").delete().eq("id", deletingTrainer.id);
                if (error) { toast.error(error.message); return; }
                toast.success("Trainer profile deleted permanently");
              }
              setDeletingTrainer(null);
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function getStatusBadge(status: Trainer["status"]) {
  switch (status) {
    case "floor":
      return "bg-success/15 text-success";
    case "session":
      return "bg-secondary/15 text-secondary";
    case "break":
      return "bg-warning/15 text-warning";
    case "off":
      return "bg-muted text-muted-foreground";
  }
}

function getStatusLabel(status: Trainer["status"]) {
  switch (status) {
    case "floor":
      return "On Floor";
    case "session":
      return "In Session";
    case "break":
      return "On Break";
    case "off":
      return "Off Duty";
  }
}

/* Add Trainer Dialog component */
function AddTrainerDialog({
  usingFallback,
  onClose,
  currentTrainers,
}: {
  usingFallback: boolean;
  onClose: () => void;
  currentTrainers: Trainer[];
}) {
  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [shift, setShift] = useState("06:00 AM - 12:00 PM");
  const [status, setStatus] = useState<Trainer["status"]>("off");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !specialization.trim()) return toast.error("Please fill in all fields.");
    setBusy(true);

    const avatar = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    if (usingFallback) {
      const newT: Trainer = {
        id: Math.random().toString(),
        name: name.trim(),
        specialization: specialization.trim(),
        shift: shift.trim(),
        status,
        avatar,
      };
      const updated = [...currentTrainers, newT];
      saveFallbackTrainers(updated);
      toast.success("Trainer added successfully");
      setBusy(false);
      onClose();
    } else {
      const { error } = await supabase.from("trainers").insert({
        name: name.trim(),
        specialization: specialization.trim(),
        shift: shift.trim(),
        status,
        avatar,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Trainer added successfully");
        onClose();
      }
      setBusy(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add trainer</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Full Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Tapan Burman" /></div>
        <div><Label>Specialization / Role</Label><Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} required placeholder="HIIT & Kettlebell Coach" /></div>
        <div><Label>Shift timing</Label><Input value={shift} onChange={(e) => setShift(e.target.value)} required placeholder="06:00 AM - 12:00 PM" /></div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(val: any) => setStatus(val)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="floor">On Floor</SelectItem>
              <SelectItem value="session">In Session</SelectItem>
              <SelectItem value="break">On Break</SelectItem>
              <SelectItem value="off">Off Duty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Add trainer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Edit Trainer Dialog component */
function EditTrainerDialog({
  trainer,
  usingFallback,
  currentTrainers,
  onClose,
}: {
  trainer: Trainer;
  usingFallback: boolean;
  currentTrainers: Trainer[];
  onClose: () => void;
}) {
  const [name, setName] = useState(trainer.name);
  const [specialization, setSpecialization] = useState(trainer.specialization);
  const [shift, setShift] = useState(trainer.shift);
  const [status, setStatus] = useState<Trainer["status"]>(trainer.status);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !specialization.trim()) return toast.error("Please fill in all fields.");
    setBusy(true);

    const avatar = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    if (usingFallback) {
      const updated = currentTrainers.map((t) =>
        t.id === trainer.id
          ? { ...t, name: name.trim(), specialization: specialization.trim(), shift: shift.trim(), status, avatar }
          : t
      );
      saveFallbackTrainers(updated);
      toast.success("Trainer profile updated");
      setBusy(false);
      onClose();
    } else {
      const { error } = await supabase
        .from("trainers")
        .update({
          name: name.trim(),
          specialization: specialization.trim(),
          shift: shift.trim(),
          status,
          avatar,
        })
        .eq("id", trainer.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Trainer profile updated");
        onClose();
      }
      setBusy(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Edit trainer</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Full Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><Label>Specialization / Role</Label><Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} required /></div>
        <div><Label>Shift timing</Label><Input value={shift} onChange={(e) => setShift(e.target.value)} required /></div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(val: any) => setStatus(val)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="floor">On Floor</SelectItem>
              <SelectItem value="session">In Session</SelectItem>
              <SelectItem value="break">On Break</SelectItem>
              <SelectItem value="off">Off Duty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* Delete Trainer Confirmation component */
function DeleteTrainerConfirm({
  trainer,
  onClose,
  onConfirm,
}: {
  trainer: Trainer;
  usingFallback: boolean;
  currentTrainers: Trainer[];
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
          <ShieldAlert className="h-5 w-5" /> Delete Trainer
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 pt-2 text-sm text-muted-foreground">
        <p>Are you sure you want to delete trainer <strong>{trainer.name}</strong>?</p>
        <p>This will permanently remove their rota shift and availability stats.</p>
      </div>
      <DialogFooter className="pt-4 gap-2">
        <Button onClick={onClose} variant="outline" disabled={busy}>Cancel</Button>
        <Button onClick={handleDelete} variant="destructive" disabled={busy}>
          {busy ? "Deleting..." : "Delete Trainer"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
