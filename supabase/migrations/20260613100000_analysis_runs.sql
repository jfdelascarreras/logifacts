-- Sprint 4: audit trail for premium analysis refreshes.

CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  ingest_source   text,
  total_cost      numeric,
  line_count      integer,
  shipment_count  integer,
  savings_high    numeric,
  unmapped_pct    numeric,
  duration_ms     integer,
  filters         jsonb
);

CREATE INDEX IF NOT EXISTS analysis_runs_user_created_idx
  ON public.analysis_runs (user_id, created_at DESC);

ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_runs_select_own
  ON public.analysis_runs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY analysis_runs_insert_own
  ON public.analysis_runs FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
