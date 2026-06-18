-- Create inventory_sales table
CREATE TABLE IF NOT EXISTS public.inventory_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
  total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
  sold_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_sales TO authenticated;
GRANT ALL ON public.inventory_sales TO service_role;

-- Enable RLS
ALTER TABLE public.inventory_sales ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read and insert sales (staff can sell, admin can view)
CREATE POLICY "staff manage inventory_sales" ON public.inventory_sales
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'front_desk')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'front_desk')
  );
