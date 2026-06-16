-- Phase 2: Standardize RLS — authenticated role + (select auth.uid()) initplan pattern.

-- invoice_uploads -------------------------------------------------------------
DROP POLICY IF EXISTS invoice_uploads_select_own ON public.invoice_uploads;
DROP POLICY IF EXISTS invoice_uploads_insert_own ON public.invoice_uploads;
DROP POLICY IF EXISTS invoice_uploads_update_own ON public.invoice_uploads;
DROP POLICY IF EXISTS invoice_uploads_delete_own ON public.invoice_uploads;

CREATE POLICY invoice_uploads_select_own
  ON public.invoice_uploads FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY invoice_uploads_insert_own
  ON public.invoice_uploads FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_uploads_update_own
  ON public.invoice_uploads FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_uploads_delete_own
  ON public.invoice_uploads FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- invoice_upload_analyses -----------------------------------------------------
DROP POLICY IF EXISTS invoice_upload_analyses_select_own ON public.invoice_upload_analyses;
DROP POLICY IF EXISTS invoice_upload_analyses_insert_own ON public.invoice_upload_analyses;
DROP POLICY IF EXISTS invoice_upload_analyses_update_own ON public.invoice_upload_analyses;
DROP POLICY IF EXISTS invoice_upload_analyses_delete_own ON public.invoice_upload_analyses;

CREATE POLICY invoice_upload_analyses_select_own
  ON public.invoice_upload_analyses FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY invoice_upload_analyses_insert_own
  ON public.invoice_upload_analyses FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_upload_analyses_update_own
  ON public.invoice_upload_analyses FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_upload_analyses_delete_own
  ON public.invoice_upload_analyses FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- invoice_rows ----------------------------------------------------------------
DROP POLICY IF EXISTS "invoice_rows: users read own rows" ON public.invoice_rows;
DROP POLICY IF EXISTS "invoice_rows: users insert own rows" ON public.invoice_rows;
DROP POLICY IF EXISTS "invoice_rows: users delete own rows" ON public.invoice_rows;

CREATE POLICY invoice_rows_select_own
  ON public.invoice_rows FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY invoice_rows_insert_own
  ON public.invoice_rows FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoice_rows_delete_own
  ON public.invoice_rows FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- invoices --------------------------------------------------------------------
DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
DROP POLICY IF EXISTS invoices_insert_own ON public.invoices;
DROP POLICY IF EXISTS invoices_update_own ON public.invoices;
DROP POLICY IF EXISTS invoices_delete_own ON public.invoices;

CREATE POLICY invoices_select_own
  ON public.invoices FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY invoices_insert_own
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoices_update_own
  ON public.invoices FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY invoices_delete_own
  ON public.invoices FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- invoice_lines (ownership via parent invoice) --------------------------------
DROP POLICY IF EXISTS invoice_lines_select_own ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_insert_own ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_update_own ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_delete_own ON public.invoice_lines;

CREATE POLICY invoice_lines_select_own
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.user_id = (select auth.uid())
  ));

CREATE POLICY invoice_lines_insert_own
  ON public.invoice_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.user_id = (select auth.uid())
  ));

CREATE POLICY invoice_lines_update_own
  ON public.invoice_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.user_id = (select auth.uid())
  ));

CREATE POLICY invoice_lines_delete_own
  ON public.invoice_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.user_id = (select auth.uid())
  ));

-- users_data ------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_own ON public.users_data;
DROP POLICY IF EXISTS users_insert_own ON public.users_data;
DROP POLICY IF EXISTS users_update_own ON public.users_data;
DROP POLICY IF EXISTS users_delete_own ON public.users_data;

CREATE POLICY users_select_own
  ON public.users_data FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY users_insert_own
  ON public.users_data FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY users_update_own
  ON public.users_data FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY users_delete_own
  ON public.users_data FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- marketing_tbm ---------------------------------------------------------------
DROP POLICY IF EXISTS marketing_content_select_own ON public.marketing_tbm;
DROP POLICY IF EXISTS marketing_content_insert_own ON public.marketing_tbm;
DROP POLICY IF EXISTS marketing_content_update_own ON public.marketing_tbm;
DROP POLICY IF EXISTS marketing_content_delete_own ON public.marketing_tbm;

CREATE POLICY marketing_content_select_own
  ON public.marketing_tbm FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY marketing_content_insert_own
  ON public.marketing_tbm FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY marketing_content_update_own
  ON public.marketing_tbm FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY marketing_content_delete_own
  ON public.marketing_tbm FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
