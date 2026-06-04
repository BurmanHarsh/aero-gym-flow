-- Keep billing visibility private for non-admin staff.
-- Admins can see all invoices/payments; front desk users can only see and work
-- with invoices/payments they created or recorded.

DROP POLICY IF EXISTS "staff read invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff write invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff update invoices" ON public.invoices;
DROP POLICY IF EXISTS "admin delete invoices" ON public.invoices;

CREATE POLICY "admin read invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "staff read own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "staff create own invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid()));

CREATE POLICY "staff update own invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE POLICY "admin delete invoices" ON public.invoices
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "staff read payments" ON public.payments;
DROP POLICY IF EXISTS "staff write payments" ON public.payments;
DROP POLICY IF EXISTS "admin update payments" ON public.payments;
DROP POLICY IF EXISTS "admin delete payments" ON public.payments;

CREATE POLICY "admin read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "staff read own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (recorded_by = auth.uid());

CREATE POLICY "staff create payments for own invoices" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_id
        AND (public.has_role(auth.uid(), 'admin') OR i.created_by = auth.uid())
    )
  );

CREATE POLICY "admin update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
