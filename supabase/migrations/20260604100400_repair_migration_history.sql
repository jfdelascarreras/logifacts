-- Phase 1: Record migrations applied manually / before db push sync.

INSERT INTO supabase_migrations.schema_migrations (version, name)
SELECT v, n
FROM (VALUES
  ('20260520110000', 'ensure_master_mapping_table'),
  ('20260520110001', 'seed_master_mapping')
) AS t(v, n)
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = t.v
);
