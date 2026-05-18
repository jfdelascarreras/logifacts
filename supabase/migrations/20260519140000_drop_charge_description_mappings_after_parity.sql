-- Consolidate taxonomy: single canonical table is public.master_mapping.
-- Preconditions applied inside DO block:
--   1) Row keys match between master_mapping and charge_description_mappings
--   2) Taxonomy columns match for every shared key
-- Then drops public.charge_description_mappings (policies first).

DO $$
DECLARE
  key_diff bigint;
  val_diff bigint;
  pol RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'charge_description_mappings'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'master_mapping'
    ) THEN
      RAISE EXCEPTION 'Consolidation aborted: public.master_mapping is missing';
    END IF;

    SELECT COUNT(*) INTO key_diff
    FROM (
      SELECT carrier, charge_description FROM public.master_mapping
      EXCEPT
      SELECT carrier, charge_description FROM public.charge_description_mappings
      UNION ALL
      SELECT carrier, charge_description FROM public.charge_description_mappings
      EXCEPT
      SELECT carrier, charge_description FROM public.master_mapping
    ) d;

    IF key_diff > 0 THEN
      RAISE EXCEPTION
        'Consolidation aborted: % (carrier, charge_description) keys differ between master_mapping and charge_description_mappings',
        key_diff;
    END IF;

    SELECT COUNT(*) INTO val_diff
    FROM public.master_mapping mm
    INNER JOIN public.charge_description_mappings cdm
      ON mm.carrier = cdm.carrier
      AND mm.charge_description = cdm.charge_description
    WHERE mm.transportation_mode IS DISTINCT FROM cdm.transportation_mode
      OR mm.category_1 IS DISTINCT FROM cdm.category_1
      OR mm.category_2 IS DISTINCT FROM cdm.category_2
      OR mm.category_3 IS DISTINCT FROM cdm.category_3
      OR mm.category_4 IS DISTINCT FROM cdm.category_4
      OR mm.category_5 IS DISTINCT FROM cdm.category_5
      OR mm.standardized_charge IS DISTINCT FROM cdm.standardized_charge;

    IF val_diff > 0 THEN
      RAISE EXCEPTION
        'Consolidation aborted: % rows differ on taxonomy columns for matching keys',
        val_diff;
    END IF;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'charge_description_mappings'
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.charge_description_mappings',
        pol.policyname
      );
    END LOOP;

    DROP TABLE IF EXISTS public.charge_description_mappings CASCADE;
  ELSE
    RAISE NOTICE 'Skipping: public.charge_description_mappings does not exist';
  END IF;
END $$;
