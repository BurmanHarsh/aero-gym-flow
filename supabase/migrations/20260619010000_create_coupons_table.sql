-- Create coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_percent INT NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  discount_upto_cents INT NOT NULL CHECK (discount_upto_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Select policy: staff can read coupons
CREATE POLICY "staff read coupons" ON public.coupons
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- All policy for admin: admin can create/edit/delete coupons
CREATE POLICY "admin manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grant permissions on coupons
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

-- Update trigger for coupons
CREATE TRIGGER coupons_touch BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add columns to members table
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS coupon_discount_cents INT DEFAULT 0;

-- Add columns to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS coupon_discount_cents INT DEFAULT 0;

-- Add columns to inventory_sales table
ALTER TABLE public.inventory_sales ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.inventory_sales ADD COLUMN IF NOT EXISTS coupon_discount_cents INT DEFAULT 0;
