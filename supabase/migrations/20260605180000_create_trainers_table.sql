-- Create trainers table
CREATE TABLE IF NOT EXISTS public.trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  shift TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'off', -- 'floor' | 'session' | 'break' | 'off'
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainers TO authenticated;
GRANT ALL ON public.trainers TO service_role;

-- Seed default trainers
INSERT INTO public.trainers (name, specialization, shift, status, avatar) VALUES
  ('Vikram Singh', 'Strength & Conditioning', '06:00 AM - 11:00 AM', 'floor', 'VS'),
  ('Priya Sharma', 'Yoga & Pilates', '07:00 AM - 12:00 PM', 'session', 'PS'),
  ('Rahul Verma', 'Cardio & HIIT', '04:00 PM - 09:00 PM', 'break', 'RV'),
  ('Sneha Patel', 'Weight Loss & PT', '05:00 PM - 10:00 PM', 'off', 'SP');

-- Enable Row Level Security
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow all authenticated users (who are staff) to view trainers
CREATE POLICY "staff read trainers" ON public.trainers
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Write policy: Allow only admins to manage trainers
CREATE POLICY "admin manage trainers" ON public.trainers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for touch_updated_at
CREATE TRIGGER touch_trainers_updated_at BEFORE UPDATE ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
