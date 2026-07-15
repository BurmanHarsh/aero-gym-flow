import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, QrCode, ArrowRight, Printer, LogOut as CheckOutIcon } from "lucide-react";
import { toast } from "sonner";
import { getIndiaDayRange } from "@/lib/aerogym/dates";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Member-only view states
  const [myMember, setMyMember] = useState<Member | null>(null);
  const [myLatestRecord, setMyLatestRecord] = useState<Record_ | null>(null);
  const [loadingMember, setLoadingMember] = useState(true);

  const isStaff = me.isAdmin || me.roles.includes("front_desk");

  const scanUrl = "https://tankbytapan.in/scan-checkin?key=tank_gate_9bb34964";
  
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=14b8a6&bgcolor=111733&data=${encodeURIComponent(scanUrl)}`;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Wall QR - Tank by Tapan</title>
          <style>
            body { background: #0b1020; color: white; font-family: sans-serif; text-align: center; padding: 40px; margin: 0; }
            .card { max-width: 400px; margin: 50px auto; background: #111733; border: 2px solid #1f2747; border-radius: 24px; padding: 40px; box-shadow: 0 20px 50px rgba(20, 184, 166, 0.15); }
            .logo { font-size: 24px; font-weight: 800; color: #14b8a6; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px; }
            img { border-radius: 16px; border: 4px solid #14b8a6; padding: 8px; background: #111733; }
            h1 { font-size: 28px; margin: 24px 0 8px; font-weight: 700; }
            p { font-size: 14px; color: #c9cfe0; margin-bottom: 24px; line-height: 1.6; }
            .footer { font-size: 11px; color: #7b8299; margin-top: 30px; border-top: 1px solid #1f2747; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">Tank by Tapan</div>
            <img src="${qrApiUrl}" width="300" height="300" />
            <h1>SELF-CHECK-IN</h1>
            <p>Scan this QR code with your phone camera to instantly check in or out of the gym.</p>
            <div class="footer">Tank Strength & Conditioning Club</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
    let active = true;

    async function searchMembers() {
      setSearching(true);
      setSearchError("");
      const { data, error } = await supabase
        .from("members").select("id, member_code, full_name, status, phone, email")
        .or(`full_name.ilike.%${term}%,member_code.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(8);
      
      if (!active) return;

      if (error) {
        setResults([]);
        setSearchError(error.message);
        setSearching(false);
        return;
      }
      setResults((data ?? []) as Member[]);
      setSearching(false);
    }

    searchMembers();

    return () => {
      active = false;
    };
  }, [q, isStaff]);

  async function checkIn(memberId: string, method: "qr" | "biometric" | "manual" = "manual") {
    if (!isStaff) {
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
    if (!isStaff) {
      if (!myMember || memberId !== myMember.id) {
        toast.error("You can't check out others");
        return;
      }
    }
    const { error } = await supabase.from("attendance_records").update({ check_out_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Checked out");
    if (isStaff) {
      setQ("");
      setResults([]);
    }
    refreshAttendanceStats();
    loadFeed();
  }

  const isMyCheckedIn = myLatestRecord && !myLatestRecord.check_out_at;

  async function handleSelfCheckInOut() {
    if (!myMember) {
      toast.error("Your account is not linked to a member record. Please add yourself as a member first.");
      return;
    }
    if (isMyCheckedIn) {
      await checkOut(myLatestRecord.id, myMember.id);
      const { data: attData } = await supabase
        .from("attendance_records")
        .select("*, member:members(full_name, member_code)")
        .eq("member_id", myMember.id)
        .order("check_in_at", { ascending: false })
        .limit(1);
      setMyLatestRecord((attData?.[0] ?? null) as Record_ | null);
    } else {
      await checkIn(myMember.id, "manual");
      const { data: attData } = await supabase
        .from("attendance_records")
        .select("*, member:members(full_name, member_code)")
        .eq("member_id", myMember.id)
        .order("check_in_at", { ascending: false })
        .limit(1);
      setMyLatestRecord((attData?.[0] ?? null) as Record_ | null);
    }
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
                <p className="text-xs text-muted-foreground">QR · Manual</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan QR or search member…" className="pl-9" autoFocus />
            </div>
            <div className="mt-3 space-y-2">
              {results.map((m) => {
                const activeRecord = feed.find((r) => r.member_id === m.id && !r.check_out_at);
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-xs font-semibold text-primary-foreground">{m.full_name.slice(0, 1)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{m.full_name}</div>
                        {activeRecord && (
                          <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold text-success capitalize">
                            Checked In
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{m.member_code}{isStaff ? ` · ${m.phone}` : ""}</div>
                    </div>
                    {activeRecord ? (
                      <Button size="sm" variant="destructive" onClick={() => checkOut(activeRecord.id, m.id)}>
                        Check-out <CheckOutIcon className="ml-1 h-3 w-3" />
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => checkIn(m.id, "manual")} className="gradient-primary text-primary-foreground">
                        Check-in <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {searching && <p className="px-1 text-xs text-muted-foreground">Searching members...</p>}
              {searchError && <p className="px-1 text-xs text-destructive">{searchError}</p>}
              {q && !searching && !searchError && results.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No member found. Add the person in Members first.</p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                onClick={handleSelfCheckInOut}
                className={isMyCheckedIn ? "border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive" : "border-primary/30 text-primary hover:bg-primary/15 hover:text-primary"}
              >
                {isMyCheckedIn ? (
                  <><CheckOutIcon className="mr-2 h-4 w-4" /> Check-out Self</>
                ) : (
                  <><ArrowRight className="mr-2 h-4 w-4" /> Check-in Self</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setQrModalOpen(true)}><QrCode className="mr-2 h-4 w-4" /> Get Wall QR</Button>
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
                      <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 p-3 text-success text-xs">
                        <span className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
                        <div className="flex-1">
                          <strong>Currently Checked In</strong>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Checked in at {new Date(myLatestRecord.check_in_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                      <p className="text-center text-[11px] text-muted-foreground pt-1.5 leading-relaxed">
                        To check out, please scan the physical <strong>Wall QR Code</strong> at the gym entrance.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2 rounded-xl bg-muted/30 border border-border p-3 text-muted-foreground text-xs">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <strong>Currently Checked Out</strong>
                          <div className="text-[10px] text-muted-foreground mt-0.5">No active check-in session today.</div>
                        </div>
                      </div>
                      {myMember.status !== "active" ? (
                        <p className="text-center text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                          Your membership is currently inactive. Please renew to check in.
                        </p>
                      ) : (
                        <p className="text-center text-[11px] text-muted-foreground pt-1.5 leading-relaxed">
                          To check in, please scan the physical <strong>Wall QR Code</strong> at the gym entrance.
                        </p>
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
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{r.member?.full_name ?? "Unknown"}</div>
                      {r.method === "qr" ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-teal-400 border border-teal-500/20">
                          <QrCode className="h-2.5 w-2.5" /> QR Code
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 border border-amber-500/20">
                          Manual
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.member?.member_code} · Checked in at {new Date(r.check_in_at).toLocaleTimeString()}{out && ` · Out at ${new Date(r.check_out_at!).toLocaleTimeString()}`}
                    </div>
                  </div>
                  {!out && isStaff && <Button size="sm" variant="ghost" onClick={() => checkOut(r.id, r.member_id)}><CheckOutIcon className="h-3.5 w-3.5" /></Button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-md bg-[#111733] border-2 border-[#1f2747] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight text-center text-[#14b8a6]">
              Gym Wall QR Code
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <div className="rounded-2xl border-4 border-[#14b8a6] p-2 bg-[#111733] shadow-[0_0_30px_rgba(20,184,166,0.25)]">
              <img 
                src={qrApiUrl} 
                alt="Gym Wall QR Code" 
                className="h-[250px] w-[250px] object-contain rounded-lg"
              />
            </div>
            <p className="text-xs text-center text-[#c9cfe0] max-w-xs leading-relaxed">
              Print this static QR code and paste it on the gym wall. Members can scan it with their mobile phones to check in and out of the gym.
            </p>
            <div className="w-full text-[10px] text-[#7b8299] bg-[#0b1020] border border-[#1f2747] rounded-lg p-2.5 space-y-1 font-mono">
              <div className="flex justify-between"><span>Check-in URL:</span> <span className="text-white truncate max-w-[200px]">{scanUrl}</span></div>
              <div className="flex justify-between"><span>Required Secret:</span> <span className="text-white">{new URL(scanUrl).searchParams.get("key")}</span></div>
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setQrModalOpen(false)} className="border-border hover:bg-white/5 text-white">
              Close
            </Button>
            <Button onClick={handlePrint} className="gradient-primary text-primary-foreground hover:opacity-90">
              <Printer className="mr-2 h-4 w-4" /> Print QR Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
