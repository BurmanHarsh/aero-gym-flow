import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import PDFDocument from "pdfkit";

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
  .inputValidator((d: { to: string; name: string; plan?: string; expiresAt?: string }) =>
    z.object({ to: z.string().email(), name: z.string().min(1), plan: z.string().optional(), expiresAt: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const from = "Tank by Tapan <welcome@tankbytapan.in>";
    const body = `
      <p>Hi ${data.name}, welcome to the gym! Your membership is now active.</p>
      ${data.plan ? `<p><strong>Plan:</strong> ${data.plan}</p>` : ""}
      ${data.expiresAt ? `<p><strong>Valid until:</strong> ${data.expiresAt}</p>` : ""}
      <p>See you on the floor 💪</p>`;
    return send(from, data.to, "Welcome to the gym 🎉", shell(`Welcome, ${data.name}!`, body));
  });

// Helper function to generate PDF receipt and return it as base64 string
export async function generatePdfInvoiceBase64(data: {
  name: string;
  email: string;
  invoiceNumber: string;
  amount: string;
  method: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: any[] = [];
      
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const result = Buffer.concat(chunks);
        resolve(result.toString("base64"));
      });
      doc.on("error", (err) => reject(err));

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
