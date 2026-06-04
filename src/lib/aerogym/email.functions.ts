import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FROM = "AeroGym OS <onboarding@resend.dev>";

async function send(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

const shell = (title: string, body: string) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1020;padding:32px;color:#e6e9f2">
  <div style="max-width:520px;margin:auto;background:#111733;border:1px solid #1f2747;border-radius:16px;padding:32px">
    <div style="font-weight:700;font-size:18px;background:linear-gradient(135deg,#14b8a6,#a855f7);-webkit-background-clip:text;color:transparent">AeroGym OS</div>
    <h1 style="font-size:22px;margin:16px 0 8px">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#c9cfe0">${body}</div>
    <div style="margin-top:24px;font-size:11px;color:#7b8299">Sent by your gym via AeroGym OS</div>
  </div>
</div>`;

export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; name: string; plan?: string; expiresAt?: string }) =>
    z.object({ to: z.string().email(), name: z.string().min(1), plan: z.string().optional(), expiresAt: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const body = `
      <p>Hi ${data.name}, welcome to the gym! Your membership is now active.</p>
      ${data.plan ? `<p><strong>Plan:</strong> ${data.plan}</p>` : ""}
      ${data.expiresAt ? `<p><strong>Valid until:</strong> ${data.expiresAt}</p>` : ""}
      <p>See you on the floor 💪</p>`;
    return send(data.to, "Welcome to the gym 🎉", shell(`Welcome, ${data.name}!`, body));
  });

export const sendReceiptEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; name: string; invoiceNumber: string; amount: string; method: string }) =>
    z.object({ to: z.string().email(), name: z.string().min(1), invoiceNumber: z.string(), amount: z.string(), method: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const body = `
      <p>Hi ${data.name}, we've received your payment. Thank you!</p>
      <table style="width:100%;margin-top:12px;font-size:13px">
        <tr><td style="color:#7b8299">Invoice</td><td style="text-align:right;font-family:monospace">${data.invoiceNumber}</td></tr>
        <tr><td style="color:#7b8299">Amount</td><td style="text-align:right;font-weight:600">${data.amount}</td></tr>
        <tr><td style="color:#7b8299">Method</td><td style="text-align:right;text-transform:capitalize">${data.method}</td></tr>
      </table>`;
    return send(data.to, `Receipt · ${data.invoiceNumber}`, shell("Payment received", body));
  });
