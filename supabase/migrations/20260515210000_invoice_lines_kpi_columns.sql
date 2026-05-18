-- Add KPI classification columns to invoice_lines.
-- These mirror the fields used by the Python dashboard script to compute
-- Fuel, Accessorials, Surcharges, and Total Volume KPIs.

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS charge_classification_code text,  -- e.g. FRT, ACC
  ADD COLUMN IF NOT EXISTS charge_category_code       text,  -- e.g. INF, ICC
  ADD COLUMN IF NOT EXISTS package_quantity           numeric;

-- Index for accessorials filter (ACC + not INF/ICC)
CREATE INDEX IF NOT EXISTS idx_invoice_lines_classification
  ON invoice_lines (invoice_id, charge_classification_code, charge_category_code);
