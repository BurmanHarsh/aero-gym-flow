-- 1. Alter inventory_items table
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS gst_percentage INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Create fast lookup index on barcode
CREATE INDEX IF NOT EXISTS inventory_items_barcode_idx 
  ON public.inventory_items (barcode) 
  WHERE active = true;

-- 2. Create pos_sales table
CREATE TABLE IF NOT EXISTS public.pos_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  sold_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  cgst_cents INTEGER NOT NULL DEFAULT 0 CHECK (cgst_cents >= 0),
  sgst_cents INTEGER NOT NULL DEFAULT 0 CHECK (sgst_cents >= 0),
  total_gst_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_gst_cents >= 0),
  grand_total_cents INTEGER NOT NULL CHECK (grand_total_cents >= 0),
  payment_method TEXT NOT NULL,
  transaction_id TEXT
);

-- Enable RLS and grants
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sales TO authenticated;
GRANT ALL ON public.pos_sales TO service_role;

-- RLS policies
CREATE POLICY "staff manage pos_sales" ON public.pos_sales
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 3. Create pos_sale_items table
CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  barcode TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  purchase_price_cents INTEGER NOT NULL CHECK (purchase_price_cents >= 0),
  selling_price_cents INTEGER NOT NULL CHECK (selling_price_cents >= 0),
  gst_percentage INTEGER NOT NULL DEFAULT 0 CHECK (gst_percentage >= 0),
  gst_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (gst_amount_cents >= 0),
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0)
);

-- Enable RLS and grants
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sale_items TO authenticated;
GRANT ALL ON public.pos_sale_items TO service_role;

-- RLS policies
CREATE POLICY "staff manage pos_sale_items" ON public.pos_sale_items
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4. Create pos_inventory_logs table
CREATE TABLE IF NOT EXISTS public.pos_inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('receive', 'sale', 'adjustment')),
  quantity_changed INTEGER NOT NULL,
  previous_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and grants
ALTER TABLE public.pos_inventory_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_inventory_logs TO authenticated;
GRANT ALL ON public.pos_inventory_logs TO service_role;

-- RLS policies
CREATE POLICY "staff manage pos_inventory_logs" ON public.pos_inventory_logs
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 5. Seed barcode data for existing inventory items
UPDATE public.inventory_items SET barcode = '8901030753007', sku = 'WHEY-1KG', gst_percentage = 18 WHERE name = 'Gold Standard Whey 1kg';
UPDATE public.inventory_items SET barcode = '5060337500305', sku = 'MONSTER-350', gst_percentage = 18 WHERE name = 'Monster Energy Drink';
UPDATE public.inventory_items SET barcode = '8904256012431', sku = 'YOGA-MAT', gst_percentage = 12 WHERE name = 'Premium Yoga Mat';
UPDATE public.inventory_items SET barcode = '8901030753113', sku = 'CREATINE-250', gst_percentage = 18 WHERE name = 'Creatine Monohydrate 250g';

-- 6. Atomic Transaction stored procedure for POS Checkout
CREATE OR REPLACE FUNCTION public.checkout_pos_sale(
  _sold_by UUID,
  _payment_method TEXT,
  _discount_cents INTEGER,
  _subtotal_cents INTEGER,
  _cgst_cents INTEGER,
  _sgst_cents INTEGER,
  _total_gst_cents INTEGER,
  _grand_total_cents INTEGER,
  _transaction_id TEXT,
  _cart_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_invoice_number TEXT;
  v_item JSONB;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_item_name TEXT;
  v_barcode TEXT;
  v_gst_amt INTEGER;
  v_total_amt INTEGER;
BEGIN
  -- Generate unique invoice number
  v_invoice_number := 'INV-POS-' || to_char(now(), 'YYYYMM') || '-' || lpad((floor(random()*899999)+100000)::text, 6, '0');

  -- Insert POS sale
  INSERT INTO public.pos_sales (
    invoice_number, sold_by, subtotal_cents, discount_cents, 
    cgst_cents, sgst_cents, total_gst_cents, grand_total_cents, 
    payment_method, transaction_id
  ) VALUES (
    v_invoice_number, _sold_by, _subtotal_cents, _discount_cents,
    _cgst_cents, _sgst_cents, _total_gst_cents, _grand_total_cents,
    _payment_method, _transaction_id
  ) RETURNING id INTO v_sale_id;

  -- Loop through cart items
  FOR v_item IN SELECT * FROM jsonb_array_elements(_cart_items) LOOP
    -- Get product info & lock the row for update
    SELECT quantity, name, barcode 
      INTO v_current_stock, v_item_name, v_barcode
      FROM public.inventory_items 
      WHERE id = (v_item->>'item_id')::UUID 
      FOR UPDATE;

    -- Validate stock
    IF v_current_stock < (v_item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Insufficient stock for product % (Available: %, Requested: %)', 
        v_item_name, v_current_stock, (v_item->>'quantity')::INTEGER;
    END IF;

    -- Calculate GST and totals for item (GST is included or added depending on setup, standard is tax = rounding (price * tax_pct / 100))
    v_gst_amt := round(((v_item->>'selling_price_cents')::INTEGER * (v_item->>'gst_percentage')::INTEGER * (v_item->>'quantity')::INTEGER) / 100.0);
    v_total_amt := ((v_item->>'selling_price_cents')::INTEGER * (v_item->>'quantity')::INTEGER);

    -- Insert into sale items
    INSERT INTO public.pos_sale_items (
      sale_id, item_id, item_name, barcode, quantity,
      purchase_price_cents, selling_price_cents, gst_percentage,
      gst_amount_cents, total_amount_cents
    ) VALUES (
      v_sale_id, (v_item->>'item_id')::UUID, v_item_name, v_barcode, (v_item->>'quantity')::INTEGER,
      (v_item->>'purchase_price_cents')::INTEGER, (v_item->>'selling_price_cents')::INTEGER, (v_item->>'gst_percentage')::INTEGER,
      v_gst_amt, v_total_amt
    );

    -- Update inventory stock
    v_new_stock := v_current_stock - (v_item->>'quantity')::INTEGER;
    UPDATE public.inventory_items 
      SET quantity = v_new_stock
      WHERE id = (v_item->>'item_id')::UUID;

    -- Record inventory log
    INSERT INTO public.pos_inventory_logs (
      item_id, change_type, quantity_changed, previous_stock, new_stock, recorded_by, notes
    ) VALUES (
      (v_item->>'item_id')::UUID, 'sale', -(v_item->>'quantity')::INTEGER, v_current_stock, v_new_stock, _sold_by, 'POS Checkout ' || v_invoice_number
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number
  );
END;
$$;
