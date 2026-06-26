-- rate_versions has RLS enabled but zero policies, making the table
-- completely inaccessible — all queries return zero rows.
--
-- The table is read-only reference data (carrier rate file ledger).
-- All authenticated users may read it; writes go through service role only.

CREATE POLICY "rate_versions: authenticated read"
  ON public.rate_versions
  FOR SELECT
  TO authenticated
  USING (true);
