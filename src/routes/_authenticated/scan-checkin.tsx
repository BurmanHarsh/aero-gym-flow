import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { MapPin, MapPinOff, CheckCircle2, AlertCircle, Loader2, QrCode, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// Gym target coordinates (TANK Strength & Conditioning Club)
const GYM_LAT = 22.8465057;
const GYM_LON = 88.3686884;
const MAX_DISTANCE_METERS = 50;

const searchSchema = z.object({
  key: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/scan-checkin")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({ meta: [{ title: "QR Check-in · Tank by Tapan" }] }),
  component: ScanCheckinPage,
});

// Haversine formula to calculate distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

function ScanCheckinPage() {
  const { key } = Route.useSearch();
  const me = useCurrentUser();
  
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"checking-key" | "checking-location" | "processing" | "success-in" | "success-out" | "error">("checking-key");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Location states
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Member info
  const [member, setMember] = useState<{ id: string; full_name: string; member_code: string } | null>(null);

  useEffect(() => {
    // 1. Verify access key
    if (key !== "tank_gate_9bb34964") {
      setStatus("error");
      setErrorMsg("Access Denied: Please scan the physical QR code inside the gym to check in.");
      setLoading(false);
      return;
    }

    if (me.loading) return;

    if (!me.user) {
      setStatus("error");
      setErrorMsg("Please sign in to your member account first.");
      setLoading(false);
      return;
    }

    // 2. Request Geolocation
    requestLocation();
  }, [key, me.loading, me.user]);

  function requestLocation() {
    setStatus("checking-location");
    setLoading(true);
    
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setErrorMsg("Geolocation is not supported by your browser. Please enable GPS permissions.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCoords({ lat, lon });
        
        const dist = getDistance(lat, lon, GYM_LAT, GYM_LON);
        setDistance(dist);

        if (dist > MAX_DISTANCE_METERS) {
          setStatus("error");
          setErrorMsg(`You are too far from the gym to check in. (Distance: ${Math.round(dist)} meters, Max limit: ${MAX_DISTANCE_METERS}m)`);
          setLoading(false);
        } else {
          // 3. Distance check passed, proceed to DB check-in/out
          processCheckin();
        }
      },
      (error) => {
        console.error("Location error:", error);
        setStatus("error");
        setErrorMsg("Failed to retrieve your location. Please grant location access to complete check-in.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }


  async function processCheckin() {
    setStatus("processing");
    setLoading(true);
    try {
      // Find matching member profile
      const { data: members, error: mErr } = await supabase
        .from("members")
        .select("id, full_name, member_code, status")
        .eq("email", me.email)
        .limit(1);

      if (mErr) throw mErr;
      const mem = members?.[0];

      if (!mem) {
        setStatus("error");
        setErrorMsg(`Your account (${me.email}) is not linked to any member profile in our gym database. Please contact the front desk to link your profile.`);
        setLoading(false);
        return;
      }

      if (mem.status !== "active") {
        setStatus("error");
        setErrorMsg(`Check-in blocked. Your membership is currently: ${mem.status}. Please visit the front desk to renew.`);
        setLoading(false);
        return;
      }

      setMember({ id: mem.id, full_name: mem.full_name, member_code: mem.member_code });

      // Check if already checked in (record with null check_out_at)
      const { data: activeRecords, error: activeErr } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("member_id", mem.id)
        .is("check_out_at", null);

      if (activeErr) throw activeErr;

      if (activeRecords && activeRecords.length > 0) {
        // Checked in -> perform check out
        const recordId = activeRecords[0].id;
        const { error: outErr } = await supabase
          .from("attendance_records")
          .update({ check_out_at: new Date().toISOString() })
          .eq("id", recordId);

        if (outErr) throw outErr;
        setStatus("success-out");
      } else {
        // Not checked in -> perform check-in
        const { error: inErr } = await supabase
          .from("attendance_records")
          .insert({ member_id: mem.id, method: "qr", recorded_by: me.user?.id ?? null });

        if (inErr) throw inErr;
        setStatus("success-in");
      }
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err.message || "An unexpected error occurred during database operations.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-glow text-center space-y-6">
        
        {/* Header Icon */}
        <div className="flex justify-center">
          {status === "checking-key" || status === "checking-location" || status === "processing" ? (
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <QrCode className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
            </div>
          ) : status === "success-in" ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>
          ) : status === "success-out" ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-info/15 text-info">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertCircle className="h-10 w-10" />
            </div>
          )}
        </div>

        {/* Status Headings & Details */}
        <div className="space-y-2">
          {status === "checking-key" && (
            <>
              <h2 className="text-xl font-bold">Verifying QR Token</h2>
              <p className="text-sm text-muted-foreground">Authenticating check-in request key...</p>
            </>
          )}

          {status === "checking-location" && (
            <>
              <h2 className="text-xl font-bold">Locating Device</h2>
              <p className="text-sm text-muted-foreground">Verifying proximity to gym entrance...</p>
            </>
          )}

          {status === "processing" && (
            <>
              <h2 className="text-xl font-bold">Processing Check-in</h2>
              <p className="text-sm text-muted-foreground">Updating attendance records...</p>
            </>
          )}

          {status === "success-in" && (
            <>
              <h2 className="text-2xl font-black text-success">Checked In Successfully!</h2>
              <p className="text-sm text-muted-foreground">Welcome to the floor, <strong>{member?.full_name}</strong>.</p>
              <div className="mt-2 text-xs font-semibold text-primary/80 tracking-wider uppercase bg-primary/10 rounded-full py-1 px-3 inline-block">
                Member ID: {member?.member_code}
              </div>
            </>
          )}

          {status === "success-out" && (
            <>
              <h2 className="text-2xl font-black text-info">Checked Out Successfully</h2>
              <p className="text-sm text-muted-foreground">Great workout, <strong>{member?.full_name}</strong>. See you next time!</p>
              <div className="mt-2 text-xs font-semibold text-primary/80 tracking-wider uppercase bg-primary/10 rounded-full py-1 px-3 inline-block">
                Member ID: {member?.member_code}
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <h2 className="text-xl font-bold text-destructive">Check-in Failed</h2>
              <p className="text-sm text-muted-foreground leading-relaxed px-2">{errorMsg}</p>
            </>
          )}
        </div>

        {/* Debug info for coordinates/distance */}
        {coords && (
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-left text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between"><span>Gym Coordinates:</span> <span className="font-mono text-foreground">{GYM_LAT.toFixed(4)}, {GYM_LON.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Your Coordinates:</span> <span className="font-mono text-foreground">{coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</span></div>
            {distance !== null && (
              <div className="flex justify-between border-t border-border/40 pt-1 mt-1">
                <span>Calculated Distance:</span> 
                <span className={`font-bold ${distance <= MAX_DISTANCE_METERS ? "text-success" : "text-destructive"}`}>
                  {Math.round(distance)} meters
                </span>
              </div>
            )}
          </div>
        )}

        {/* Buttons / Actions */}
        <div className="pt-2 flex flex-col gap-2">
          {status === "error" && key === "tank_gate_9bb34964" && (
            <>
              <Button onClick={requestLocation} className="w-full gradient-primary text-primary-foreground">
                Retry Location Verification
              </Button>
              

            </>
          )}

          {(status === "success-in" || status === "success-out") && (
            <Link to="/dashboard" className="w-full">
              <Button className="w-full gradient-primary text-primary-foreground">
                Go to Member Dashboard
              </Button>
            </Link>
          )}

          {status === "error" && key !== "tank_gate_9bb34964" && (
            <Link to="/dashboard" className="w-full">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Dashboard
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
