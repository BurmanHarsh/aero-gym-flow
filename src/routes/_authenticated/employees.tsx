import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  UsersRound,
  Shield,
  Plus,
  Search,
  Edit2,
  Trash2,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  IndianRupee,
  Wrench,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  QrCode,
  Dumbbell,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "Employees · AeroGym OS" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin");
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: EmployeesPage,
});

interface Employee {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  salary_cents: number;
  status: "active" | "inactive";
  hire_date: string;
  profile_id: string | null;
}

const INITIAL_EMPLOYEES: Employee[] = [
  { id: "e1", name: "Arjun Kapoor", role: "Manager", email: "arjun@aerogym.com", phone: "+91 98765 43210", salary_cents: 5000000, status: "active", hire_date: "2025-01-15", profile_id: null },
  { id: "e2", name: "Vikram Singh", role: "Trainer", email: "vikram@aerogym.com", phone: "+91 98765 43211", salary_cents: 3000000, status: "active", hire_date: "2025-02-10", profile_id: null },
  { id: "e3", name: "Neha Sharma", role: "Front Desk", email: "neha@aerogym.com", phone: "+91 98765 43212", salary_cents: 2500000, status: "active", hire_date: "2025-03-01", profile_id: null },
  { id: "e4", name: "Ramesh Kumar", role: "Sweeper", email: null, phone: "+91 98765 43213", salary_cents: 1200000, status: "active", hire_date: "2025-04-12", profile_id: null },
  { id: "e5", name: "Suresh Pal", role: "Security", email: null, phone: "+91 98765 43214", salary_cents: 1500000, status: "inactive", hire_date: "2025-05-20", profile_id: null },
];

const getFallbackEmployees = (): Employee[] => {
  if (typeof window === "undefined") return INITIAL_EMPLOYEES;
  const stored = localStorage.getItem("fallback_employees");
  if (!stored) {
    localStorage.setItem("fallback_employees", JSON.stringify(INITIAL_EMPLOYEES));
    return INITIAL_EMPLOYEES;
  }
  try {
    return JSON.parse(stored) as Employee[];
  } catch {
    return INITIAL_EMPLOYEES;
  }
};

const saveFallbackEmployees = (list: Employee[]) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("fallback_employees", JSON.stringify(list));
  }
};

function formatRupees(cents: number) {
  const rs = cents / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rs);
}

function getRoleIcon(role: string) {
  const r = role.toLowerCase();
  if (r.includes("manager")) return <Shield className="h-3.5 w-3.5" />;
  if (r.includes("trainer")) return <Dumbbell className="h-3.5 w-3.5" />;
  if (r.includes("front") || r.includes("desk") || r.includes("reception")) return <QrCode className="h-3.5 w-3.5" />;
  if (r.includes("sweeper") || r.includes("clean") || r.includes("maid")) return <Wrench className="h-3.5 w-3.5" />;
  if (r.includes("security") || r.includes("guard")) return <ShieldAlert className="h-3.5 w-3.5" />;
  return <Briefcase className="h-3.5 w-3.5" />;
}

function getRoleColor(role: string) {
  const r = role.toLowerCase();
  if (r.includes("manager")) return "bg-primary/10 text-primary border border-primary/20";
  if (r.includes("trainer")) return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
  if (r.includes("front") || r.includes("desk") || r.includes("reception")) return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
  if (r.includes("sweeper") || r.includes("clean") || r.includes("maid")) return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  if (r.includes("security") || r.includes("guard")) return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
  return "bg-muted text-muted-foreground border border-border";
}

function EmployeesPage() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; email: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog States
  const [addOpen, setAddOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("Trainer");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formSalaryRs, setFormSalaryRs] = useState("20000");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [formHireDate, setFormHireDate] = useState(new Date().toISOString().split("T")[0]);
  const [formProfileId, setFormProfileId] = useState<string>("none");

  async function load() {
    setLoading(true);
    try {
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: profData } = await supabase
        .from("profiles")
        .select("id, email, full_name");

      if (profData) {
        setProfiles(profData);
      }

      if (empError) {
        console.warn("Could not query employees table, falling back to LocalStorage.");
        setRows(getFallbackEmployees());
        setUsingFallback(true);
      } else {
        setRows((empData ?? []) as Employee[]);
        setUsingFallback(false);
      }
    } catch (err) {
      console.error("Employee load error:", err);
      setRows(getFallbackEmployees());
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Sync state between tabs if using fallback
  useEffect(() => {
    if (usingFallback) {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "fallback_employees") {
          setRows(getFallbackEmployees());
        }
      };
      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, [usingFallback]);

  const saveEmployeeList = (list: Employee[]) => {
    setRows(list);
    if (usingFallback) {
      saveFallbackEmployees(list);
    }
  };

  const resetForm = (emp?: Employee) => {
    if (emp) {
      setFormName(emp.name);
      setFormRole(emp.role);
      setFormEmail(emp.email ?? "");
      setFormPhone(emp.phone ?? "");
      setFormSalaryRs(Math.round(emp.salary_cents / 100).toString());
      setFormStatus(emp.status);
      setFormHireDate(emp.hire_date);
      setFormProfileId(emp.profile_id ?? "none");
    } else {
      setFormName("");
      setFormRole("Trainer");
      setFormEmail("");
      setFormPhone("");
      setFormSalaryRs("20000");
      setFormStatus("active");
      setFormHireDate(new Date().toISOString().split("T")[0]);
      setFormProfileId("none");
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formRole.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const salaryVal = parseFloat(formSalaryRs) || 0;
    const salaryCents = Math.round(salaryVal * 100);
    const profileIdValue = formProfileId === "none" ? null : formProfileId;

    const payload: Omit<Employee, "id"> = {
      name: formName.trim(),
      role: formRole.trim(),
      email: formEmail.trim() || null,
      phone: formPhone.trim() || null,
      salary_cents: salaryCents,
      status: formStatus,
      hire_date: formHireDate,
      profile_id: profileIdValue,
    };

    if (usingFallback) {
      const newEmp: Employee = {
        ...payload,
        id: "local_" + Math.random().toString(36).substr(2, 9),
      };
      saveEmployeeList([newEmp, ...rows]);
      toast.success("Employee record created (Local storage)");
      setAddOpen(false);
      resetForm();
    } else {
      const { data, error } = await supabase
        .from("employees")
        .insert([payload])
        .select();

      if (error) {
        toast.error(`Failed to hire employee: ${error.message}`);
      } else {
        toast.success("Employee record added successfully");
        if (data && data[0]) {
          setRows([data[0] as Employee, ...rows]);
        } else {
          load();
        }
        setAddOpen(false);
        resetForm();
      }
    }
  };

  const handleUpdate = async () => {
    if (!editingEmployee) return;
    if (!formName.trim() || !formRole.trim()) {
      toast.error("Name and Role are required.");
      return;
    }

    const salaryVal = parseFloat(formSalaryRs) || 0;
    const salaryCents = Math.round(salaryVal * 100);
    const profileIdValue = formProfileId === "none" ? null : formProfileId;

    const payload: Partial<Employee> = {
      name: formName.trim(),
      role: formRole.trim(),
      email: formEmail.trim() || null,
      phone: formPhone.trim() || null,
      salary_cents: salaryCents,
      status: formStatus,
      hire_date: formHireDate,
      profile_id: profileIdValue,
    };

    if (usingFallback) {
      const updated = rows.map((r) => (r.id === editingEmployee.id ? { ...r, ...payload } : r));
      saveEmployeeList(updated);
      toast.success("Employee record updated (Local storage)");
      setEditingEmployee(null);
    } else {
      const { error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", editingEmployee.id);

      if (error) {
        toast.error(`Failed to update employee: ${error.message}`);
      } else {
        toast.success("Employee record updated successfully");
        setRows(rows.map((r) => (r.id === editingEmployee.id ? { ...r, ...payload } : r)));
        setEditingEmployee(null);
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingEmployee) return;

    if (usingFallback) {
      const updated = rows.filter((r) => r.id !== deletingEmployee.id);
      saveEmployeeList(updated);
      toast.success("Employee terminated/removed (Local storage)");
      setDeletingEmployee(null);
    } else {
      const { error } = await supabase
        .from("employees")
        .delete()
        .eq("id", deletingEmployee.id);

      if (error) {
        toast.error(`Failed to delete employee: ${error.message}`);
      } else {
        toast.success("Employee terminated/removed successfully");
        setRows(rows.filter((r) => r.id !== deletingEmployee.id));
        setDeletingEmployee(null);
      }
    }
  };

  // Computations
  const activeCount = rows.filter((r) => r.status === "active").length;
  const inactiveCount = rows.length - activeCount;
  const totalMonthlyPayrollCents = rows
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.salary_cents, 0);

  // Filtered Rows
  const filteredRows = rows.filter((r) => {
    const matchesQ =
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.role.toLowerCase().includes(q.toLowerCase()) ||
      (r.email ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (r.phone ?? "").toLowerCase().includes(q.toLowerCase());

    const matchesRole = roleFilter === "all" || r.role.toLowerCase() === roleFilter.toLowerCase();
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;

    return matchesQ && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Manage gym staff, track payroll expenses, and assign active roles.
          </p>
        </div>
        {me.isAdmin && (
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground gap-2">
                <Plus className="h-4 w-4" />
                Hire Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border border-border">
              <DialogHeader>
                <DialogTitle>Hire New Employee</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="add-name">Employee Name *</Label>
                  <Input id="add-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Ramesh Kumar" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-role">Role *</Label>
                    <Select value={formRole} onValueChange={setFormRole}>
                      <SelectTrigger id="add-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Trainer">Trainer</SelectItem>
                        <SelectItem value="Front Desk">Front Desk</SelectItem>
                        <SelectItem value="Sweeper">Sweeper / Cleaner</SelectItem>
                        <SelectItem value="Security">Security Guard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-salary">Monthly Salary (INR) *</Label>
                    <Input id="add-salary" type="number" value={formSalaryRs} onChange={(e) => setFormSalaryRs(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-email">Email (Optional)</Label>
                    <Input id="add-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="name@aerogym.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-phone">Phone (Optional)</Label>
                    <Input id="add-phone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-hire-date">Hire Date</Label>
                    <Input id="add-hire-date" type="date" value={formHireDate} onChange={(e) => setFormHireDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-status">Status</Label>
                    <Select value={formStatus} onValueChange={(val) => setFormStatus(val as "active" | "inactive")}>
                      <SelectTrigger id="add-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-profile">Link to App Login Profile (Optional)</Label>
                  <Select value={formProfileId} onValueChange={setFormProfileId}>
                    <SelectTrigger id="add-profile">
                      <SelectValue placeholder="Choose profile..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Don't link profile</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email} ({p.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} className="gradient-primary text-primary-foreground">Confirm Hire</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {/* Database Warning */}
      {usingFallback && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4 text-warning">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold">Local Storage Mode:</span> The employees table migration hasn't been applied to your database yet. Your changes will be saved to the local browser storage until it is applied.
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Staff</span>
            <UsersRound className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{activeCount}</span>
            <span className="text-xs text-muted-foreground">/ {rows.length} total staff</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{inactiveCount} staff members currently inactive</p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Payroll</span>
            <IndianRupee className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{formatRupees(totalMonthlyPayrollCents)}</span>
            <span className="text-xs text-muted-foreground">/ mo</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Based on active staff salaries</p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roster Status</span>
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-cyan-400">Stable</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Staff database synced successfully</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staff by name, email, phone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-card/40 border-border"
          />
        </div>
        <div className="flex gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px] bg-card/40 border-border">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="trainer">Trainer</SelectItem>
              <SelectItem value="front desk">Front Desk</SelectItem>
              <SelectItem value="sweeper">Sweeper</SelectItem>
              <SelectItem value="security">Security</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-card/40 border-border">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Roster Listing */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading roster...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No employees found matching the filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRows.map((emp) => {
              const profileLink = profiles.find((p) => p.id === emp.profile_id);

              return (
                <div key={emp.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between hover:bg-card/40 transition">
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl gradient-primary text-base font-semibold text-primary-foreground">
                      {emp.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground text-base">{emp.name}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${getRoleColor(emp.role)}`}>
                          {getRoleIcon(emp.role)}
                          {emp.role}
                        </span>
                        {emp.status === "active" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/20">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex-row">
                        {emp.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {emp.phone}
                          </span>
                        )}
                        {emp.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            {emp.email}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Hired {new Date(emp.hire_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      {profileLink && (
                        <div className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/5 border border-primary/10 rounded-md px-1.5 py-0.5 mt-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Linked to App Account: {profileLink.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/40 pt-3 sm:border-none sm:pt-0 gap-6">
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Monthly Salary</div>
                      <div className="text-lg font-bold text-foreground">{formatRupees(emp.salary_cents)}</div>
                    </div>

                    {me.isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingEmployee(emp);
                            resetForm(emp);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                          onClick={() => setDeletingEmployee(emp)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editingEmployee !== null} onOpenChange={(open) => { if (!open) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Edit Employee Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Employee Name *</Label>
              <Input id="edit-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role *</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Trainer">Trainer</SelectItem>
                    <SelectItem value="Front Desk">Front Desk</SelectItem>
                    <SelectItem value="Sweeper">Sweeper / Cleaner</SelectItem>
                    <SelectItem value="Security">Security Guard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-salary">Monthly Salary (INR) *</Label>
                <Input id="edit-salary" type="number" value={formSalaryRs} onChange={(e) => setFormSalaryRs(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email (Optional)</Label>
                <Input id="edit-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone (Optional)</Label>
                <Input id="edit-phone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-hire-date">Hire Date</Label>
                <Input id="edit-hire-date" type="date" value={formHireDate} onChange={(e) => setFormHireDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={formStatus} onValueChange={(val) => setFormStatus(val as "active" | "inactive")}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-profile">Link to App Login Profile (Optional)</Label>
              <Select value={formProfileId} onValueChange={setFormProfileId}>
                <SelectTrigger id="edit-profile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't link profile</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmployee(null)}>Cancel</Button>
            <Button onClick={handleUpdate} className="gradient-primary text-primary-foreground">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deletingEmployee !== null} onOpenChange={(open) => { if (!open) setDeletingEmployee(null); }}>
        <DialogContent className="max-w-sm bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Terminate Employee</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            Are you sure you want to terminate/remove <span className="font-semibold text-foreground">{deletingEmployee?.name}</span>? This will remove them from the active staff list.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingEmployee(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Terminate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
