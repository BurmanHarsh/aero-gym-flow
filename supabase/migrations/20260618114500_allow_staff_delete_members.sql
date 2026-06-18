-- Drop the existing delete policy on members if it exists
DROP POLICY IF EXISTS "admin delete members" ON public.members;
DROP POLICY IF EXISTS "admin and front desk delete members" ON public.members;

-- Create a new delete policy that allows any authenticated staff (admin or front desk) to delete members
CREATE POLICY "staff delete members" ON public.members
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));
