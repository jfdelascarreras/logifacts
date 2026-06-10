-- Phase 0.2: Restrict master_mapping reads to authenticated role (not public/anon).

DROP POLICY IF EXISTS master_mapping_select_all ON public.master_mapping;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'master_mapping'
      AND policyname = 'master_mapping_select_authenticated'
  ) THEN
    CREATE POLICY master_mapping_select_authenticated
      ON public.master_mapping FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
