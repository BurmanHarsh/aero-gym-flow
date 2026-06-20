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
  AlertTriangle,
  Fingerprint,
  UserCheck,
  UserX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "Employees · AeroGym OS" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).in("role", ["admin"]);
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

interface ProfileWithRole {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  role: "admin" | "front_desk" | null;
}

function EmployeesPage() {
  const me = useCurrentUser();
  const isStaff = me.isAdmin || me.roles.includes("front_desk");
  const [rows, setRows] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  // Tabs State
  const [activeTab, setActiveTab] = useState("roster");

  // Roster Filters
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Profile Filters
  const [profileQ, setProfileQ] = useState("");
  const [profileRoleFilter, setProfileRoleFilter] = useState("all");
  const [roleChangingUserId, setRoleChangingUserId] = useState<string | null>(null);

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
        .select("id, email, full_name, avatar_url, phone, created_at")
        .order("created_at", { ascending: false });

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (profData) {
        const combined = profData.map((p) => {
          const userRoles = rolesData?.filter((r) => r.user_id === p.id) ?? [];
          const role = (userRoles.find((ur) => ur.role === "admin")?.role || 
                        userRoles.find((ur) => ur.role === "front_desk")?.role || 
                        null) as "admin" | "front_desk" | null;
          return {
            ...p,
            role,
          };
        });
        setProfiles(combined);
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

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (userId === me.user?.id) {
      toast.error("You cannot change your own role to prevent lockout.");
      return;
    }

    const oldRole = profiles.find((p) => p.id === userId)?.role || null;
    setRoleChangingUserId(userId);

    try {
      // 1. Delete all existing roles for this user
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // 2. Insert new role if it's not "member"
      if (newRole === "admin" || newRole === "front_desk") {
        const { error: insertError } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole as "admin" | "front_desk" });

        if (insertError) throw insertError;
      }

      // 3. Log audit event
      await supabase.from("audit_logs").insert({
        actor_id: me.user?.id ?? null,
        actor_email: me.user?.email ?? null,
        action: "ROLE_CHANGE",
        entity_type: "profiles",
        entity_id: userId,
        metadata: {
          user_id: userId,
          old_role: oldRole,
          new_role: newRole === "member" ? null : newRole,
        }
      });

      toast.success("User role updated successfully");
      
      // Update local state
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === userId
            ? { ...p, role: (newRole === "member" ? null : newRole) as "admin" | "front_desk" | null }
            : p
        )
      );
    } catch (err: any) {
      console.error("Error updating role:", err);
      toast.error(err.message || "Failed to update user role");
    } finally {
      setRoleChangingUserId(null);
    }
  };

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
    if (!formEmail.trim()) {
      toast.error("Email address is required.");
      return;
    }
    if (!formPhone.trim()) {
      toast.error("Phone number is required.");
      return;
    }
    if (!formProfileId || formProfileId === "none") {
      toast.error("You must link the employee to a registered Google account. Ask them to sign in first.");
      return;
    }

    const salaryVal = parseFloat(formSalaryRs) || 0;
    const salaryCents = Math.round(salaryVal * 100);
    const profileIdValue = formProfileId;

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
    if (!formEmail.trim()) {
      toast.error("Email address is required.");
      return;
    }
    if (!formPhone.trim()) {
      toast.error("Phone number is required.");
      return;
    }
    if (!formProfileId || formProfileId === "none") {
      toast.error("You must link the employee to a registered Google account. Ask them to sign in first.");
      return;
    }

    const salaryVal = parseFloat(formSalaryRs) || 0;
    const salaryCents = Math.round(salaryVal * 100);
    const profileIdValue = formProfileId;

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

  // Filtered Profiles
  const filteredProfiles = profiles.filter((p) => {
    const matchesQ =
      p.email.toLowerCase().includes(profileQ.toLowerCase()) ||
      (p.full_name ?? "").toLowerCase().includes(profileQ.toLowerCase()) ||
      (p.phone ?? "").toLowerCase().includes(profileQ.toLowerCase());

    const matchesRole =
      profileRoleFilter === "all" ||
      (profileRoleFilter === "admin" && p.role === "admin") ||
      (profileRoleFilter === "front_desk" && p.role === "front_desk") ||
      (profileRoleFilter === "member" && p.role === null);

    return matchesQ && matchesRole;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Employees & Logins</h1>
          <p className="text-sm text-muted-foreground">
            Manage gym staff roster, track payroll, and control application access roles.
          </p>
        </div>
        {isStaff && activeTab === "roster" && (
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
                    <Label htmlFor="add-email">Email *</Label>
                    <Input id="add-email" type="email" required value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="name@aerogym.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-phone">Phone *</Label>
                    <Input id="add-phone" required value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
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
                  <Label htmlFor="add-profile">App Login Profile <span className="text-destructive">*</span></Label>
                  <p className="text-[11px] text-muted-foreground">The employee must have signed in with Google first.</p>
                  <Select value={formProfileId} onValueChange={setFormProfileId}>
                    <SelectTrigger id="add-profile">
                      <SelectValue placeholder="Select a registered Google account..." />
                    </SelectTrigger>
                    <SelectContent>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-start">
          <TabsList className="bg-card border border-border/80">
            <TabsTrigger value="roster" className="gap-2 cursor-pointer">
              <UsersRound className="h-4 w-4" />
              Staff Roster
            </TabsTrigger>
            <TabsTrigger value="logins" className="gap-2 cursor-pointer">
              <Fingerprint className="h-4 w-4" />
              App Logins
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="roster" className="space-y-6 mt-0">
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
                placeholder="Search staff by name, role, email, phone..."
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
        </TabsContent>

        <TabsContent value="logins" className="space-y-6 mt-0">
          {/* Logins Summary Metrics */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Accounts</span>
                <Fingerprint className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{profiles.length}</span>
                <span className="text-xs text-muted-foreground">registered logins</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Syncing in real-time from authentication table</p>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admins</span>
                <Shield className="h-4 w-4 text-rose-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-rose-400">{profiles.filter(p => p.role === "admin").length}</span>
                <span className="text-xs text-muted-foreground">administrators</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Full access permissions enabled</p>
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Front Desk</span>
                <QrCode className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-cyan-400">{profiles.filter(p => p.role === "front_desk").length}</span>
                <span className="text-xs text-muted-foreground">front desk staff</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Daily operations & check-in access</p>
            </div>
          </div>

          {/* Logins Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search app logins by name, email, phone..."
                value={profileQ}
                onChange={(e) => setProfileQ(e.target.value)}
                className="pl-9 bg-card/40 border-border"
              />
            </div>
            <div className="flex gap-2">
              <Select value={profileRoleFilter} onValueChange={setProfileRoleFilter}>
                <SelectTrigger className="w-[180px] bg-card/40 border-border">
                  <SelectValue placeholder="All Access Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Access Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="front_desk">Front Desk</SelectItem>
                  <SelectItem value="member">Member (No Staff Role)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Logins Listing */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">Loading logins...</div>
            ) : filteredProfiles.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No registered logins found matching the filters.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredProfiles.map((p) => {
                  const linkedEmployee = rows.find((emp) => emp.profile_id === p.id);
                  const initials = (p.full_name || p.email || "?")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div key={p.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between hover:bg-card/40 transition">
                      <div className="flex items-start gap-4">
                        {p.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            alt={p.full_name || p.email}
                            className="h-12 w-12 rounded-xl object-cover border border-border shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-base font-semibold text-muted-foreground">
                            {initials}
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground text-base">
                              {p.full_name || "Anonymous User"}
                            </span>
                            {p.id === me.user?.id && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/20">
                                You
                              </span>
                            )}
                            {linkedEmployee ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                                Roster Linked: {linkedEmployee.name} ({linkedEmployee.role})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/40">
                                Not in Roster
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex-row">
                            {p.phone && (
                              <span className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5" />
                                {p.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" />
                              {p.email}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              Registered {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-3 sm:border-none sm:pt-0 gap-6">
                        <div className="flex flex-col gap-1 sm:text-right">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">App Access Role</span>
                          <Select
                            value={p.role || "member"}
                            onValueChange={(val) => handleRoleChange(p.id, val)}
                            disabled={p.id === me.user?.id || roleChangingUserId !== null}
                          >
                            <SelectTrigger className={`w-[155px] h-8 text-xs font-semibold bg-card/60 ${
                              p.role === "admin" 
                                ? "text-rose-400 border-rose-500/20" 
                                : p.role === "front_desk"
                                ? "text-cyan-400 border-cyan-500/20"
                                : "text-muted-foreground border-border"
                            }`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member (No Access)</SelectItem>
                              <SelectItem value="front_desk">Front Desk Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
                <Label htmlFor="edit-email">Email *</Label>
                <Input id="edit-email" type="email" required value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone *</Label>
                <Input id="edit-phone" required value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
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
