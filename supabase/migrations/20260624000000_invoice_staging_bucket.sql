-- Staging bucket for large invoice uploads.
-- The browser client uploads directly here, bypassing the Vercel function
-- payload limit. The API route downloads using the service role and deletes
-- the file after processing.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('invoice-staging', 'invoice-staging', false, 104857600) -- 100 MB cap
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may upload files into this bucket.
CREATE POLICY "Authenticated users can upload to invoice-staging"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-staging');

-- Authenticated users may delete their own staged files (client-side cleanup on error).
CREATE POLICY "Authenticated users can delete from invoice-staging"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-staging');
