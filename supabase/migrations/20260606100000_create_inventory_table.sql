-- Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'Equipment' | 'Supplements' | 'Apparel' | 'Beverages' | 'Sanitation' | 'Other'
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 5,
  purchase_price_cents INTEGER NOT NULL DEFAULT 0,
  sale_price_cents INTEGER,
  supplier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;

-- Seed default inventory items
INSERT INTO public.inventory_items (name, description, category, quantity, min_stock_level, purchase_price_cents, sale_price_cents, supplier) VALUES
  ('Hex Dumbbells 10kg (Pair)', 'Rubber coated hexagonal dumbbells', 'Equipment', 8, 3, 240000, 320000, 'FitGear India'),
  ('Hex Dumbbells 15kg (Pair)', 'Rubber coated hexagonal dumbbells', 'Equipment', 2, 3, 350000, 450000, 'FitGear India'),
  ('Premium Yoga Mat', '6mm non-slip textured mats', 'Equipment', 15, 5, 80000, 120000, 'YogiLife Ltd'),
  ('Gold Standard Whey 1kg', 'Chocolate flavor protein supplement', 'Supplements', 12, 4, 380000, 480000, 'HealthMart Distributors'),
  ('Creatine Monohydrate 250g', 'Unflavored muscle builder powder', 'Supplements', 0, 4, 120000, 180000, 'HealthMart Distributors'),
  ('Monster Energy Drink', 'Standard 350ml cans', 'Beverages', 24, 10, 8000, 12000, 'Coca-Cola Beverages'),
  ('Microfiber Towels (Pack of 5)', 'Sanitation and cleaning towels', 'Sanitation', 30, 8, 45000, NULL, 'CleanCare Co');

-- Enable Row Level Security
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- Restrict all actions on inventory strictly to admins
CREATE POLICY "admin manage inventory_items" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for touch_updated_at
CREATE TRIGGER touch_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
