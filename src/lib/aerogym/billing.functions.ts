import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stripeModeSchema = z.enum(["card", "upi"]);

function stripeSecretKey() {
  let key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  // Trim surrounding quotes or whitespace in case the env value was quoted
  key = key.trim().replace(/^['"]|['"]$/g, "");
  // Masked debug: log first 8 chars so we can confirm which key the server is using
  try {
    // eslint-disable-next-line no-console
    console.log('Stripe key (masked):', key.slice(0, 8) + '...');
  } catch (e) {
    // ignore logging errors
  }
  return key;
}

async function stripeRequest(path: string, init: RequestInit) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      ...init.headers,
    },
  });

  const body = await res.json();
  if (!res.ok) {
    const message = body?.error?.message ?? `Stripe request failed with ${res.status}`;
    throw new Error(message);
  }
  return body;
}

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoiceId: string; method: "card" | "upi"; origin: string }) =>
    z.object({
      invoiceId: z.string().uuid(),
      method: stripeModeSchema,
      origin: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_cents, status, created_by, member:members(full_name, email)")
      .eq("id", data.invoiceId)
      .single();

    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("Invoice is already paid");
    if (invoice.total_cents <= 0) throw new Error("Invoice amount must be greater than zero");

    const successUrl = `${data.origin}/billing?stripe_session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${data.origin}/billing`;
    const member = Array.isArray(invoice.member) ? invoice.member[0] : invoice.member;
    const description = `AeroGym invoice ${invoice.invoice_number}`;
    const params = new URLSearchParams();

    params.append("mode", "payment");
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
    params.append("payment_method_types[0]", data.method);
    params.append("line_items[0][quantity]", "1");
    params.append("line_items[0][price_data][currency]", "inr");
    params.append("line_items[0][price_data][unit_amount]", String(invoice.total_cents));
    params.append("line_items[0][price_data][product_data][name]", description);
    params.append("client_reference_id", invoice.id);
    params.append("metadata[invoice_id]", invoice.id);
    params.append("metadata[recorded_by]", userId);
    params.append("metadata[payment_mode]", data.method);
    params.append("payment_intent_data[metadata][invoice_id]", invoice.id);
    params.append("payment_intent_data[metadata][recorded_by]", userId);
    params.append("payment_intent_data[metadata][payment_mode]", data.method);
    if (member?.email) params.append("customer_email", member.email);

    const session = await stripeRequest("checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    return { url: session.url as string };
  });

export const confirmStripeCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const session = await stripeRequest(`checkout/sessions/${encodeURIComponent(data.sessionId)}`, {
      method: "GET",
    });

    if (session.payment_status !== "paid") {
      return { paid: false, status: session.payment_status as string };
    }

    const invoiceId = session.metadata?.invoice_id as string | undefined;
    const mode = (session.metadata?.payment_mode as string | undefined) ?? "stripe";
    const amount = Number(session.amount_total ?? 0);
    const paymentIntent = session.payment_intent as string | undefined;

    if (!invoiceId) throw new Error("Stripe session is missing invoice metadata");
    if (!paymentIntent) throw new Error("Stripe session is missing payment intent");

    const reference = `stripe:${paymentIntent}`;
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("reference", reference)
      .maybeSingle();

    if (!existing) {
      const { error: paymentError } = await supabase.from("payments").insert({
        invoice_id: invoiceId,
        amount_cents: amount,
        method: mode,
        reference,
        recorded_by: userId,
      });
      if (paymentError) throw new Error(paymentError.message);
    }

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (invoiceError) throw new Error(invoiceError.message);

    return { paid: true, invoiceId };
  });

  export const revertStripePayment = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d: { paymentId: string }) => z.object({ paymentId: z.string().min(1) }).parse(d))
    .handler(async ({ context, data }) => {
      const { supabase, userId } = context;

      // Check admin role
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin");
      if (!roleRows || roleRows.length === 0) {
        throw new Error("Insufficient permissions: admin required to revert payments");
      }

      const { data: payment, error: pErr } = await supabase
        .from("payments")
        .select("id, invoice_id, amount_cents, method, reference")
        .eq("id", data.paymentId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!payment) throw new Error("Payment not found");

      const ref: string = payment.reference ?? "";

      // If Stripe payment, attempt automatic refund and record it
      if (ref.startsWith("stripe:")) {
        const paymentIntent = ref.split(":")[1];
        if (!paymentIntent) throw new Error("Stripe payment intent missing from reference");

        const params = new URLSearchParams();
        params.append("payment_intent", paymentIntent);

        const refund = await stripeRequest("refunds", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });

        const { error: insertErr } = await supabase.from("payments").insert({
          invoice_id: payment.invoice_id,
          amount_cents: -(payment.amount_cents ?? 0),
          method: "refund",
          reference: `stripe_refund:${refund.id}`,
          recorded_by: userId,
        });
        if (insertErr) throw new Error(insertErr.message);

        const { error: invErr } = await supabase
          .from("invoices")
          .update({ status: "pending", paid_at: null })
          .eq("id", payment.invoice_id);
        if (invErr) throw new Error(invErr.message);

        return { refunded: true, refundId: refund.id };
      }

      // Non-Stripe: insert a negative payment record and mark invoice pending
      const { error: insertErr } = await supabase.from("payments").insert({
        invoice_id: payment.invoice_id,
        amount_cents: -(payment.amount_cents ?? 0),
        method: `revert:${payment.method}`,
        reference: `revert:${payment.id}`,
        recorded_by: userId,
      });
      if (insertErr) throw new Error(insertErr.message);

      const { error: invErr2 } = await supabase
        .from("invoices")
        .update({ status: "pending", paid_at: null })
        .eq("id", payment.invoice_id);
      if (invErr2) throw new Error(invErr2.message);

      return { refunded: false, revertedPaymentId: payment.id };
    });
