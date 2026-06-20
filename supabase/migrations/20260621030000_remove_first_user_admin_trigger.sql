-- Remove the "first registered user becomes admin" logic from the trigger.
-- Admins should only be assigned manually by an existing admin in the Employees > App Logins UI.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  -- No longer auto-assign admin to the first user.
  -- Roles are assigned manually via the Admin panel.
  RETURN NEW;
END;
$$;
