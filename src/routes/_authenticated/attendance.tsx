import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, QrCode, Fingerprint, ArrowRight, LogOut as CheckOutIcon } from "lucide-react";
import { toast } from "sonner";
import { getIndiaDayRange } from "@/lib/aerogym/dates";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance · Tank by Tapan" }] }),
  component: AttendancePage,
});

interface Member { id: string; member_code: string; full_name: string; status: string; phone: string; email: string | null; }
interface Record_ {
  id: string; member_id: string; check_in_at: string; check_out_at: string | null; method: string;
  member: { full_name: string; member_code: string } | null;
}

function AttendancePage() {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [feed, setFeed] = useState<Record_[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Member-only view states
  const [myMember, setMyMember] = useState<Member | null>(null);
  const [myLatestRecord, setMyLatestRecord] = useState<Record_ | null>(null);
  const [loadingMember, setLoadingMember] = useState(true);

  const isStaff = me.isAdmin || me.roles.includes("front_desk");

  async function loadFeed() {
    const today = getIndiaDayRange();
    const { data } = await supabase
      .from("attendance_records")
      .select("*, member:members(full_name, member_code)")
      .gte("check_in_at", today.start)
      .lt("check_in_at", today.end)
      .order("check_in_at", { ascending: false })
      .limit(30);
    setFeed((data ?? []) as Record_[]);
  }

  function refreshAttendanceStats() {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-14"] });
  }

  useEffect(() => {
    loadFeed();
  }, []);

  // Load member details based on email to identify own ID
  useEffect(() => {
    if (me.loading) return;

    async function loadMyDetails() {
      setLoadingMember(true);
      const { data: membersList } = await supabase
        .from("members")
        .select("id, member_code, full_name, status, phone, email")
        .eq("email", me.email)
        .limit(1);

      const memberData = membersList?.[0] || null;

      if (memberData) {
        setMyMember(memberData as Member);

        const { data: attData } = await supabase
          .from("attendance_records")
          .select("*, member:members(full_name, member_code)")
          .eq("member_id", memberData.id)
          .order("check_in_at", { ascending: false })
          .limit(1);

        setMyLatestRecord((attData?.[0] ?? null) as Record_ | null);
      }
      setLoadingMember(false);
    }

    loadMyDetails();
  }, [me.loading, me.email]);

  useEffect(() => {
    if (!isStaff) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      const { data, error } = await supabase
        .from("members").select("id, member_code, full_name, status, phone, email")
        .or(`full_name.ilike.%${term}%,member_code.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(8);
      if (error) {
        setResults([]);
        setSearchError(error.message);
        setSearching(false);
        return;
      }
      setResults((data ?? []) as Member[]);
      setSearching(false);
    }, 220);
    return () => clearTimeout(id);
  }, [q, isStaff]);

  async function checkIn(memberId: string, method: "qr" | "biometric" | "manual" = "manual") {
    if (!me.isAdmin) {
      if (!myMember || memberId !== myMember.id) {
        toast.error("You can't check in other's account");
        return;
      }
    }

    // Check if member is already checked in (using array select to handle multiple active sessions gracefully)
    const { data: activeRecords, error: activeErr } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("member_id", memberId)
      .is("check_out_at", null);

    if (activeErr) {
      toast.error(activeErr.message);
      return;
    }

    if (activeRecords && activeRecords.length > 0) {
      toast.error("This member is already checked in. They must check out first.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("attendance_records")
      .insert({ member_id: memberId, method, recorded_by: userData.user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success("Checked in");
    setQ(""); setResults([]);
    refreshAttendanceStats();
    loadFeed();
  }

  async function checkOut(id: string, memberId?: string) {
    if (!me.isAdmin) {
      if (!myMember || memberId !== myMember.id) {
        toast.error("You can't check out others unless you are an admin");
        return;
      }
    }
    const { error } = await supabase.from("attendance_records").update({ check_out_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Checked out");
    refreshAttendanceStats();
    loadFeed();
  }

  async function handleOwnCheckIn() {
    if (!myMember) return;

    // Check if member is already checked in
    const { data: activeRecords, error: activeErr } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("member_id", myMember.id)
      .is("check_out_at", null);

    if (activeErr) {
      toast.error(activeErr.message);
      return;
    }

    if (activeRecords && activeRecords.length > 0) {
      toast.error("You are already checked in. Please check out first.");
      return;
    }

    const { error } = await supabase
      .from("attendance_records")
      .insert({ member_id: myMember.id, method: "manual", recorded_by: me.user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success("Checked in successfully");
    
    // Refresh latest record
    const { data: attData } = await supabase
      .from("attendance_records")
      .select("*, member:members(full_name, member_code)")
      .eq("member_id", myMember.id)
      .order("check_in_at", { ascending: false })
      .limit(1);
    setMyLatestRecord((attData?.[0] ?? null) as Record_ | null);
    refreshAttendanceStats();
    loadFeed();
  }

  async function handleOwnCheckOut() {
    if (!myLatestRecord) return;
    const { error } = await supabase
      .from("attendance_records")
      .update({ check_out_at: new Date().toISOString() })
      .eq("id", myLatestRecord.id);
    if (error) return toast.error(error.message);
    toast.success("Checked out successfully");

    // Refresh latest record
    const { data: attData } = await supabase
      .from("attendance_records")
      .select("*, member:members(full_name, member_code)")
      .eq("member_id", myMember!.id)
      .order("check_in_at", { ascending: false })
      .limit(1);
    setMyLatestRecord((attData?.[0] ?? null) as Record_ | null);
    refreshAttendanceStats();
    loadFeed();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Attendance</h1>
        <p className="text-sm text-muted-foreground">Live floor activity · today's check-ins</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {me.loading || (loadingMember && !isStaff) ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground animate-pulse">
            Loading your attendance profile...
          </div>
        ) : isStaff ? (
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
                  <Button size="sm" onClick={() => checkIn(m.id, "manual")} className="gradient-primary text-primary-foreground">
                    Check-in <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              ))}
              {searching && <p className="px-1 text-xs text-muted-foreground">Searching members...</p>}
              {searchError && <p className="px-1 text-xs text-destructive">{searchError}</p>}
              {q && !searching && !searchError && results.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No member found. Add the person in Members first.</p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => toast.info("Point any QR at the kiosk — auto-scanned via webhook")}><QrCode className="mr-2 h-4 w-4" /> QR Mode</Button>
              <Button variant="outline" onClick={() => toast.info("Biometric reader simulated — touch sensor on kiosk")}><Fingerprint className="mr-2 h-4 w-4" /> Biometric</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5">
            {!myMember ? (
              <div className="text-center py-6">
                <p className="text-sm font-medium text-destructive">Account not linked</p>
                <p className="mt-2 text-xs text-muted-foreground max-w-sm mx-auto">
                  We couldn't find a member record linked to your email (<strong>{me.email}</strong>). Please contact the gym front desk to link your membership.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl gradient-primary text-sm font-bold text-primary-foreground">
                    {myMember.full_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{myMember.full_name}</h3>
                    <p className="text-xs text-muted-foreground">{myMember.member_code} · {myMember.phone}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Membership status:</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${myMember.status === 'active' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                      {myMember.status}
                    </span>
                  </div>
                  
                  {myLatestRecord && !myLatestRecord.check_out_at ? (
                    <div className="mt-4 space-y-3">
                      <div className="text-center text-xs text-muted-foreground">
                        You checked in at <strong className="text-foreground">{new Date(myLatestRecord.check_in_at).toLocaleTimeString()}</strong>.
                      </div>
                      <Button onClick={handleOwnCheckOut} className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Check-out
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4">
                      {myMember.status !== "active" ? (
                        <p className="text-center text-xs text-destructive">
                          Your membership is currently inactive. Please renew to check in.
                        </p>
                      ) : (
                        <Button onClick={handleOwnCheckIn} className="w-full gradient-primary text-primary-foreground">
                          Check-in <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
                  {!out && isStaff && <Button size="sm" variant="ghost" onClick={() => checkOut(r.id, r.member_id)}><CheckOutIcon className="h-3.5 w-3.5" /></Button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
