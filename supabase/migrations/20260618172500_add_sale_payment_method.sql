-- Add payment_method column to inventory_sales table
ALTER TABLE public.inventory_sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash'; -- 'cash' | 'upi'
