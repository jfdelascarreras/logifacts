-- Sprint 1: enrich multipart staging + canonical invoice_rows fact columns.

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS billed_weight numeric,
  ADD COLUMN IF NOT EXISTS entered_weight numeric,
  ADD COLUMN IF NOT EXISTS transaction_date text,
  ADD COLUMN IF NOT EXISTS parse_version text;

ALTER TABLE public.invoice_rows
  ADD COLUMN IF NOT EXISTS mapped boolean,
  ADD COLUMN IF NOT EXISTS standardized_charge text,
  ADD COLUMN IF NOT EXISTS category_1 text,
  ADD COLUMN IF NOT EXISTS category_2 text,
  ADD COLUMN IF NOT EXISTS category_3 text,
  ADD COLUMN IF NOT EXISTS parse_version text,
  ADD COLUMN IF NOT EXISTS shipment_date text;

CREATE INDEX IF NOT EXISTS invoice_rows_user_mapped_idx
  ON public.invoice_rows (user_id, mapped)
  WHERE mapped IS NOT NULL;
