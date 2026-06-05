-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  category TEXT NOT NULL, -- 'Rent' | 'Utilities' | 'Salaries' | 'Equipment' | 'Maintenance' | 'Marketing' | 'Other'
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'Cash', -- 'Cash' | 'Bank Transfer' | 'UPI' | 'Card'
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

-- Seed default expenses
INSERT INTO public.expenses (title, description, amount_cents, category, date, payment_method) VALUES
  ('Monthly Gym Rent', 'Building lease payment for June 2026', 15000000, 'Rent', '2026-06-01', 'Bank Transfer'),
  ('Electricity Bill', 'Power consumption for May 2026', 2200000, 'Utilities', '2026-06-02', 'UPI'),
  ('Supplements Restock', 'Whey protein, creatine, and energy drinks restock', 4500000, 'Equipment', '2026-06-03', 'Card'),
  ('AC Servicing', 'Maintenance for 4 main hall AC units', 850000, 'Maintenance', '2026-06-04', 'Cash');

-- Enable Row Level Security
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Restrict all actions on expenses exclusively to admins
CREATE POLICY "admin manage expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for touch_updated_at
CREATE TRIGGER touch_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
