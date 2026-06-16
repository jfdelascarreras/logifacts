-- Phase 3: Schema integrity — status enum, NOT NULL ownership, legacy flag.

DO $$ BEGIN
  CREATE TYPE public.upload_status AS ENUM ('uploaded', 'processing', 'complete', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.invoice_uploads
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.invoice_uploads
  ALTER COLUMN status TYPE public.upload_status
  USING status::public.upload_status;

ALTER TABLE public.invoice_uploads
  ALTER COLUMN status SET DEFAULT 'uploaded'::public.upload_status;

ALTER TABLE public.invoices
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.invoice_lines
  ALTER COLUMN invoice_id SET NOT NULL;

ALTER TABLE public.invoice_lines
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.invoice_spend_by_date
  ADD COLUMN IF NOT EXISTS is_legacy_account boolean NOT NULL DEFAULT false;

UPDATE public.invoice_spend_by_date
SET is_legacy_account = true
WHERE account_number = '(legacy)';

COMMENT ON COLUMN public.invoice_spend_by_date.is_legacy_account IS
  'True when row predates per-account rollups (account_number was the sentinel ''(legacy)'').';
