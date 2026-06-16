-- Allow Premium Analysis cache for FedEx/WWE-only users (no invoice_uploads row).
ALTER TABLE public.invoice_upload_analyses
  ALTER COLUMN invoice_upload_id DROP NOT NULL;

-- One aggregate analysis row per user when not anchored to a UPS upload.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_upload_analyses_user_aggregate_key
  ON public.invoice_upload_analyses (user_id)
  WHERE invoice_upload_id IS NULL;
