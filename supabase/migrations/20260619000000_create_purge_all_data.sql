-- Create purge_all_data function to clear gym database records
CREATE OR REPLACE FUNCTION public.purge_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the calling user is authenticated and is an admin
  IF NOT (
    public.is_staff(auth.uid()) AND 
    public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can purge database records.';
  END IF;

  -- 1. Delete payments
  DELETE FROM public.payments WHERE id IS NOT NULL;

  -- 2. Delete invoices
  DELETE FROM public.invoices WHERE id IS NOT NULL;

  -- 3. Delete attendance records
  DELETE FROM public.attendance_records WHERE id IS NOT NULL;

  -- 4. Delete inventory sales
  DELETE FROM public.inventory_sales WHERE id IS NOT NULL;

  -- 5. Delete leads
  DELETE FROM public.leads WHERE id IS NOT NULL;

  -- 6. Delete members
  DELETE FROM public.members WHERE id IS NOT NULL;

  -- 7. Delete expenses
  DELETE FROM public.expenses WHERE id IS NOT NULL;

  -- 8. Delete employees
  DELETE FROM public.employees WHERE id IS NOT NULL;

  -- 9. Delete audit logs
  DELETE FROM public.audit_logs WHERE id IS NOT NULL;

  -- 10. Delete notifications
  DELETE FROM public.notifications WHERE id IS NOT NULL;

  -- 11. Delete all other users except the current user from auth.users
  -- Deleting from auth.users will cascade-delete their public.profiles, public.user_roles, and public.notifications
  DELETE FROM auth.users WHERE id <> auth.uid();
END;
$$;

-- Grant execute privilege on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.purge_all_data() TO authenticated;
