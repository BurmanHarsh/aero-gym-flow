import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function send(
  from: string,
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; content: string }[]
) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      ...(attachments ? { attachments } : {})
    }),
  });
  
  if (!res.ok) {
    const status = res.status;
    const text = await res.text();
    
    // Check if this is a Resend sandbox restriction error
    if (status === 403 && text.includes("only send testing emails")) {
      const match = text.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        const fallbackEmail = match[1];
        console.log(`[Resend Sandbox] Redirecting email from ${to} to verified test email ${fallbackEmail}`);
        
        // Re-try sending to the verified fallback email with modified subject
        const retryRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            from,
            to: [fallbackEmail],
            subject: `[Test Sandbox for ${to}] ${subject}`,
            html: `
              <div style="background:#4b5563;color:white;padding:12px;margin-bottom:16px;border-radius:8px;font-size:13px;font-family:sans-serif">
                <strong>Resend Sandbox Redirection:</strong> This email was originally addressed to <strong>${to}</strong>, but was redirected to you because your Resend domain is not yet verified.
              </div>
            ` + html,
            ...(attachments ? { attachments } : {})
          }),
        });
        
        if (retryRes.ok) {
          console.log(`[Resend Sandbox] Redirected successfully to ${fallbackEmail}`);
          return retryRes.json();
        } else {
          const retryText = await retryRes.text();
          console.error(`[Resend Sandbox] Redirection failed with status ${retryRes.status}: ${retryText}`);
        }
      }
    }
    
    throw new Error(`Resend ${status}: ${text}`);
  }
  
  return res.json();
}

const shell = (title: string, body: string) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1020;padding:32px;color:#e6e9f2">
  <div style="max-width:520px;margin:auto;background:#111733;border:1px solid #1f2747;border-radius:16px;padding:32px">
    <div style="font-weight:700;font-size:18px;background:linear-gradient(135deg,#14b8a6,#a855f7);-webkit-background-clip:text;color:transparent">Tank by Tapan</div>
    <h1 style="font-size:22px;margin:16px 0 8px">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#c9cfe0">${body}</div>
    <div style="margin-top:24px;font-size:11px;color:#7b8299">Sent by your gym via Tank by Tapan</div>
  </div>
</div>`;

export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; name: string; plan?: string; startsAt?: string; expiresAt?: string }) =>
    z.object({ to: z.string().email(), name: z.string().min(1), plan: z.string().optional(), startsAt: z.string().optional(), expiresAt: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const from = "Tank by Tapan <welcome@tankbytapan.in>";
    const body = `
      <p>Hi ${data.name}, welcome to the gym! Your membership is now active.</p>
      ${data.plan ? `<p><strong>Plan:</strong> ${data.plan}</p>` : ""}
      ${data.startsAt ? `<p><strong>Membership Start Date:</strong> ${data.startsAt}</p>` : ""}
      ${data.expiresAt ? `<p><strong>Valid Until:</strong> ${data.expiresAt}</p>` : ""}
      <p>See you on the floor 💪</p>`;
    return send(from, data.to, "Welcome to the gym 🎉", shell(`Welcome, ${data.name}!`, body));
  });

// Helper function to generate PDF receipt and return it as base64 string
async function generatePdfInvoiceBase64(data: {
  name: string;
  email: string;
  invoiceNumber: string;
  amount: string;
  method: string;
}): Promise<string> {
  // @ts-ignore
  const PDFDocument = ((await import("pdfkit/js/pdfkit.standalone.js")) as any).default || (await import("pdfkit/js/pdfkit.standalone.js"));
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: any[] = [];
      
      doc.on("data", (chunk: any) => chunks.push(chunk));
      doc.on("end", () => {
        const result = Buffer.concat(chunks);
        resolve(result.toString("base64"));
      });
      doc.on("error", (err: any) => reject(err));

      // 1. Header Banner Background (Deep Navy)
      doc.rect(0, 0, 595.28, 130).fill("#0b1020");

      // 2. Decorative Teal Line
      doc.rect(0, 130, 595.28, 4).fill("#14b8a6");

      // 3. Gym Name & Slogan (Left Header)
      doc.fillColor("#14b8a6")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text("Tank by Tapan", 50, 40);

      doc.fillColor("#a855f7")
        .font("Helvetica-Bold")
        .fontSize(9)
        .text("THE ULTIMATE FITNESS DESTINATION", 50, 70);

      // 4. Document Title (Right Header)
      doc.fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(18)
        .text("PAYMENT RECEIPT", 300, 40, { align: "right", width: 245 });

      doc.fillColor("#9ca3af")
        .font("Helvetica")
        .fontSize(9)
        .text("Official Invoice Statement", 300, 65, { align: "right", width: 245 });

      // Reset text fill color for content below header
      doc.fillColor("#1f2937");

      // 5. Metadata columns: Invoice Info vs Member Info
      // Left side: Invoice details
      doc.font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#4b5563")
        .text("INVOICE DETAILS", 50, 160);

      doc.font("Helvetica")
        .fontSize(10)
        .fillColor("#1f2937")
        .text(`Invoice Number: `, 50, 180, { continued: true })
        .font("Helvetica-Bold")
        .text(data.invoiceNumber)
        .font("Helvetica")
        .text(`\nDate of Issue: ${new Date().toLocaleDateString("en-IN")}`)
        .text(`\nStatus: `)
        .font("Helvetica-Bold")
        .fillColor("#10b981") // Green for paid
        .text("PAID", { continued: false });

      // Right side: Member details
      doc.font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#4b5563")
        .text("BILLED TO", 320, 160);

      doc.font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111827")
        .text(data.name, 320, 180);

      doc.font("Helvetica")
        .fontSize(10)
        .fillColor("#4b5563")
        .text(data.email, 320, 195);

      // 6. Styled Table for line items
      // Table Header Background
      doc.rect(50, 250, 495, 26).fill("#f3f4f6");

      // Table Header Text
      doc.fillColor("#374151")
        .font("Helvetica-Bold")
        .fontSize(9)
        .text("DESCRIPTION", 65, 259)
        .text("PAYMENT METHOD", 260, 259, { width: 140, align: "right" })
        .text("AMOUNT PAID", 410, 259, { width: 120, align: "right" });

      // Row content
      doc.fillColor("#1f2937")
        .font("Helvetica")
        .fontSize(10)
        .text("Gym Membership & Training Services", 65, 290)
        .text(data.method.toUpperCase(), 260, 290, { width: 140, align: "right" })
        .text(data.amount, 410, 290, { width: 120, align: "right" });

      // Separator Line
      doc.moveTo(50, 315)
        .lineTo(545, 315)
        .strokeColor("#e5e7eb")
        .lineWidth(1)
        .stroke();

      // 7. Payment Summary (Right aligned)
      const summaryY = 330;
      doc.font("Helvetica")
        .fontSize(10)
        .fillColor("#4b5563")
        .text("Subtotal", 300, summaryY, { width: 100, align: "right" });
      doc.font("Helvetica")
        .fontSize(10)
        .fillColor("#1f2937")
        .text(data.amount, 410, summaryY, { width: 120, align: "right" });

      doc.font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111827")
        .text("Total Paid", 300, summaryY + 20, { width: 100, align: "right" });
      doc.font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#14b8a6")
        .text(data.amount, 410, summaryY + 20, { width: 120, align: "right" });

      // 8. Visual Footer
      // A nice light gray box for footer note
      const footerBoxY = 440;
      doc.rect(50, footerBoxY, 495, 75).fill("#f9fafb");
      
      // Border around the box
      doc.rect(50, footerBoxY, 495, 75)
        .strokeColor("#f3f4f6")
        .lineWidth(1)
        .stroke();

      doc.fillColor("#4b5563")
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text(
          "Thank you for being a valued member of Tank by Tapan! Your commitment is our inspiration. For queries or support, please visit the front desk or contact support@tankbytapan.in.",
          65,
          footerBoxY + 15,
          { width: 465, align: "center", lineGap: 4 }
        );

      doc.fillColor("#9ca3af")
        .font("Helvetica")
        .fontSize(8)
        .text(
          "This is a computer-generated invoice statement and does not require a physical signature.",
          50,
          footerBoxY + 100,
          { width: 495, align: "center" }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export const sendReceiptEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; name: string; invoiceNumber: string; amount: string; method: string }) =>
    z.object({ to: z.string().email(), name: z.string().min(1), invoiceNumber: z.string(), amount: z.string(), method: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const from = "Tank by Tapan Billing <billing@tankbytapan.in>";
    const body = `
      <p>Hi ${data.name}, we've received your payment. Thank you!</p>
      <p>Please find your PDF invoice attached to this email.</p>
      <table style="width:100%;margin-top:12px;font-size:13px">
        <tr><td style="color:#7b8299">Invoice</td><td style="text-align:right;font-family:monospace">${data.invoiceNumber}</td></tr>
        <tr><td style="color:#7b8299">Amount</td><td style="text-align:right;font-weight:600">${data.amount}</td></tr>
        <tr><td style="color:#7b8299">Method</td><td style="text-align:right;text-transform:capitalize">${data.method}</td></tr>
      </table>`;

    let pdfBase64 = "";
    try {
      pdfBase64 = await generatePdfInvoiceBase64({
        name: data.name,
        email: data.to,
        invoiceNumber: data.invoiceNumber,
        amount: data.amount,
        method: data.method,
      });
    } catch (err) {
      console.error("Failed to generate PDF invoice:", err);
    }

    const attachments = pdfBase64
      ? [{ filename: `invoice_${data.invoiceNumber}.pdf`, content: pdfBase64 }]
      : undefined;

    return send(
      from,
      data.to,
      `Receipt · ${data.invoiceNumber}`,
      shell("Payment received", body),
      attachments
    );
  });

export async function sendRefundEmailDirect(to: string, name: string, invoiceNumber: string, amount: string) {
  const from = "Tank by Tapan Billing <billing@tankbytapan.in>";
  const body = `
    <p>Hi ${name}, your payment for invoice <strong>${invoiceNumber}</strong> has been successfully refunded/reverted.</p>
    <table style="width:100%;margin-top:12px;font-size:13px">
      <tr><td style="color:#7b8299">Invoice</td><td style="text-align:right;font-family:monospace">${invoiceNumber}</td></tr>
      <tr><td style="color:#7b8299">Refunded Amount</td><td style="text-align:right;font-weight:600">${amount}</td></tr>
    </table>
    <p>If you have any questions, please contact the front desk.</p>`;
  return send(from, to, `Refund Successful · ${invoiceNumber}`, shell("Refund Successful", body));
}

export const sendInventorySaleEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    to: string;
    name: string;
    items: { name: string; quantity: number; price: string }[];
    totalAmount: string;
    paymentMethod: string;
    couponCode?: string | null;
    discountAmount?: string | null;
  }) =>
    z.object({
      to: z.string().email(),
      name: z.string().min(1),
      items: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        price: z.string(),
      })),
      totalAmount: z.string(),
      paymentMethod: z.string(),
      couponCode: z.string().nullable().optional(),
      discountAmount: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const from = "Tank by Tapan Billing <billing@tankbytapan.in>";
    
    let itemsHtml = "";
    data.items.forEach(item => {
      itemsHtml += `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #1f2747; color:#c9cfe0">${item.name} (x${item.quantity})</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #1f2747; text-align:right; font-weight:600">${item.price}</td>
        </tr>
      `;
    });

    const couponHtml = data.couponCode
      ? `
        <tr>
          <td style="padding: 8px 0; color:#7b8299">Coupon Code</td>
          <td style="padding: 8px 0; text-align:right; font-family:monospace; color:#14b8a6">${data.couponCode}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color:#7b8299">Coupon Discount</td>
          <td style="padding: 8px 0; text-align:right; font-weight:600; color:#10b981">- ${data.discountAmount}</td>
        </tr>
      `
      : "";

    const body = `
      <p>Hi ${data.name}, thank you for your purchase! We've received your payment.</p>
      <p>Here are your purchase details:</p>
      <table style="width:100%; margin-top:16px; border-collapse: collapse; font-size:13px">
        <thead>
          <tr style="border-bottom: 2px solid #1f2747">
            <th style="text-align:left; padding-bottom: 8px; color:#7b8299">Product</th>
            <th style="text-align:right; padding-bottom: 8px; color:#7b8299">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          ${couponHtml}
          <tr>
            <td style="padding: 12px 0 8px; font-weight:600; color:#e6e9f2">Total Paid</td>
            <td style="padding: 12px 0 8px; text-align:right; font-size:16px; font-weight:700; color:#14b8a6">${data.totalAmount}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color:#7b8299">Payment Method</td>
            <td style="padding: 4px 0; text-align:right; text-transform:capitalize">${data.paymentMethod}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top:20px;">If you have any questions, please contact the front desk.</p>
    `;

    return send(
      from,
      data.to,
      `Purchase Receipt · ${new Date().toLocaleDateString("en-IN")}`,
      shell("Receipt for your purchase", body)
    );
  });

export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; email: string; phone?: string; message: string; token: string }) =>
    z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email address"),
      phone: z.string().optional(),
      message: z.string().min(10, "Message must be at least 10 characters"),
      token: z.string().min(1, "Captcha token is required"),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    // Verify Turnstile Token
    const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
    if (isDev && data.token === "localhost_bypass") {
      console.log("Localhost bypass of Captcha verification");
    } else {
      const secretKey = process.env.TURNSTILE_SECRET_KEY;
      if (!secretKey) {
        console.error("TURNSTILE_SECRET_KEY is not configured in .env");
        throw new Error("Server configuration error: missing Turnstile key.");
      }

      try {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: secretKey,
            response: data.token,
          }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
          throw new Error("Captcha verification failed. Please try again.");
        }
      } catch (err: any) {
        throw new Error(err.message || "Failed to verify Captcha security check.");
      }
    }

    const from = "Tank Contact Form <contact@tankbytapan.in>";
    const to = "tankyado@gmail.com"; // Admin's email
    const body = `
      <p>You have received a new contact inquiry from the gym website.</p>
      <div style="background:#1f2747; padding:16px; border-radius:8px; margin:16px 0; border:1px solid #2e3860;">
        <p style="margin: 4px 0; color:#e6e9f2;"><strong>Name:</strong> ${data.name}</p>
        <p style="margin: 4px 0; color:#e6e9f2;"><strong>Email:</strong> ${data.email}</p>
        ${data.phone ? `<p style="margin: 4px 0; color:#e6e9f2;"><strong>Phone:</strong> ${data.phone}</p>` : ""}
        <p style="margin: 12px 0 4px; color:#a855f7; font-weight:bold;">Message:</p>
        <p style="margin: 0; white-space: pre-wrap; font-style: italic; color:#c9cfe0;">"${data.message}"</p>
      </div>
    `;
    return send(from, to, `New Contact Query from ${data.name}`, shell("Contact Form Submission", body));
  });

export const sendMemberEditEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    to: string;
    name: string;
    changes: { field: string; oldValue: string; newValue: string }[];
  }) =>
    z.object({
      to: z.string().email(),
      name: z.string().min(1),
      changes: z.array(z.object({
        field: z.string(),
        oldValue: z.string(),
        newValue: z.string(),
      })),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const from = "Tank by Tapan <support@tankbytapan.in>";
    
    let changesHtml = "";
    data.changes.forEach(change => {
      changesHtml += `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #1f2747; color:#7b8299"><strong>${change.field}</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #1f2747; color:#e6e9f2; text-decoration: line-through; font-size: 12px; padding-right: 8px;">${change.oldValue || "—"}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #1f2747; color:#10b981; font-weight: 600;">${change.newValue || "—"}</td>
        </tr>
      `;
    });

    const body = `
      <p>Hi ${data.name},</p>
      <p>This is to notify you that your member profile has been updated by the gym management. Here is a summary of the changes made:</p>
      <table style="width:100%; margin-top:16px; border-collapse: collapse; font-size:13px">
        <thead>
          <tr style="border-bottom: 2px solid #1f2747">
            <th style="text-align:left; padding-bottom: 8px; color:#7b8299">Field</th>
            <th style="text-align:left; padding-bottom: 8px; color:#7b8299">Previous Value</th>
            <th style="text-align:left; padding-bottom: 8px; color:#7b8299">New Value</th>
          </tr>
        </thead>
        <tbody>
          ${changesHtml}
        </tbody>
      </table>
      <p style="margin-top:20px;">If you did not authorize these changes, or if they appear incorrect, please contact the front desk immediately.</p>
    `;

    return send(
      from,
      data.to,
      `Profile Updated · Tank by Tapan`,
      shell("Profile Updated", body)
    );
  });

export const sendMemberSupportEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    subject: string;
    message: string;
  }) =>
    z.object({
      subject: z.string().min(1, "Subject is required"),
      message: z.string().min(10, "Message must be at least 10 characters"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to retrieve profile: ${error.message}`);
    }

    const userName = profile?.full_name || "Gym Member";
    const userEmail = profile?.email || "Unknown Email";

    const from = "Tank by Tapan <support@tankbytapan.in>";
    const to = "tankyado@gmail.com"; // Admin's email

    const body = `
      <p>You have received a new support/contact request from a registered gym member.</p>
      <div style="background:#1f2747; padding:16px; border-radius:8px; margin:16px 0; border:1px solid #2e3860;">
        <p style="margin: 4px 0; color:#e6e9f2;"><strong>Member Name:</strong> ${userName}</p>
        <p style="margin: 4px 0; color:#e6e9f2;"><strong>Member Email:</strong> ${userEmail}</p>
        <p style="margin: 4px 0; color:#e6e9f2;"><strong>Subject:</strong> ${data.subject}</p>
        <p style="margin: 12px 0 4px; color:#a855f7; font-weight:bold;">Message:</p>
        <p style="margin: 0; white-space: pre-wrap; font-style: italic; color:#c9cfe0;">"${data.message}"</p>
      </div>
    `;

    return send(
      from,
      to,
      `Member Support: ${data.subject}`,
      shell(`Support Request: ${data.subject}`, body)
    );
  });
