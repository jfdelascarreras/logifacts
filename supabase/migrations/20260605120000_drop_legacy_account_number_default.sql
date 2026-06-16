-- Drop the '(legacy)' sentinel default from invoice_spend_by_date.account_number.
-- is_legacy_account boolean (added in 20260604120000) now carries that signal.
-- New rows must supply an explicit account_number.

ALTER TABLE public.invoice_spend_by_date
  ALTER COLUMN account_number DROP DEFAULT;
