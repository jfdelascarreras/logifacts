-- Phase 0.3: Remove unused dim_date (0 rows, no FK references, RLS enabled with no policies).

DROP TABLE IF EXISTS public.dim_date;
