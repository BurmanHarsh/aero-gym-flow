-- Enable members to view their own profile, invoices, payments, and all membership plans.

-- 1. Allow members to view their own profile in public.members
DROP POLICY IF EXISTS "members read own profile" ON public.members;
CREATE POLICY "members read own profile" ON public.members
  FOR SELECT TO authenticated
  USING (email = auth.jwt()->>'email');

-- 2. Allow all authenticated users to read membership plans
DROP POLICY IF EXISTS "authenticated read plans" ON public.membership_plans;
CREATE POLICY "authenticated read plans" ON public.membership_plans
  FOR SELECT TO authenticated
  USING (true);

-- 3. Allow members to view their own invoices
DROP POLICY IF EXISTS "members read own invoices" ON public.invoices;
CREATE POLICY "members read own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members 
      WHERE id = invoices.member_id 
      AND email = auth.jwt()->>'email'
    )
  );

-- 4. Allow members to view payments made towards their own invoices
DROP POLICY IF EXISTS "members read own payments" ON public.payments;
CREATE POLICY "members read own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      JOIN public.members ON members.id = invoices.member_id
      WHERE invoices.id = payments.invoice_id
      AND members.email = auth.jwt()->>'email'
    )
  );
