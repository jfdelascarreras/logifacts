-- Link multipart-ingest (FedEx/WWE) lines to their invoices header row.
-- UPS rows continue to use invoice_upload_id.

ALTER TABLE public.invoice_rows
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid
  REFERENCES public.invoices(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS invoice_rows_source_invoice_id_idx
  ON public.invoice_rows (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;
