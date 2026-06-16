-- Phase 2: Index FK column flagged by Supabase performance advisor.

CREATE INDEX IF NOT EXISTS invoice_rows_invoice_upload_id_idx
  ON public.invoice_rows (invoice_upload_id)
  WHERE invoice_upload_id IS NOT NULL;
