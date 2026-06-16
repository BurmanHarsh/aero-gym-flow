-- Add photo_url column to public.membership_plans if it doesn't already exist
ALTER TABLE public.membership_plans ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Drop old select and manage policies on public.membership_plans
DROP POLICY IF EXISTS "staff read plans" ON public.membership_plans;
DROP POLICY IF EXISTS "admin manage plans" ON public.membership_plans;

-- Create new policies:
-- 1. SELECT policy: Staff can read all plans, but normal members can only read active plans (active = true)
CREATE POLICY "select_plans" ON public.membership_plans
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR active = true);

-- 2. INSERT policy: Only staff can insert new membership plans
CREATE POLICY "insert_plans" ON public.membership_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- 3. UPDATE policy: Only staff can update existing membership plans
CREATE POLICY "update_plans" ON public.membership_plans
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4. DELETE policy: Only staff can delete membership plans
CREATE POLICY "delete_plans" ON public.membership_plans
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));
