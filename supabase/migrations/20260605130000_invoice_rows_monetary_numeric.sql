-- Retype monetary, weight, and quantity columns in invoice_rows from text to numeric/integer.
-- Non-parseable values (empty strings, '—', etc.) are coerced to NULL rather than erroring.
-- The safe-cast regex accepts optional leading negative, digit groups with optional commas,
-- and an optional decimal part — matching every format produced by the UPS/FedEx/WWE parsers.
-- Row hashes are unaffected (computed from raw CSV strings before insert).

ALTER TABLE public.invoice_rows
  ALTER COLUMN net_amount      TYPE numeric
    USING CASE WHEN TRIM(net_amount)      ~ '^-?[0-9,]+(\.[0-9]+)?$'
               THEN REPLACE(TRIM(net_amount),      ',', '')::numeric ELSE NULL END,
  ALTER COLUMN invoice_amount  TYPE numeric
    USING CASE WHEN TRIM(invoice_amount)  ~ '^-?[0-9,]+(\.[0-9]+)?$'
               THEN REPLACE(TRIM(invoice_amount),  ',', '')::numeric ELSE NULL END,
  ALTER COLUMN duty_amount     TYPE numeric
    USING CASE WHEN TRIM(duty_amount)     ~ '^-?[0-9,]+(\.[0-9]+)?$'
               THEN REPLACE(TRIM(duty_amount),     ',', '')::numeric ELSE NULL END,
  ALTER COLUMN billed_weight   TYPE numeric
    USING CASE WHEN TRIM(billed_weight)   ~ '^-?[0-9,]+(\.[0-9]+)?$'
               THEN REPLACE(TRIM(billed_weight),   ',', '')::numeric ELSE NULL END,
  ALTER COLUMN entered_weight  TYPE numeric
    USING CASE WHEN TRIM(entered_weight)  ~ '^-?[0-9,]+(\.[0-9]+)?$'
               THEN REPLACE(TRIM(entered_weight),  ',', '')::numeric ELSE NULL END,
  ALTER COLUMN package_quantity TYPE integer
    USING CASE WHEN TRIM(package_quantity) ~ '^[0-9,]+(\.[0-9]+)?$'
               THEN ROUND(REPLACE(TRIM(package_quantity), ',', '')::numeric)::integer ELSE NULL END;
