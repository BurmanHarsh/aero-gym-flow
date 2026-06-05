-- Enable regular members to manage their own attendance records via RLS

-- 1. Allow members to view their own attendance records
CREATE POLICY "members read own attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members 
      WHERE id = attendance_records.member_id 
      AND email = auth.jwt()->>'email'
    )
  );

-- 2. Allow members to insert their own attendance records
CREATE POLICY "members insert own attendance" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members 
      WHERE id = member_id 
      AND email = auth.jwt()->>'email'
    )
  );

-- 3. Allow members to check out (update) their own attendance records
CREATE POLICY "members update own attendance" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members 
      WHERE id = attendance_records.member_id 
      AND email = auth.jwt()->>'email'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members 
      WHERE id = member_id 
      AND email = auth.jwt()->>'email'
    )
  );
