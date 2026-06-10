-- Align schema_migrations with repo filenames after MCP-applied equivalents.
-- Idempotent: skips versions already recorded.

INSERT INTO supabase_migrations.schema_migrations (version, name)
SELECT v, n
FROM (VALUES
  ('20260604100000', 'cleanup_invoice_spend_by_date_rls'),
  ('20260604100100', 'master_mapping_rls_authenticated'),
  ('20260604100200', 'drop_unused_dim_date'),
  ('20260604100300', 'harden_db_functions'),
  ('20260604100400', 'repair_migration_history'),
  ('20260604110000', 'rls_standardize_user_tables'),
  ('20260604110100', 'index_invoice_rows_upload_fk'),
  ('20260604120000', 'schema_integrity_constraints')
) AS t(v, n)
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = t.v
);
