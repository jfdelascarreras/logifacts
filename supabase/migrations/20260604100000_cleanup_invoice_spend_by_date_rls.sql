-- Phase 0.1: Remove duplicate RLS policies on invoice_spend_by_date.
-- Keep one authenticated-scoped set with (select auth.uid()) for planner efficiency.

DROP POLICY IF EXISTS "Users can read their spend by date" ON public.invoice_spend_by_date;
DROP POLICY IF EXISTS "Users can insert their spend by date" ON public.invoice_spend_by_date;
DROP POLICY IF EXISTS "Users can update their spend by date" ON public.invoice_spend_by_date;
DROP POLICY IF EXISTS "Users can delete their spend by date" ON public.invoice_spend_by_date;

DROP POLICY IF EXISTS invoice_spend_by_date_select_own ON public.invoice_spend_by_date;
DROP POLICY IF EXISTS invoice_spend_by_date_insert_own ON public.invoice_spend_by_date;
DROP POLICY IF EXISTS invoice_spend_by_date_update_own ON public.invoice_spend_by_date;
DROP POLICY IF EXISTS invoice_spend_by_date_delete_own ON public.invoice_spend_by_date;

CREATE POLICY invoice_spend_by_date_select_own
  ON public.invoice_spend_by_date FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY invoice_spend_by_date_insert_own
  ON public.invoice_spend_by_date FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_spend_by_date_update_own
  ON public.invoice_spend_by_date FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_spend_by_date_delete_own
  ON public.invoice_spend_by_date FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
