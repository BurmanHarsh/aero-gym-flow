-- Add usage tracking to coupons table
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_uses INT DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS used_count INT NOT NULL DEFAULT 0;

-- Add a comment for clarity
COMMENT ON COLUMN public.coupons.max_uses IS 'Maximum number of times this coupon can be used. NULL = unlimited.';
COMMENT ON COLUMN public.coupons.used_count IS 'Number of times this coupon has been successfully used.';

-- RPC function to safely increment used_count
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_code TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.coupons
  SET used_count = used_count + 1
  WHERE code = coupon_code;
END;
$$;

