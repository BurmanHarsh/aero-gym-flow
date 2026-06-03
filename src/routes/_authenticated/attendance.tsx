import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, QrCode, Fingerprint, ArrowRight, LogOut as CheckOutIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance · AeroGym OS" }] }),
  component: AttendancePage,
});

interface Member { id: string; member_code: string; full_name: string; status: string; phone: string; }
interface Record_ {
  id: string; member_id: string; check_in_at: string; check_out_at: string | null; method: string;
  member: { full_name: string; member_code: string } | null;
}

function AttendancePage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [feed, setFeed] = useState<Record_[]>([]);

  async function loadFeed() {
    const { data } = await supabase
      .from("attendance_records")
      .select("*, member:members(full_name, member_code)")
      .order("check_in_at", { ascending: false })
      .limit(30);
    setFeed((data ?? []) as Record_[]);
  }

  useEffect(() => { loadFeed(); }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const id = setTimeout(async () => {
      const { data } = await supabase
        .from("members").select("id, member_code, full_name, status, phone")
        .or(`full_name.ilike.%${q}%,member_code.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
      setResults((data ?? []) as Member[]);
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  async function checkIn(memberId: string, method: "qr" | "biometric" | "manual" = "manual") {
    const { error } = await supabase.from("attendance_records").insert({ member_id: memberId, method });
    if (error) return toast.error(error.message);
    toast.success("Checked in");
    setQ(""); setResults([]);
    loadFeed();
  }

  async function checkOut(id: string) {
    const { error } = await supabase.from("attendance_records").update({ check_out_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Checked out");
    loadFeed();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Attendance</h1>
        <p className="text-sm text-muted-foreground">Live floor activity · today's check-ins</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-primary-foreground"><QrCode className="h-4 w-4" /></div>
            <div>
              <h3 className="text-sm font-semibold">Quick check-in</h3>
              <p className="text-xs text-muted-foreground">QR · Biometric · Manual</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan QR or search member…" className="pl-9" autoFocus />
          </div>
          <div className="mt-3 space-y-2">
            {results.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-xs font-semibold text-primary-foreground">{m.full_name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.full_name}</div>
                  <div className="text-[11px] text-muted-foreground">{m.member_code} · {m.phone}</div>
                </div>
                <Button size="sm" onClick={() => checkIn(m.id, "qr")} className="gradient-primary text-primary-foreground">
                  Check-in <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ))}
            {q && results.length === 0 && <p className="px-1 text-xs text-muted-foreground">No matches</p>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => toast.info("Point any QR at the kiosk — auto-scanned via webhook")}><QrCode className="mr-2 h-4 w-4" /> QR Mode</Button>
            <Button variant="outline" onClick={() => toast.info("Biometric reader simulated — touch sensor on kiosk")}><Fingerprint className="mr-2 h-4 w-4" /> Biometric</Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Live feed</h3>
          <div className="max-h-[460px] space-y-1 overflow-y-auto scrollbar-thin">
            {feed.length === 0 && <p className="px-1 py-3 text-sm text-muted-foreground">No activity yet today.</p>}
            {feed.map((r) => {
              const out = !!r.check_out_at;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
                  <span className={`h-2 w-2 rounded-full ${out ? "bg-muted-foreground" : "bg-success animate-pulse"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.member?.full_name ?? "Unknown"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.member?.member_code} · {r.method} · in {new Date(r.check_in_at).toLocaleTimeString()}{out && ` · out ${new Date(r.check_out_at!).toLocaleTimeString()}`}
                    </div>
                  </div>
                  {!out && <Button size="sm" variant="ghost" onClick={() => checkOut(r.id)}><CheckOutIcon className="h-3.5 w-3.5" /></Button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
