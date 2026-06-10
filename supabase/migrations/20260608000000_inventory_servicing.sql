-- Add equipment servicing columns to inventory_items
ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS last_serviced_at DATE,
  ADD COLUMN IF NOT EXISTS next_service_due DATE,
  ADD COLUMN IF NOT EXISTS servicing_notes TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'working';

-- Update RLS policies for inventory_items
DROP POLICY IF EXISTS "admin manage inventory_items" ON public.inventory_items;

CREATE POLICY "staff manage inventory_items" ON public.inventory_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'front_desk')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'front_desk')
  );

CREATE POLICY "anyone view inventory_items" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (true);
