import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UsersRound, Shield } from "lucide-react";

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

interface Profile { id: string; email: string; full_name: string | null; created_at: string; }
interface RoleRow { user_id: string; role: "admin" | "front_desk"; }

function EmployeesPage() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, ("admin"|"front_desk")[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]).then(([p, r]) => {
      setRows((p.data ?? []) as Profile[]);
      const map: Record<string, ("admin"|"front_desk")[]> = {};
      ((r.data ?? []) as RoleRow[]).forEach((x) => {
        (map[x.user_id] ||= []).push(x.role);
      });
      setRoles(map); setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Employees</h1>
        <p className="text-sm text-muted-foreground">{rows.length} team member{rows.length === 1 ? "" : "s"} · invite new staff to onboard</p>
      </header>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div> :
        <div className="divide-y divide-border">
          {rows.map((p) => {
            const rs = roles[p.id] ?? [];
            const isAdmin = rs.includes("admin");
            return (
              <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
                  {(p.full_name ?? p.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${isAdmin ? "bg-secondary/15 text-secondary" : "bg-info/15 text-info"}`}>
                  {isAdmin ? <Shield className="h-3 w-3" /> : <UsersRound className="h-3 w-3" />}
                  {isAdmin ? "Admin" : "Front desk"}
                </span>
              </div>
            );
          })}
        </div>}
      </div>
    </div>
  );
}
