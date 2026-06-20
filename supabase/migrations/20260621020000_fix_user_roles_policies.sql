-- Grant read/write permissions on user_roles to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- Drop existing restricted select policy
DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;

-- Create new policies for user_roles
CREATE POLICY "users see own roles or staff see all" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

CREATE POLICY "admins manage user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
