-- Multicarrier taxonomy for charge_description_mappings:
--   * columns: carrier (NOT NULL DEFAULT 'UPS'), standardized_charge (nullable text)
--   * uniqueness: UNIQUE (carrier, charge_description)
--
-- Production currently uses UUID pk + timestamps and UNIQUE(charge_description) only.
-- This migration is ALTER-only (no CREATE TABLE) so it matches that shape.
--
-- Preconditions (manual preflight recommended before apply):
--   SELECT charge_description, count(*) FROM public.charge_description_mappings
--   GROUP BY 1 HAVING count(*) > 1;
--   → must return zero rows before dropping UNIQUE(charge_description).
--
-- Do not run multicarrier seed (`supabase/seed.ts` upserts) until this migration succeeds.

ALTER TABLE public.charge_description_mappings
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS standardized_charge text;

UPDATE public.charge_description_mappings
SET carrier = COALESCE(NULLIF(TRIM(carrier), ''), 'UPS')
WHERE carrier IS NULL OR TRIM(carrier) = '';

ALTER TABLE public.charge_description_mappings
  ALTER COLUMN carrier SET DEFAULT 'UPS';

ALTER TABLE public.charge_description_mappings
  ALTER COLUMN carrier SET NOT NULL;

ALTER TABLE public.charge_description_mappings
  DROP CONSTRAINT IF EXISTS charge_description_mappings_charge_description_key;

CREATE UNIQUE INDEX IF NOT EXISTS charge_description_mappings_carrier_charge_desc_uidx
  ON public.charge_description_mappings (carrier, charge_description);
