-- Create employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'Manager' | 'Trainer' | 'Front Desk' | 'Sweeper' | 'Security'
  email TEXT,
  phone TEXT,
  salary_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

-- Seed default employees
INSERT INTO public.employees (name, role, email, phone, salary_cents, status, hire_date) VALUES
  ('Arjun Kapoor', 'Manager', 'arjun@aerogym.com', '+91 98765 43210', 5000000, 'active', '2025-01-15'),
  ('Vikram Singh', 'Trainer', 'vikram@aerogym.com', '+91 98765 43211', 3000000, 'active', '2025-02-10'),
  ('Neha Sharma', 'Front Desk', 'neha@aerogym.com', '+91 98765 43212', 2500000, 'active', '2025-03-01'),
  ('Ramesh Kumar', 'Sweeper', NULL, '+91 98765 43213', 1200000, 'active', '2025-04-12'),
  ('Suresh Pal', 'Security', NULL, '+91 98765 43214', 1500000, 'inactive', '2025-05-20');

-- Enable Row Level Security
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Read policy: Allow all authenticated users who are staff to view employees
CREATE POLICY "staff read employees" ON public.employees
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Write policy: Allow only admins to manage employees
CREATE POLICY "admin manage employees" ON public.employees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for touch_updated_at
CREATE TRIGGER touch_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
