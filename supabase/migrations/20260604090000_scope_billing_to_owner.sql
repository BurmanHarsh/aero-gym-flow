-- Keep billing visibility private for non-admin staff.
-- Admins and front desk staff have identical access to read, insert, update, and delete invoices and payments.

DROP POLICY IF EXISTS "staff read invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff write invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff update invoices" ON public.invoices;
DROP POLICY IF EXISTS "admin delete invoices" ON public.invoices;

DROP POLICY IF EXISTS "admin read invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff read own invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff create own invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff update own invoices" ON public.invoices;

CREATE POLICY "admin read invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff create own invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff update own invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "admin delete invoices" ON public.invoices
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff read payments" ON public.payments;
DROP POLICY IF EXISTS "staff write payments" ON public.payments;
DROP POLICY IF EXISTS "admin update payments" ON public.payments;
DROP POLICY IF EXISTS "admin delete payments" ON public.payments;

DROP POLICY IF EXISTS "admin read payments" ON public.payments;
DROP POLICY IF EXISTS "staff read own payments" ON public.payments;
DROP POLICY IF EXISTS "staff create payments for own invoices" ON public.payments;

CREATE POLICY "admin read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff create payments for own invoices" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "admin update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "admin delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));
