import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Helper to check if user has staff privileges (admin or front_desk)
async function checkStaffAccess(supabase: any, userId: string): Promise<{ isStaff: boolean; isAdmin: boolean }> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error || !roles) return { isStaff: false, isAdmin: false };
  const userRoles = roles.map((r: any) => r.role);
  const isAdmin = userRoles.includes("admin");
  const isStaff = isAdmin || userRoles.includes("front_desk");
  return { isStaff, isAdmin };
}

// 1. Fast lookup product by barcode
export const posLookupProductByBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { barcode: string }) => z.object({ barcode: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { isStaff } = await checkStaffAccess(supabase, userId);
    if (!isStaff) throw new Error("Unauthorized: Staff access required");

    const { data: item, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("barcode", data.barcode)
      .eq("active", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return item; // Returns item or null
  });

// 2. Register new product
export const posRegisterProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    barcode: string;
    name: string;
    category: string;
    description?: string;
    purchase_price_cents: number;
    sale_price_cents: number;
    gst_percentage: number;
    quantity: number;
    min_stock_level: number;
    sku?: string;
  }) => z.object({
    barcode: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    description: z.string().optional(),
    purchase_price_cents: z.number().nonnegative(),
    sale_price_cents: z.number().nonnegative(),
    gst_percentage: z.number().nonnegative(),
    quantity: z.number().nonnegative(),
    min_stock_level: z.number().nonnegative(),
    sku: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { isStaff } = await checkStaffAccess(supabase, userId);
    if (!isStaff) throw new Error("Unauthorized: Staff access required");

    // 1. Check for duplicate barcode
    const { data: existing } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("barcode", data.barcode)
      .maybeSingle();

    if (existing) {
      throw new Error("A product with this barcode already exists in the inventory");
    }

    // 2. Create product
    const { data: item, error: itemError } = await supabase
      .from("inventory_items")
      .insert({
        barcode: data.barcode,
        name: data.name,
        category: data.category,
        description: data.description || null,
        purchase_price_cents: data.purchase_price_cents,
        sale_price_cents: data.sale_price_cents,
        gst_percentage: data.gst_percentage,
        quantity: data.quantity,
        min_stock_level: data.min_stock_level,
        sku: data.sku || null,
        active: true,
      })
      .select()
      .single();

    if (itemError || !item) {
      throw new Error(itemError?.message || "Failed to create product");
    }

    // 3. Log initial inventory receipt
    await supabase.from("pos_inventory_logs").insert({
      item_id: item.id,
      change_type: "receive",
      quantity_changed: data.quantity,
      previous_stock: 0,
      new_stock: data.quantity,
      recorded_by: userId,
      notes: "Initial product registration",
    });

    return item;
  });

// 3. Restock existing product
export const posRestockProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; quantityToAdd: number }) => z.object({
    id: z.string().uuid(),
    quantityToAdd: z.number().positive(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { isStaff } = await checkStaffAccess(supabase, userId);
    if (!isStaff) throw new Error("Unauthorized: Staff access required");

    // 1. Retrieve current stock
    const { data: item, error: loadError } = await supabase
      .from("inventory_items")
      .select("quantity, name")
      .eq("id", data.id)
      .single();

    if (loadError || !item) throw new Error("Product not found");

    const previousStock = item.quantity;
    const newStock = previousStock + data.quantityToAdd;

    // 2. Update stock
    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ quantity: newStock })
      .eq("id", data.id);

    if (updateError) throw new Error("Failed to update stock");

    // 3. Log receipt
    await supabase.from("pos_inventory_logs").insert({
      item_id: data.id,
      change_type: "receive",
      quantity_changed: data.quantityToAdd,
      previous_stock: previousStock,
      new_stock: newStock,
      recorded_by: userId,
      notes: `Restocked ${data.quantityToAdd} units`,
    });

    return { name: item.name, previousStock, newStock };
  });

// 4. POS Multi-Item Transaction Checkout
export const posCheckoutCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    paymentMethod: string;
    discountCents: number;
    subtotalCents: number;
    cgstCents: number;
    sgstCents: number;
    totalGstCents: number;
    grandTotalCents: number;
    transactionId: string | null;
    items: Array<{
      itemId: string;
      quantity: number;
      purchasePriceCents: number;
      sellingPriceCents: number;
      gstPercentage: number;
    }>;
  }) => z.object({
    paymentMethod: z.string().min(1),
    discountCents: z.number().nonnegative(),
    subtotalCents: z.number().nonnegative(),
    cgstCents: z.number().nonnegative(),
    sgstCents: z.number().nonnegative(),
    totalGstCents: z.number().nonnegative(),
    grandTotalCents: z.number().nonnegative(),
    transactionId: z.string().nullable(),
    items: z.array(z.object({
      itemId: z.string().uuid(),
      quantity: z.number().positive(),
      purchasePriceCents: z.number().nonnegative(),
      sellingPriceCents: z.number().nonnegative(),
      gstPercentage: z.number().nonnegative(),
    })).min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { isStaff } = await checkStaffAccess(supabase, userId);
    if (!isStaff) throw new Error("Unauthorized: Staff access required");

    // Execute atomic checkout via PostgreSQL Stored Procedure Transaction
    const { data: result, error } = await supabase.rpc("checkout_pos_sale", {
      _sold_by: userId,
      _payment_method: data.paymentMethod,
      _discount_cents: data.discountCents,
      _subtotal_cents: data.subtotalCents,
      _cgst_cents: data.cgstCents,
      _sgst_cents: data.sgstCents,
      _total_gst_cents: data.totalGstCents,
      _grand_total_cents: data.grandTotalCents,
      _transaction_id: data.transactionId || null,
      _cart_items: data.items.map(item => ({
        item_id: item.itemId,
        quantity: item.quantity,
        purchase_price_cents: item.purchasePriceCents,
        selling_price_cents: item.sellingPriceCents,
        gst_percentage: item.gstPercentage
      }))
    });

    if (error) {
      throw new Error(`Checkout transaction failed: ${error.message}`);
    }

    return result as { success: boolean; sale_id: string; invoice_number: string };
  });

// 5. Aggregate Analytics statistics for POS
export const posGetBillingStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { isStaff, isAdmin } = await checkStaffAccess(supabase, userId);
    if (!isStaff) throw new Error("Unauthorized: Staff access required");

    const todayDate = new Date().toISOString().slice(0, 10);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const thisMonthDate = startOfMonth.toISOString().slice(0, 10);

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    prevMonth.setDate(1);
    prevMonth.setHours(0, 0, 0, 0);
    const lastMonthDate = prevMonth.toISOString().slice(0, 10);

    // Fetch Today's sales summary
    const { data: todaySales } = await supabase
      .from("pos_sales")
      .select("grand_total_cents, id")
      .gte("sold_at", todayDate + "T00:00:00Z");

    const todayRevenue = (todaySales ?? []).reduce((sum: number, s: any) => sum + s.grand_total_cents, 0);
    const todaySalesCount = (todaySales ?? []).length;

    // Fetch today's item count sold
    let todayProductsCount = 0;
    if (todaySalesCount > 0) {
      const saleIds = todaySales.map((s: any) => s.id);
      const { data: todayItems } = await supabase
        .from("pos_sale_items")
        .select("quantity")
        .in("sale_id", saleIds);
      todayProductsCount = (todayItems ?? []).reduce((sum: number, item: any) => sum + item.quantity, 0);
    }

    let adminStats = null;

    if (isAdmin) {
      // Calculate today's profit
      let todayProfit = 0;
      if (todaySalesCount > 0) {
        const saleIds = todaySales.map((s: any) => s.id);
        const { data: todayItems } = await supabase
          .from("pos_sale_items")
          .select("quantity, purchase_price_cents, selling_price_cents")
          .in("sale_id", saleIds);
        todayProfit = (todayItems ?? []).reduce((sum: number, item: any) => 
          sum + (item.selling_price_cents - item.purchase_price_cents) * item.quantity, 0);
      }

      // Calculate this month's revenue and profit
      const { data: monthSales } = await supabase
        .from("pos_sales")
        .select("grand_total_cents, id")
        .gte("sold_at", thisMonthDate);

      const thisMonthRevenue = (monthSales ?? []).reduce((sum: number, s: any) => sum + s.grand_total_cents, 0);

      let thisMonthProfit = 0;
      if ((monthSales ?? []).length > 0) {
        const monthSaleIds = monthSales.map((s: any) => s.id);
        const { data: monthItems } = await supabase
          .from("pos_sale_items")
          .select("quantity, purchase_price_cents, selling_price_cents")
          .in("sale_id", monthSaleIds);
        thisMonthProfit = (monthItems ?? []).reduce((sum: number, item: any) => 
          sum + (item.selling_price_cents - item.purchase_price_cents) * item.quantity, 0);
      }

      // Calculate previous month's profit
      const { data: prevMonthSales } = await supabase
        .from("pos_sales")
        .select("id")
        .gte("sold_at", lastMonthDate)
        .lt("sold_at", thisMonthDate);

      let prevMonthProfit = 0;
      if ((prevMonthSales ?? []).length > 0) {
        const prevSaleIds = prevMonthSales.map((s: any) => s.id);
        const { data: prevMonthItems } = await supabase
          .from("pos_sale_items")
          .select("quantity, purchase_price_cents, selling_price_cents")
          .in("sale_id", prevSaleIds);
        prevMonthProfit = (prevMonthItems ?? []).reduce((sum: number, item: any) => 
          sum + (item.selling_price_cents - item.purchase_price_cents) * item.quantity, 0);
      }

      // Calculate current inventory valuation & low stock alerts
      const { data: inventory } = await supabase
        .from("inventory_items")
        .select("quantity, purchase_price_cents, min_stock_level, active")
        .eq("active", true);

      const inventoryValue = (inventory ?? []).reduce((sum: number, item: any) => sum + (item.purchase_price_cents * item.quantity), 0);
      const lowStockCount = (inventory ?? []).filter((item: any) => item.quantity > 0 && item.quantity <= item.min_stock_level).length;
      const outOfStockCount = (inventory ?? []).filter((item: any) => item.quantity === 0).length;

      // Group profits by month (last 6 months) for comparative charts
      const monthlyProfitData = [];
      for (let i = 5; i >= 0; i--) {
        const start = new Date();
        start.setMonth(start.getMonth() - i);
        start.setDate(1);
        start.setHours(0,0,0,0);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

        const { data: salesForMonth } = await supabase
          .from("pos_sales")
          .select("id")
          .gte("sold_at", start.toISOString())
          .lt("sold_at", end.toISOString());

        let profit = 0;
        let revenue = 0;
        if ((salesForMonth ?? []).length > 0) {
          const ids = salesForMonth.map((s: any) => s.id);
          const [{ data: items }, { data: salesTotal }] = await Promise.all([
            supabase.from("pos_sale_items").select("quantity, purchase_price_cents, selling_price_cents").in("sale_id", ids),
            supabase.from("pos_sales").select("grand_total_cents").in("id", ids)
          ]);
          profit = (items ?? []).reduce((sum: number, item: any) => sum + (item.selling_price_cents - item.purchase_price_cents) * item.quantity, 0);
          revenue = (salesTotal ?? []).reduce((sum: number, s: any) => sum + s.grand_total_cents, 0);
        }

        monthlyProfitData.push({
          month: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
          revenue: Math.round(revenue / 100),
          profit: Math.round(profit / 100),
        });
      }

      adminStats = {
        todayProfit,
        thisMonthRevenue,
        thisMonthProfit,
        prevMonthProfit,
        inventoryValue,
        lowStockCount,
        outOfStockCount,
        monthlyProfitData
      };
    }

    return {
      todayRevenue,
      todaySalesCount,
      todayProductsCount,
      adminStats
    };
  });

// 6. Generate PDF invoice report
export const posGenerateReportPDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reportType: string; dateRange: { from: string; to: string } }) => z.object({
    reportType: z.string(),
    dateRange: z.object({ from: z.string(), to: z.string() })
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    const { isStaff, isAdmin } = await checkStaffAccess(supabase, userId);
    if (!isStaff) throw new Error("Unauthorized");

    // Fetch report data
    const { from, to } = data.dateRange;
    
    let reportTitle = "";
    let headers: string[] = [];
    let rows: any[][] = [];
    let totals: string[] = [];

    // Retrieve active user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    if (data.reportType === "sales" || data.reportType === "gst" || data.reportType === "profit") {
      const { data: sales, error } = await supabase
        .from("pos_sales")
        .select(`
          id, invoice_number, sold_at, subtotal_cents, discount_cents, 
          cgst_cents, sgst_cents, total_gst_cents, grand_total_cents, payment_method,
          profiles:sold_by (full_name)
        `)
        .gte("sold_at", from + "T00:00:00Z")
        .lte("sold_at", to + "T23:59:59Z")
        .order("sold_at", { ascending: true });

      if (error) throw new Error("Failed to load sales for report");

      if (data.reportType === "sales") {
        reportTitle = "POS Sales Report";
        headers = ["Invoice No", "Date", "Payment Method", "Cashier", "Grand Total (Rs)"];
        let totalCents = 0;
        sales.forEach((s: any) => {
          totalCents += s.grand_total_cents;
          rows.push([
            s.invoice_number,
            new Date(s.sold_at).toLocaleDateString(),
            s.payment_method,
            s.profiles?.full_name ?? "Staff",
            `Rs ${(s.grand_total_cents / 100).toFixed(2)}`
          ]);
        });
        totals = ["", "", "", "Total Revenue:", `Rs ${(totalCents / 100).toFixed(2)}`];
      } else if (data.reportType === "gst") {
        reportTitle = "POS GST Tax Compliance Report";
        headers = ["Invoice No", "Date", "Subtotal (Rs)", "Total GST (Rs)", "Grand Total (Rs)"];
        let totalSub = 0, totalGst = 0, totalGrand = 0;
        sales.forEach((s: any) => {
          totalSub += s.subtotal_cents;
          totalGst += s.total_gst_cents;
          totalGrand += s.grand_total_cents;
          rows.push([
            s.invoice_number,
            new Date(s.sold_at).toLocaleDateString(),
            `Rs ${(s.subtotal_cents / 100).toFixed(2)}`,
            `Rs ${(s.total_gst_cents / 100).toFixed(2)}`,
            `Rs ${(s.grand_total_cents / 100).toFixed(2)}`
          ]);
        });
        totals = [
          "Total Summaries:",
          "",
          `Rs ${(totalSub / 100).toFixed(2)}`,
          `Rs ${(totalGst / 100).toFixed(2)}`,
          `Rs ${(totalGrand / 100).toFixed(2)}`
        ];
      } else if (data.reportType === "profit") {
        if (!isAdmin) throw new Error("Access denied: Admins only");
        reportTitle = "POS Net Profit Report";
        headers = ["Invoice No", "Date", "Revenue (Rs)", "Item Cost (Rs)", "Net Profit (Rs)"];
        
        let totalRevenue = 0, totalCost = 0, totalProfit = 0;
        
        for (const s of sales) {
          const { data: items } = await supabase
            .from("pos_sale_items")
            .select("quantity, purchase_price_cents, selling_price_cents")
            .eq("sale_id", s.id);
          
          let cost = 0;
          let revenue = s.grand_total_cents;
          if (items) {
            cost = items.reduce((sum: number, it: any) => sum + it.purchase_price_cents * it.quantity, 0);
          }
          let profit = revenue - cost;

          totalRevenue += revenue;
          totalCost += cost;
          totalProfit += profit;

          rows.push([
            s.invoice_number,
            new Date(s.sold_at).toLocaleDateString(),
            `Rs ${(revenue / 100).toFixed(2)}`,
            `Rs ${(cost / 100).toFixed(2)}`,
            `Rs ${(profit / 100).toFixed(2)}`
          ]);
        }

        totals = [
          "Total Summaries:",
          "",
          `Rs ${(totalRevenue / 100).toFixed(2)}`,
          `Rs ${(totalCost / 100).toFixed(2)}`,
          `Rs ${(totalProfit / 100).toFixed(2)}`
        ];
      }
    } else if (data.reportType === "inventory") {
      reportTitle = "Inventory Evaluation & Stock Report";
      headers = ["Product Name", "Category", "Stock", "Unit Price (Buy)", "Total Valuation"];
      
      const { data: items, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw new Error("Failed to load inventory items");

      let totalVal = 0;
      items.forEach((item: any) => {
        const itemTotal = item.purchase_price_cents * item.quantity;
        totalVal += itemTotal;
        rows.push([
          item.name,
          item.category,
          item.quantity.toString(),
          `Rs ${(item.purchase_price_cents / 100).toFixed(2)}`,
          `Rs ${(itemTotal / 100).toFixed(2)}`
        ]);
      });

      totals = ["", "", "", "Total Value:", `Rs ${(totalVal / 100).toFixed(2)}`];
    } else {
      throw new Error("Invalid report type");
    }

    // Build PDF Document dynamically using pdfkit.standalone to prevent __dirname runtime error in ESM
    // @ts-ignore
    const PDFDocument = ((await import("pdfkit/js/pdfkit.standalone.js")) as any).default || (await import("pdfkit/js/pdfkit.standalone.js"));
    const base64 = await new Promise<string>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        const chunks: any[] = [];
        
        doc.on("data", (chunk: any) => chunks.push(chunk));
        doc.on("end", () => {
          const result = Buffer.concat(chunks);
          resolve(result.toString("base64"));
        });
        doc.on("error", (err: any) => reject(err));

        // Design headers
        doc.rect(0, 0, 595.28, 120).fill("#0b1020");
        doc.rect(0, 120, 595.28, 3).fill("#14b8a6");

        doc.fillColor("#14b8a6").font("Helvetica-Bold").fontSize(22).text("Tank by Tapan", 40, 35);
        doc.fillColor("#a855f7").font("Helvetica-Bold").fontSize(8).text("ELITE STRENGTH & CONDITIONING CLUB", 40, 62);
        
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16).text(reportTitle.toUpperCase(), 300, 35, { align: "right", width: 255 });
        doc.fillColor("#9ca3af").font("Helvetica").fontSize(8).text(`Date Range: ${from} to ${to}`, 300, 58, { align: "right", width: 255 });

        // Add report metadata
        doc.fillColor("#1f2937").font("Helvetica").fontSize(9);
        doc.text(`Generated By: ${profile?.full_name ?? "Admin"}`, 40, 140);
        doc.text(`Date of Generation: ${new Date().toLocaleString()}`, 40, 155);

        // Render Table headers
        let y = 190;
        doc.rect(40, y, 515, 20).fill("#1f2747");
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
        
        const colWidths = [120, 90, 90, 100, 115];
        let curX = 45;
        headers.forEach((h, i) => {
          doc.text(h, curX, y + 6);
          curX += colWidths[i];
        });

        // Render table rows
        y += 20;
        doc.font("Helvetica").fontSize(8).fillColor("#374151");
        
        rows.forEach((row, rowIndex) => {
          // Check page break
          if (y > 750) {
            doc.addPage();
            y = 40;
            // Draw headers again on new page
            doc.rect(40, y, 515, 20).fill("#1f2747");
            doc.fillColor("#ffffff").font("Helvetica-Bold");
            curX = 45;
            headers.forEach((h, i) => {
              doc.text(h, curX, y + 6);
              curX += colWidths[i];
            });
            y += 20;
            doc.font("Helvetica").fontSize(8).fillColor("#374151");
          }

          // Striped row bg
          if (rowIndex % 2 === 1) {
            doc.rect(40, y, 515, 18).fill("#f9fafb");
            doc.fillColor("#374151");
          }

          curX = 45;
          row.forEach((cell, cellIndex) => {
            doc.text(cell.toString(), curX, y + 5);
            curX += colWidths[cellIndex];
          });
          y += 18;
        });

        // Draw summary totals
        if (totals.length > 0) {
          y += 10;
          doc.rect(40, y, 515, 1).fill("#e5e7eb");
          y += 5;
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
          curX = 45;
          totals.forEach((t, i) => {
            doc.text(t, curX, y + 5);
            curX += colWidths[i];
          });
        }

        // Add page numbers
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fillColor("#9ca3af").font("Helvetica").fontSize(8).text(
            `Page ${i + 1} of ${range.count}`,
            40,
            810,
            { align: "center", width: 515 }
          );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });

    return base64;
  });
