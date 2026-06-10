-- Enforce referential integrity: link user_id → auth.users on tables that
-- predate explicit FK enforcement.
-- invoice_rows already has this constraint (20260514170000_invoice_rows.sql).
-- invoices.user_id was set NOT NULL in 20260604120000_schema_integrity_constraints.sql.

-- NOT NULL first — fail fast if orphaned rows somehow exist before we lock in the FK.
ALTER TABLE public.invoice_uploads        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.users_data             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.invoice_spend_by_date  ALTER COLUMN user_id SET NOT NULL;

-- FK constraints — idempotent via exception handler, matching the cascade
-- behaviour already in place on invoice_rows.
DO $$ BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.invoice_uploads
    ADD CONSTRAINT invoice_uploads_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.users_data
    ADD CONSTRAINT users_data_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.invoice_spend_by_date
    ADD CONSTRAINT invoice_spend_by_date_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
