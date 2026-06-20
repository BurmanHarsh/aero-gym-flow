-- Add photo_url to inventory_items
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Add buyer_email to inventory_sales
ALTER TABLE public.inventory_sales ADD COLUMN IF NOT EXISTS buyer_email TEXT;
