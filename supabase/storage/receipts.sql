INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Users can view their own receipts
CREATE POLICY "Users can view own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can insert receipts
CREATE POLICY "Service role can insert receipts"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'receipts');