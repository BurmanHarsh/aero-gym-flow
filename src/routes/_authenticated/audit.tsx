import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { getAuthCache } from "@/routes/_authenticated/route";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit logs · AeroGym OS" }] }),
  beforeLoad: () => {
    const cached = getAuthCache();
    if (!cached) throw redirect({ to: "/auth" });
    if (!cached.roles.includes("admin")) throw redirect({ to: "/dashboard" });
  },
  component: AuditPage,
});

interface Log { id: string; actor_email: string | null; action: string; entity_type: string | null; entity_id: string | null; created_at: string; metadata: Record<string, unknown> | null; }

function AuditPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => {
      setRows((data ?? []) as Log[]); setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Audit logs</h1>
          <p className="text-sm text-muted-foreground">Immutable record of system activity.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-success"><ShieldCheck className="h-3.5 w-3.5" /> Append-only</div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div> :
        rows.length === 0 ? <div className="p-12 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">No audit events recorded yet.</p></div> :
        <div className="divide-y divide-border">
          {rows.map((l) => (
            <div key={l.id} className="grid grid-cols-12 gap-3 px-5 py-3 text-sm">
              <div className="col-span-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
              <div className="col-span-3 truncate">{l.actor_email ?? "system"}</div>
              <div className="col-span-3"><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{l.action}</span></div>
              <div className="col-span-3 truncate text-xs text-muted-foreground">{l.entity_type}{l.entity_id && ` · ${l.entity_id.slice(0, 8)}`}</div>
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}
