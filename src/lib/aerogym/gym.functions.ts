import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";

/**
 * Verifies the QR check-in key server-side.
 * The actual key is stored in CHECKIN_KEY env variable — never exposed to the client.
 * Returns { valid: true } or throws.
 */
export const verifyCheckinKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string }) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const secret = process.env.CHECKIN_KEY;
    if (!secret) throw new Error("Check-in system not configured. Contact your administrator.");
    if (data.key !== secret) throw new Error("Invalid check-in key. Please scan the physical QR code inside the gym.");
    return { valid: true };
  });

/**
 * Automatically marks expired memberships as 'expired'.
 * Runs against the DB — called from the dashboard on load (once per day via localStorage gate).
 */
export const autoExpireMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("members")
      .update({ status: "expired" })
      .eq("status", "active")
      .lt("expires_at", today)
      .select("id, full_name");
    if (error) throw new Error(error.message);
    return { expired: (data ?? []).length };
  });

/**
 * Sends expiry reminder emails to members whose membership expires in 3 days.
 * Should be called once per day (guarded by a localStorage timestamp check on the client).
 */
export const sendExpiryReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return { sent: 0, skipped: "No RESEND_API_KEY" };

    const { supabase } = context;

    // Find members expiring in exactly 3 days with a valid email
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const targetDate = threeDaysFromNow.toISOString().slice(0, 10);

    const { data: expiring, error } = await supabase
      .from("members")
      .select("id, full_name, email, expires_at, plan_id")
      .eq("status", "active")
      .eq("expires_at", targetDate)
      .not("email", "is", null);

    if (error) throw new Error(error.message);
    if (!expiring || expiring.length === 0) return { sent: 0 };

    const shell = (title: string, body: string) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1020;padding:32px;color:#e6e9f2">
  <div style="max-width:520px;margin:auto;background:#111733;border:1px solid #1f2747;border-radius:16px;padding:32px">
    <div style="font-weight:700;font-size:18px;background:linear-gradient(135deg,#14b8a6,#a855f7);-webkit-background-clip:text;color:transparent">Tank by Tapan</div>
    <h1 style="font-size:22px;margin:16px 0 8px">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#c9cfe0">${body}</div>
    <div style="margin-top:24px;font-size:11px;color:#7b8299">Sent by your gym via Tank by Tapan</div>
  </div>
</div>`;

    let sent = 0;
    for (const member of expiring) {
      if (!member.email) continue;
      const body = `
        <p>Hi <strong>${member.full_name}</strong>,</p>
        <p>This is a friendly reminder that your gym membership at <strong>Tank by Tapan</strong> is expiring in <strong>3 days</strong> on <strong>${member.expires_at}</strong>.</p>
        <p>Visit the front desk or contact your gym admin to renew your membership and continue your fitness journey! 💪</p>
        <p style="margin-top:16px;font-size:13px;color:#7b8299">If you've already renewed, please ignore this message.</p>`;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: "Tank by Tapan <noreply@tankbytapan.in>",
            to: [member.email],
            subject: "⏰ Your gym membership expires in 3 days",
            html: shell("Your membership is expiring soon!", body),
          }),
        });
        if (res.ok) sent++;
      } catch {
        // Continue sending to others even if one fails
      }
    }

    return { sent, total: expiring.length };
  });

export const createExpiryNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const todayStr = new Date().toISOString().slice(0, 10);
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    // 1. Find all active members expiring in the next 7 days
    const { data: expiring, error: err } = await supabase
      .from("members")
      .select("id, full_name, member_code, expires_at, email")
      .eq("status", "active")
      .gte("expires_at", todayStr)
      .lte("expires_at", sevenDaysLater);

    if (err) throw new Error(err.message);
    if (!expiring || expiring.length === 0) return { created: 0 };

    // Fetch profiles map (email -> profile id) to find target user_id for members
    const emails = expiring.map((m) => m.email?.toLowerCase()).filter(Boolean) as string[];
    const profileMap = new Map<string, string>();
    if (emails.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email");
      (profs ?? []).forEach((p) => {
        if (p.email) profileMap.set(p.email.toLowerCase(), p.id);
      });
    }

    // 2. Fetch notifications created today to avoid duplicates
    const { data: existingNotifs, error: notifErr } = await supabase
      .from("notifications")
      .select("title, user_id")
      .gte("created_at", todayStr + "T00:00:00Z");

    if (notifErr) throw new Error(notifErr.message);

    const existingKeys = new Set((existingNotifs ?? []).map((n) => `${n.user_id}:${n.title}`));
    let created = 0;

    for (const member of expiring) {
      const memberEmailKey = member.email?.toLowerCase();
      const targetUserId = memberEmailKey ? profileMap.get(memberEmailKey) : null;
      
      // If we cannot target a specific member user, do NOT broadcast globally to avoid exposing expiry to everyone
      if (!targetUserId) continue;

      const title = `Your Membership is Expiring Soon`;
      const key = `${targetUserId}:${title}`;

      // If already notified today, skip
      if (existingKeys.has(key)) continue;

      const daysLeft = Math.ceil(
        (new Date(member.expires_at!).getTime() - new Date(todayStr).getTime()) / 86400000
      );

      const body = `Hi ${member.full_name}, your membership (${member.member_code}) expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (on ${member.expires_at}). Please renew at the front desk.`;

      const { error: insertErr } = await supabase.from("notifications").insert({
        title,
        body,
        kind: "warning",
        link: "/members",
        user_id: targetUserId,
      });

      if (!insertErr) created++;
    }

    return { created };
  });
