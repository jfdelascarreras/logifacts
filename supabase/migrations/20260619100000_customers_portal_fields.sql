-- Portal fields for the customers table.
-- enforce_discounts: when true, the rate calculator requires contract discounts to be set.
-- default_dimensions: optional package dimensions pre-filled on the portal calculator.

ALTER TABLE public.customers
  ADD COLUMN enforce_discounts  boolean NOT NULL DEFAULT false,
  ADD COLUMN default_dimensions jsonb;

COMMENT ON COLUMN public.customers.enforce_discounts  IS 'Reject rate requests if no contract discounts are configured for this customer.';
COMMENT ON COLUMN public.customers.default_dimensions IS 'Default package dimensions {length, width, height} in inches pre-filled on the portal calculator.';
