-- Add medical_info column to members table if it doesn't exist
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS medical_info TEXT;

-- Create storage bucket for member photos if it doesn't exist
-- Supabase stores buckets in storage.buckets table
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage objects inside 'photos' bucket
-- Allow public select access to photos bucket
CREATE POLICY "Public Access Photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'photos');

-- Allow authenticated users to insert/upload photos to photos bucket
CREATE POLICY "Authenticated Insert Photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos');

-- Allow authenticated users to update their uploaded photos
CREATE POLICY "Authenticated Update Photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'photos')
  WITH CHECK (bucket_id = 'photos');

-- Allow authenticated users to delete photos
CREATE POLICY "Authenticated Delete Photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos');
