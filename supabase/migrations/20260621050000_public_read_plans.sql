-- Allow the public landing page (unauthenticated / anon) to read active plans
GRANT SELECT ON public.membership_plans TO anon;

CREATE POLICY "public_read_active_plans" ON public.membership_plans
  FOR SELECT TO anon
  USING (active = true);
