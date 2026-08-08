import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CategoryProfitSummary {
  category: string;
  totalSalesCents: number;
  totalCostCents: number;
  totalProfitCents: number;
  itemsCount: number;
  marginPercent: number;
}

export interface SupplementItemProfit {
  itemId: string;
  name: string;
  unitsSold: number;
  salePriceCents: number;
  purchasePriceCents: number;
  totalRevenueCents: number;
  totalCostCents: number;
  netProfitCents: number;
  marginPercent: number;
  monthKey: string; // e.g. "2026-06"
  soldAt: string;
}

export interface MemberPaymentRecord {
  id: string;
  memberCode: string;
  memberName: string;
  planName: string;
  invoiceNumber: string;
  paidAt: string;
  amountCents: number;
  discountCents: number;
  monthKey: string;
}

export interface MonthlyProfitData {
  monthKey: string; // e.g. "2026-07"
  monthLabel: string; // e.g. "July 2026"
  memberRevenueCents: number;
  inventorySalesCents: number;
  inventoryCostCents: number;
  inventoryProfitCents: number;
  supplementsProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
  supplements: SupplementItemProfit[];
  members: MemberPaymentRecord[];
}

export interface ProfitAnalyticsData {
  // Till Date Totals
  memberRevenueTillDateCents: number;
  inventorySalesTillDateCents: number;
  inventoryCostTillDateCents: number;
  inventoryProfitTillDateCents: number;
  supplementsProfitTillDateCents: number;
  expensesTillDateCents: number;
  finalNetProfitTillDateCents: number;
  overallMarginPercent: number;

  // Breakdowns
  categoryProfits: CategoryProfitSummary[];
  supplementItems: SupplementItemProfit[];
  supplementRecords: SupplementItemProfit[];
  memberPayments: MemberPaymentRecord[];
  monthlyBreakdown: MonthlyProfitData[];
}

export const getProfitAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfitAnalyticsData> => {
    const supabase = context.supabase as any;

    // Fetch parallel datasets from authoritative tables
    const [
      { data: sales, error: salesErr },
      { data: saleItems, error: saleItemsErr },
      { data: inventoryItems, error: invErr },
      { data: payments, error: paymentsErr },
      { data: expenses, error: expensesErr },
    ] = await Promise.all([
      supabase.from("pos_sales").select("id, sold_at, grand_total_cents, discount_cents"),
      supabase.from("pos_sale_items").select("id, sale_id, item_id, item_name, quantity, purchase_price_cents, selling_price_cents"),
      supabase.from("inventory_items").select("id, name, category, purchase_price_cents, sale_price_cents"),
      supabase.from("payments").select(`
        id, amount_cents, paid_at, invoice_id,
        invoices:invoice_id (
          invoice_number, total_cents, coupon_discount_cents,
          member:members (full_name, member_code),
          plan:membership_plans (name)
        )
      `),
      supabase.from("expenses").select("id, amount_cents, date, category"),
    ]);

    if (salesErr) throw new Error(`Failed to load sales: ${salesErr.message}`);
    if (saleItemsErr) throw new Error(`Failed to load sale items: ${saleItemsErr.message}`);
    if (invErr) throw new Error(`Failed to load inventory catalog: ${invErr.message}`);
    if (paymentsErr) throw new Error(`Failed to load member payments: ${paymentsErr.message}`);
    if (expensesErr) throw new Error(`Failed to load expenses: ${expensesErr.message}`);

    // Map sale id -> sale details (sold_at)
    const salesMap = new Map<string, { sold_at: string; grand_total_cents: number }>();
    (sales ?? []).forEach((s: any) => {
      salesMap.set(s.id, {
        sold_at: s.sold_at,
        grand_total_cents: s.grand_total_cents || 0,
      });
    });

    // Map item id -> inventory catalog details (category, prices)
    const itemMap = new Map<string, { name: string; category: string; purchase_price_cents: number; sale_price_cents: number }>();
    (inventoryItems ?? []).forEach((item: any) => {
      itemMap.set(item.id, {
        name: item.name,
        category: item.category || "Uncategorized",
        purchase_price_cents: item.purchase_price_cents || 0,
        sale_price_cents: item.sale_price_cents || 0,
      });
    });

    // 1. Calculate Inventory Profits & Category Breakdown
    let inventorySalesTillDateCents = 0;
    let inventoryCostTillDateCents = 0;
    let inventoryProfitTillDateCents = 0;
    let supplementsProfitTillDateCents = 0;

    const categoryMap = new Map<string, { sales: number; cost: number; profit: number; count: number }>();
    const supplementMap = new Map<string, { name: string; units: number; revenue: number; cost: number; purchasePrice: number; salePrice: number }>();
    const monthMap = new Map<string, MonthlyProfitData>();
    const supplementRecords: SupplementItemProfit[] = [];

    // Helper to get month key "YYYY-MM"
    const getMonthKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      const year = d.getFullYear() || 2026;
      const month = String(d.getMonth() + 1).padStart(2, "0");
      return `${year}-${month}`;
    };

    // Helper to get or create month bucket
    const getMonthBucket = (dateStr: string): MonthlyProfitData => {
      const monthKey = getMonthKey(dateStr);
      const d = new Date(dateStr);
      const monthLabel = d.toLocaleString("default", { month: "long", year: "numeric" });

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          memberRevenueCents: 0,
          inventorySalesCents: 0,
          inventoryCostCents: 0,
          inventoryProfitCents: 0,
          supplementsProfitCents: 0,
          expensesCents: 0,
          netProfitCents: 0,
          supplements: [],
          members: [],
        });
      }
      return monthMap.get(monthKey)!;
    };

    // Process each pos_sale_items entry
    (saleItems ?? []).forEach((sItem: any) => {
      const sale = sItem.sale_id ? salesMap.get(sItem.sale_id) : null;
      const itemCatalog = sItem.item_id ? itemMap.get(sItem.item_id) : null;

      const category = itemCatalog?.category || "Other";
      const purchasePrice = sItem.purchase_price_cents ?? (itemCatalog?.purchase_price_cents ?? 0);
      const sellingPrice = sItem.selling_price_cents ?? (itemCatalog?.sale_price_cents ?? 0);
      const quantity = sItem.quantity || 1;

      const itemRevenue = quantity * sellingPrice;
      const itemCost = quantity * purchasePrice;
      const itemProfit = itemRevenue - itemCost;

      inventorySalesTillDateCents += itemRevenue;
      inventoryCostTillDateCents += itemCost;
      inventoryProfitTillDateCents += itemProfit;

      const soldAt = sale?.sold_at || new Date().toISOString();
      const monthKey = getMonthKey(soldAt);
      const monthBucket = getMonthBucket(soldAt);

      const suppItemRecord: SupplementItemProfit = {
        itemId: sItem.id,
        name: sItem.item_name || itemCatalog?.name || "Supplement",
        unitsSold: quantity,
        salePriceCents: sellingPrice,
        purchasePriceCents: purchasePrice,
        totalRevenueCents: itemRevenue,
        totalCostCents: itemCost,
        netProfitCents: itemProfit,
        marginPercent: itemRevenue > 0 ? Math.round((itemProfit / itemRevenue) * 1000) / 10 : 0,
        monthKey,
        soldAt,
      };

      // Supplement specific tracking
      if (category.toLowerCase() === "supplements") {
        supplementsProfitTillDateCents += itemProfit;

        // Grouped by product
        const keyId = sItem.item_id || sItem.item_name || "supplement_item";
        const sEntry = supplementMap.get(keyId) || {
          name: sItem.item_name || itemCatalog?.name || "Supplement",
          units: 0,
          revenue: 0,
          cost: 0,
          purchasePrice,
          salePrice: sellingPrice,
        };
        sEntry.units += quantity;
        sEntry.revenue += itemRevenue;
        sEntry.cost += itemCost;
        supplementMap.set(keyId, sEntry);

        // Record for month & global list
        supplementRecords.push(suppItemRecord);
        monthBucket.supplements.push(suppItemRecord);
      }

      // Category map update
      const cEntry = categoryMap.get(category) || { sales: 0, cost: 0, profit: 0, count: 0 };
      cEntry.sales += itemRevenue;
      cEntry.cost += itemCost;
      cEntry.profit += itemProfit;
      cEntry.count += quantity;
      categoryMap.set(category, cEntry);

      // Monthly bucket update
      if (sale?.sold_at) {
        monthBucket.inventorySalesCents += itemRevenue;
        monthBucket.inventoryCostCents += itemCost;
        monthBucket.inventoryProfitCents += itemProfit;
        if (category.toLowerCase() === "supplements") {
          monthBucket.supplementsProfitCents += itemProfit;
        }
      }
    });

    // 2. Member Registered Revenue (from payments)
    let memberRevenueTillDateCents = 0;
    const memberPayments: MemberPaymentRecord[] = [];

    (payments ?? []).forEach((payment: any) => {
      const amount = payment.amount_cents || 0;
      memberRevenueTillDateCents += amount;

      const paidAt = payment.paid_at || new Date().toISOString();
      const monthKey = getMonthKey(paidAt);
      const monthBucket = getMonthBucket(paidAt);

      monthBucket.memberRevenueCents += amount;

      const inv = payment.invoices;
      const mem = inv?.member;
      const plan = inv?.plan;

      const memRecord: MemberPaymentRecord = {
        id: payment.id,
        memberCode: mem?.member_code || "AG-MEMBER",
        memberName: mem?.full_name || "Gym Member",
        planName: plan?.name || "Membership Subscription",
        invoiceNumber: inv?.invoice_number || "INV-GENERIC",
        paidAt,
        amountCents: amount,
        discountCents: inv?.coupon_discount_cents || 0,
        monthKey,
      };

      memberPayments.push(memRecord);
      monthBucket.members.push(memRecord);
    });

    // 3. Operating Expenses
    let expensesTillDateCents = 0;
    (expenses ?? []).forEach((exp: any) => {
      const amount = exp.amount_cents || 0;
      expensesTillDateCents += amount;

      if (exp.date) {
        const bucket = getMonthBucket(exp.date);
        bucket.expensesCents += amount;
      }
    });

    // Compute Net Profit for all month buckets
    const monthlyBreakdown = Array.from(monthMap.values()).map((b) => {
      b.netProfitCents = (b.memberRevenueCents + b.inventoryProfitCents) - b.expensesCents;
      return b;
    });

    // Sort monthly breakdown reverse chronologically (newest month first: July 2026, June 2026...)
    monthlyBreakdown.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    // Category Profit Summary Array
    const categoryProfits: CategoryProfitSummary[] = Array.from(categoryMap.entries()).map(([cat, val]) => {
      const marginPercent = val.sales > 0 ? (val.profit / val.sales) * 100 : 0;
      return {
        category: cat,
        totalSalesCents: val.sales,
        totalCostCents: val.cost,
        totalProfitCents: val.profit,
        itemsCount: val.count,
        marginPercent: Math.round(marginPercent * 10) / 10,
      };
    });

    categoryProfits.sort((a, b) => b.totalProfitCents - a.totalProfitCents);

    // Supplement Items Detail Array (aggregated per product)
    const supplementItems: SupplementItemProfit[] = Array.from(supplementMap.entries()).map(([id, val]) => {
      const netProfitCents = val.revenue - val.cost;
      const marginPercent = val.revenue > 0 ? (netProfitCents / val.revenue) * 100 : 0;
      return {
        itemId: id,
        name: val.name,
        unitsSold: val.units,
        salePriceCents: val.salePrice,
        purchasePriceCents: val.purchasePrice,
        totalRevenueCents: val.revenue,
        totalCostCents: val.cost,
        netProfitCents,
        marginPercent: Math.round(marginPercent * 10) / 10,
        monthKey: "ALL",
        soldAt: "",
      };
    });

    supplementItems.sort((a, b) => b.netProfitCents - a.netProfitCents);
    supplementRecords.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
    memberPayments.sort((a, b) => b.paidAt.localeCompare(a.paidAt));

    // 4. Overall Totals
    const finalNetProfitTillDateCents = (memberRevenueTillDateCents + inventoryProfitTillDateCents) - expensesTillDateCents;
    const totalGrossRevenue = memberRevenueTillDateCents + inventorySalesTillDateCents;
    const overallMarginPercent = totalGrossRevenue > 0 ? (finalNetProfitTillDateCents / totalGrossRevenue) * 100 : 0;

    return {
      memberRevenueTillDateCents,
      inventorySalesTillDateCents,
      inventoryCostTillDateCents,
      inventoryProfitTillDateCents,
      supplementsProfitTillDateCents,
      expensesTillDateCents,
      finalNetProfitTillDateCents,
      overallMarginPercent: Math.round(overallMarginPercent * 10) / 10,
      categoryProfits,
      supplementItems,
      supplementRecords,
      memberPayments,
      monthlyBreakdown,
    };
  });

// PDF Generation Server Function for Month Reports (Cleaned UI, Fonts & Header Layout)
export const generateMonthReportPDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { monthKey: string; reportType: "members" | "supplements"; monthLabel: string }) =>
    z.object({
      monthKey: z.string().min(1),
      reportType: z.enum(["members", "supplements"]),
      monthLabel: z.string().min(1),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;

    // Retrieve active user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const isMemberReport = data.reportType === "members";
    const reportTitle = isMemberReport
      ? `MEMBER REGISTERED PAYMENTS REPORT`
      : `SUPPLEMENTS SALES PROFIT REPORT`;

    // Ample column widths guaranteed to fit headers without wrapping (Printable Width = 525.28pt)
    const colWidths = isMemberReport
      ? [110, 75, 135, 95, 50, 60] // "Member Code" gets 75pt -> 100% single line
      : [165, 65, 65, 40, 90, 100];

    const colAlignments: Array<"left" | "center" | "right"> = isMemberReport
      ? ["left", "left", "left", "left", "center", "right"]
      : ["left", "right", "right", "center", "right", "right"];

    const headers = isMemberReport
      ? ["Member Name", "Member Code", "Plan Package", "Invoice No", "Paid Date", "Amount (Rs)"]
      : ["Product Name", "Purchase COGS", "Sale Price", "Units", "Revenue (Rs)", "Net Profit (Rs)"];

    let rows: string[][] = [];
    let totalCentsA = 0;
    let totalCentsB = 0;

    if (isMemberReport) {
      const { data: payments } = await supabase.from("payments").select(`
        id, amount_cents, paid_at,
        invoices:invoice_id (
          invoice_number, coupon_discount_cents,
          member:members (full_name, member_code),
          plan:membership_plans (name)
        )
      `);

      (payments ?? []).forEach((p: any) => {
        const d = new Date(p.paid_at);
        const y = d.getFullYear() || 2026;
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const key = `${y}-${m}`;

        if (key === data.monthKey) {
          const inv = p.invoices;
          const mem = inv?.member;
          const plan = inv?.plan;
          const amt = p.amount_cents || 0;
          totalCentsA += amt;

          rows.push([
            mem?.full_name || "Gym Member",
            mem?.member_code || "AG-MEMBER",
            plan?.name || "Membership",
            inv?.invoice_number || "INV-GENERIC",
            new Date(p.paid_at).toLocaleDateString("en-IN"),
            `Rs ${(amt / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          ]);
        }
      });
    } else {
      const [{ data: sales }, { data: saleItems }, { data: inventoryItems }] = await Promise.all([
        supabase.from("pos_sales").select("id, sold_at"),
        supabase.from("pos_sale_items").select("id, sale_id, item_id, item_name, quantity, purchase_price_cents, selling_price_cents"),
        supabase.from("inventory_items").select("id, name, category, purchase_price_cents, sale_price_cents"),
      ]);

      const salesMap = new Map<string, string>();
      (sales ?? []).forEach((s: any) => salesMap.set(s.id, s.sold_at));

      const itemMap = new Map<string, any>();
      (inventoryItems ?? []).forEach((it: any) => itemMap.set(it.id, it));

      (saleItems ?? []).forEach((sItem: any) => {
        const soldAt = sItem.sale_id ? salesMap.get(sItem.sale_id) : null;
        if (!soldAt) return;

        const d = new Date(soldAt);
        const y = d.getFullYear() || 2026;
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const key = `${y}-${m}`;

        if (key === data.monthKey) {
          const itemCat = sItem.item_id ? itemMap.get(sItem.item_id) : null;
          const category = itemCat?.category || "Other";

          if (category.toLowerCase() === "supplements") {
            const purchasePrice = sItem.purchase_price_cents ?? (itemCat?.purchase_price_cents ?? 0);
            const sellingPrice = sItem.selling_price_cents ?? (itemCat?.sale_price_cents ?? 0);
            const qty = sItem.quantity || 1;

            const rev = qty * sellingPrice;
            const cost = qty * purchasePrice;
            const profit = rev - cost;

            totalCentsA += rev;
            totalCentsB += profit;

            rows.push([
              sItem.item_name || itemCat?.name || "Supplement",
              `Rs ${(purchasePrice / 100).toFixed(2)}`,
              `Rs ${(sellingPrice / 100).toFixed(2)}`,
              qty.toString(),
              `Rs ${(rev / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
              `Rs ${(profit / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            ]);
          }
        }
      });
    }

    // Build PDF Document dynamically using pdfkit.standalone to prevent __dirname runtime error in ESM
    // @ts-ignore
    const PDFDocument = ((await import("pdfkit/js/pdfkit.standalone.js")) as any).default || (await import("pdfkit/js/pdfkit.standalone.js"));
    const base64 = await new Promise<string>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: "A4", margin: 35 });
        const chunks: any[] = [];

        doc.on("data", (chunk: any) => chunks.push(chunk));
        doc.on("end", () => {
          const result = Buffer.concat(chunks);
          resolve(result.toString("base64"));
        });
        doc.on("error", (err: any) => reject(err));

        const marginLeft = 35;
        const printableWidth = 525.28;

        // 1. Top Header Banner
        doc.rect(0, 0, 595.28, 90).fill("#0b1020");
        doc.rect(0, 90, 595.28, 3).fill("#0d9488");

        doc.fillColor("#0d9488").font("Helvetica-Bold").fontSize(18).text("Tank by Tapan", marginLeft, 22);
        doc.fillColor("#a855f7").font("Helvetica-Bold").fontSize(8).text("FINANCIAL ANALYTICS & EXECUTIVE REPORT", marginLeft, 46);

        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text(reportTitle, 220, 22, { align: "right", width: 340 });
        doc.fillColor("#9ca3af").font("Helvetica").fontSize(8).text(`Period: ${data.monthLabel.toUpperCase()} | Generated: ${new Date().toLocaleDateString("en-IN")}`, 220, 44, { align: "right", width: 340 });

        // 2. Metadata bar
        doc.fillColor("#334155").font("Helvetica").fontSize(8);
        doc.text(`Generated By: ${profile?.full_name ?? "Administrator"}`, marginLeft, 102);
        doc.text(`Total Records: ${rows.length}`, 400, 102, { align: "right", width: 160 });

        // Helper to draw table header & ALWAYS reset font to normal Helvetica afterwards
        const drawTableHeader = (yPos: number) => {
          doc.rect(marginLeft, yPos, printableWidth, 24).fill("#1e293b");
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);

          let curX = marginLeft;
          headers.forEach((h, i) => {
            doc.text(h, curX + 4, yPos + 7, { width: colWidths[i] - 8, align: colAlignments[i] });
            curX += colWidths[i];
          });

          // Reset font and color to regular body text immediately
          doc.fillColor("#1e293b").font("Helvetica").fontSize(8);
        };

        let y = 120;
        drawTableHeader(y);
        y += 24;

        // 3. Render Rows with DYNAMIC Row Height & STRICT FONT RESET
        rows.forEach((row, rowIndex) => {
          // Force font back to regular Helvetica for every row
          doc.font("Helvetica").fontSize(8).fillColor("#1e293b");

          // Calculate max text height in row
          let maxCellHeight = 12;
          row.forEach((cellText, colIdx) => {
            const cellH = doc.heightOfString(cellText, { width: colWidths[colIdx] - 8 });
            if (cellH > maxCellHeight) maxCellHeight = cellH;
          });

          const paddingY = 5;
          const rowHeight = maxCellHeight + paddingY * 2;

          // Check for page overflow
          if (y + rowHeight > 740) {
            doc.addPage();
            y = 35;
            drawTableHeader(y);
            y += 24;
            doc.font("Helvetica").fontSize(8).fillColor("#1e293b");
          }

          // Alternating zebra row background
          if (rowIndex % 2 === 1) {
            doc.rect(marginLeft, y, printableWidth, rowHeight).fill("#f8fafc");
          }

          // Subtle bottom border
          doc.rect(marginLeft, y + rowHeight - 1, printableWidth, 1).fill("#e2e8f0");

          doc.fillColor("#1e293b").font("Helvetica").fontSize(8);
          let curX = marginLeft;
          row.forEach((cellText, colIdx) => {
            doc.text(cellText, curX + 4, y + paddingY, {
              width: colWidths[colIdx] - 8,
              align: colAlignments[colIdx],
            });
            curX += colWidths[colIdx];
          });

          y += rowHeight;
        });

        if (rows.length === 0) {
          doc.fillColor("#64748b").font("Helvetica").fontSize(9).text("No transactions recorded for this period.", marginLeft + 10, y + 15);
          y += 40;
        }

        // 4. Clean Footer Summary Banner (No Overlap)
        y += 15;
        if (y + 35 > 780) {
          doc.addPage();
          y = 35;
        }

        doc.rect(marginLeft, y, printableWidth, 32).fill("#0f172a");
        doc.rect(marginLeft, y, 4, 32).fill("#0d9488");

        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);

        if (isMemberReport) {
          doc.text(`TOTAL MEMBER REVENUE COLLECTED (${data.monthLabel.toUpperCase()})`, marginLeft + 12, y + 10);
          doc.fillColor("#2dd4bf").font("Helvetica-Bold").fontSize(11).text(
            `Rs ${(totalCentsA / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            350,
            y + 9,
            { align: "right", width: 200 }
          );
        } else {
          doc.text(`SUPPLEMENTS SUMMARY (${data.monthLabel.toUpperCase()})`, marginLeft + 12, y + 10);
          const totalRevStr = `Revenue: Rs ${(totalCentsA / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          const totalProfStr = `Net Profit: Rs ${(totalCentsB / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          
          doc.fillColor("#2dd4bf").font("Helvetica-Bold").fontSize(10).text(
            `${totalRevStr}   |   ${totalProfStr}`,
            200,
            y + 10,
            { align: "right", width: 350 }
          );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });

    const safeLabel = data.monthLabel.replace(/\s+/g, "_");
    const filename = `${isMemberReport ? "Member_Payments" : "Supplements_Profit"}_${safeLabel}.pdf`;

    return { base64, filename };
  });
