-- `invoice_spend_by_date` is a derived cache table populated by the app.
-- It must not fail writes if `dim_date` is missing rows for a new date.
-- Keep invoice_date as plain date without hard dependency on `dim_date`.

alter table if exists public.invoice_spend_by_date
  drop constraint if exists invoice_spend_by_date_invoice_date_fkey;
