-- Ensure public.master_mapping exists as an independent BASE TABLE.
-- Safe to run when master_mapping already exists as a table (IF NOT EXISTS guard).
-- If master_mapping was a VIEW (over the now-dropped charge_description_mappings), drop it
-- and create the canonical table so all app code can query it reliably.

DO $$
BEGIN
  -- If it exists as a VIEW, drop it so CREATE TABLE IF NOT EXISTS succeeds below.
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'master_mapping'
  ) THEN
    DROP VIEW public.master_mapping;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.master_mapping (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carrier             text    NOT NULL DEFAULT 'UPS',
  charge_description  text    NOT NULL,
  transportation_mode text,
  category_1          text,
  category_2          text,
  category_3          text,
  category_4          text,
  category_5          text,
  standardized_charge text,
  CONSTRAINT master_mapping_carrier_charge_description_key
    UNIQUE (carrier, charge_description)
);

-- RLS: authenticated users may read the reference table; writes are service-role only.
ALTER TABLE public.master_mapping ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'master_mapping'
      AND policyname  = 'master_mapping_select_authenticated'
  ) THEN
    CREATE POLICY master_mapping_select_authenticated
      ON public.master_mapping
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
