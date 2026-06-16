-- Declare the invoice_lines → invoices FK explicitly at the storage layer.
-- RLS already enforces this relationship via EXISTS subquery, but a formal
-- FOREIGN KEY lets Postgres enforce it unconditionally and makes the schema
-- self-documenting for any tooling that inspects pg_constraint.

DO $$ BEGIN
  ALTER TABLE public.invoice_lines
    ADD CONSTRAINT invoice_lines_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
