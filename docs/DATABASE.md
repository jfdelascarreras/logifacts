# Logifacts — Database Reference

Complete schema, relationships, RLS rules, and data-flow notes for the Supabase PostgreSQL database.

Project ref: `xsejivvwfyitkosaojtd`

---

## Tables at a glance

| Table | Purpose | Row scope |
|-------|---------|-----------|
| `master_mapping` | Canonical charge taxonomy (reference) | Shared — all users |
| `invoice_uploads` | Raw CSV storage — one row per uploaded file | Per user |
| `invoice_upload_analyses` | Full JSON analysis cache | Per user |
| `invoice_spend_by_date` | Daily spend rollup (derived, pre-aggregated) | Per user |
| `invoice_rows` | Structured charge lines (deduplicated) | Per user |
| `invoices` | *(deprecated)* multipart ingest header | Per user |
| `invoice_lines` | *(deprecated)* multipart ingest lines | Per user |

---

## Active tables

### `master_mapping`

Reference table. Maps every carrier charge description to the canonical taxonomy used throughout the app. Shared across all users — no `user_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `carrier` | `text NOT NULL` | Default `'UPS'`. Values: `'UPS'`, `'FedEx'`, `'WWE'` |
| `charge_description` | `text NOT NULL` | Exact string as it appears on the invoice |
| `transportation_mode` | `text` | e.g. `'Parcel'`, `'LTL'`, `'Other'` |
| `category_1` | `text` | Top-level spend category |
| `category_2` | `text` | Secondary category |
| `category_3` | `text` | Tertiary category |
| `category_4` | `text` | Service-level detail |
| `category_5` | `text` | Leaf-level detail |
| `standardized_charge` | `text` | Cross-carrier normalized label for multicarrier rollups |

**Constraints:** `UNIQUE (carrier, charge_description)`

**RLS:** `ENABLE ROW LEVEL SECURITY`. Policy `master_mapping_select_authenticated` — `authenticated` role may `SELECT`, no restrictions. Service role only for writes (seed script).

**Row count:** ~249 rows covering UPS and FedEx charge descriptions.

**Seeded by:** `supabase/seed.ts` and migration `20260520110001_seed_master_mapping.sql` (idempotent `ON CONFLICT DO UPDATE`).

---

### `invoice_uploads`

One row per uploaded CSV file. Stores the raw `csv_text` and a content fingerprint for deduplication.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `auth.users` | |
| `original_file_name` | `text` | Cleaned of RFC 5987 encoding prefix |
| `csv_text` | `text` | Full raw CSV content |
| `row_count` | `int` | Number of data rows |
| `status` | `text` | Upload processing status |
| `content_sha256` | `text` | SHA-256 of normalized CSV; used to skip duplicate files |
| `created_at` | `timestamptz` | |

**Indexes:**
- `invoice_uploads_user_content_sha256_idx` on `(user_id, content_sha256) WHERE content_sha256 IS NOT NULL`

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE via `auth.uid() = user_id`.

**Deduplication:** Before inserting, the client computes `content_sha256` (`normalizeCsvForDedupe` + `sha256HexUtf8` from `lib/invoices/dedupe-hash.ts`). Rows already in the DB with the same hash are skipped client-side. Rows missing a hash on the server side get it backfilled during the next analysis run.

---

### `invoice_upload_analyses`

One row per user. Stores the full computed analysis JSON so the dashboard can load it instantly without re-parsing CSVs. Upserted (keyed by `invoice_upload_id`) on every Refresh.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `auth.users` | |
| `invoice_upload_id` | `uuid` FK → `invoice_uploads` | Points to the user's most recent upload at time of analysis |
| `summary` | `jsonb` | Full `InvoiceAnalysisSummary` — monthly spend, category breakdowns, filter metadata, ingest diagnostics |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Constraints:** `UNIQUE (invoice_upload_id)` — upsert target.

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE via `auth.uid() = user_id`.

**Cache layer:** Redis key `analysis:${userId}` mirrors this row. Invalidated on every `POST /api/invoices/analyze`. If Redis misses, the GET falls back to this table.

---

### `invoice_spend_by_date`

Pre-aggregated daily spend. One row per `(user_id, invoice_date, account_number)`. Written by `POST /api/invoices/analyze` **only when no filters are active** (filtered runs update the JSON summary only).

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid` | |
| `invoice_date` | `date` | |
| `account_number` | `text NOT NULL` | Default `'(legacy)'` for rows pre-dating multi-account support |
| `total_cost` | `numeric` | Sum of all charges for that day / account |
| `net_spend` | `numeric` | Same as `total_cost` currently |

**Constraints:** `UNIQUE (user_id, invoice_date, account_number)` (replaces an earlier unique index that didn't include `account_number`).

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE via `auth.uid() = user_id`.

**Write pattern:** Full delete-then-upsert on each unfiltered refresh. The API deletes all rows for `user_id` then inserts the newly computed set in chunks of 400.

**No FK to `dim_date`:** The foreign key to a `dim_date` calendar dimension was dropped (migration `20260508235000`) to prevent write failures when invoice dates fall outside the calendar range.

---

### `invoice_rows`

Structured, deduplicated charge lines. Populated during the multipart ingest path (now deprecated for new uploads; see §Deprecated). Retained as a source for category breakdowns.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `user_id` | `uuid` FK → `auth.users ON DELETE CASCADE` | |
| `invoice_upload_id` | `uuid` FK → `invoice_uploads ON DELETE SET NULL` | Nullable — rows survive if source upload is deleted |
| `row_hash` | `text NOT NULL` | SHA-256 of natural key `(invoice_number, tracking_number, charge_category_code, charge_category_detail_code, net_amount)` |
| `created_at` | `timestamptz` | |
| `account_number` | `text` | |
| `invoice_date` | `text` | |
| `invoice_number` | `text` | |
| `tracking_number` | `text` | |
| `charge_category_code` | `text` | |
| `charge_category_detail_code` | `text` | |
| `charge_classification_code` | `text` | e.g. `'FRT'`, `'ACC'` |
| `charge_description_code` | `text` | |
| `charge_description` | `text` | |
| `net_amount` | `text` | Stored as text to avoid coercion at ingest |
| `invoice_amount` | `text` | |
| `duty_amount` | `text` | |
| `billed_weight` | `text` | |
| `entered_weight` | `text` | |
| `package_quantity` | `text` | |
| `zone` | `text` | |
| `carrier_name` | `text` | |
| `original_service_description` | `text` | |
| `lead_shipment_number` | `text` | |
| `shipment_reference_number_1` | `text` | |

**Constraints:** `UNIQUE (user_id, row_hash)` — natural deduplication key.

**Indexes:** `(user_id, invoice_date)`, `(user_id, account_number)`

**RLS:** SELECT / INSERT / DELETE per user. **No UPDATE policy** — treat as append-only.

---

## Deprecated tables

These tables still exist in the cloud database but must not be used for new features.

### `invoices`

Header record for the deprecated multipart ingest path. One row per uploaded invoice file via `POST /api/invoices/upload`. Fields: `id`, `user_id`, `carrier`, `invoice_number`, `invoice_date`, `filename`, `upload_status`, `total_amount`, `created_at`.

### `invoice_lines`

Individual charge lines from the multipart ingest path. Linked to `invoices.id`. Fields mirror `InvoiceLine` in `types/invoice.ts`: `id`, `invoice_id`, `carrier`, `charge_description`, taxonomy columns, `charge_amount`, shipment metadata, `mapped`, KPI classification columns. Has RLS SELECT / INSERT / DELETE / UPDATE (UPDATE added by migration `20260520104500`).

**Do not build new features on `invoices` or `invoice_lines`.** All ingestion goes through `invoice_uploads`.

---

## Removed tables

### `charge_description_mappings`

Dropped by migration `20260519140000_drop_charge_description_mappings_after_parity.sql` after all rows were verified to exist in `master_mapping`. Do not reference or recreate. Its successor is `master_mapping`.

---

## Relationships

```
auth.users
  │
  ├─── invoice_uploads (user_id)
  │         │
  │         └─── invoice_upload_analyses (invoice_upload_id → most recent upload)
  │         └─── invoice_rows (invoice_upload_id, nullable)
  │
  ├─── invoice_spend_by_date (user_id)
  │
  └─── invoice_rows (user_id, CASCADE delete)

master_mapping   ← shared reference, no user_id
```

---

## Row-level security summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `master_mapping` | All authenticated users | Service role only | Service role only | Service role only |
| `invoice_uploads` | Own rows | Own rows | Own rows | Own rows |
| `invoice_upload_analyses` | Own rows | Own rows | Own rows | Own rows |
| `invoice_spend_by_date` | Own rows | Own rows | Own rows | Own rows |
| `invoice_rows` | Own rows | Own rows | — *(no policy)* | Own rows |
| `invoices` | Via invoice ownership | Via invoice ownership | Via invoice ownership | Via invoice ownership |
| `invoice_lines` | Via invoice ownership | Via invoice ownership | Via invoice ownership | Via invoice ownership |

"Own rows" = `auth.uid() = user_id`. "Via invoice ownership" = verified through a join to `invoices.user_id`.

---

## Migration history

All migration files are in `supabase/migrations/`. The first migration (`20260326151151_remote_schema.sql`) is empty — the original tables (`invoice_uploads`, `invoice_upload_analyses`, `invoice_spend_by_date`, `master_mapping`) were created manually in the Supabase dashboard and were not captured in a migration. Subsequent migrations are alter-only or create-if-not-exists.

| Migration | What it does |
|-----------|-------------|
| `20260326151151_remote_schema.sql` | Empty — placeholder for initial manual schema |
| `20260508123000` | Enables RLS + creates per-user policies for `invoice_uploads`, `invoice_upload_analyses`, `invoice_spend_by_date` |
| `20260508124000` | Reassigns Club Colors data to the jfdelascarreras account (data migration) |
| `20260508125500` | Re-applies RLS policies idempotently |
| `20260508160000` | Adds `content_sha256` column and index to `invoice_uploads` |
| `20260508235000` | Drops the FK from `invoice_spend_by_date` to `dim_date` |
| `20260509120000` | Adds `account_number` to `invoice_spend_by_date`; rebuilds unique index |
| `20260514170000` | Creates `invoice_rows` table with full DDL |
| `20260515210000` | Adds KPI classification columns to `invoice_lines` |
| `20260518193000` | Adds `carrier` and `standardized_charge` columns to `charge_description_mappings` (pre-drop prep) |
| `20260519140000` | Drops `charge_description_mappings` after verifying parity with `master_mapping` |
| `20260520104500` | Adds UPDATE RLS policy to `invoice_lines` |
| `20260520110000` | Ensures `master_mapping` exists as a BASE TABLE (handles VIEW → TABLE upgrade) |
| `20260520110001` | Seeds `master_mapping` with full taxonomy (idempotent `ON CONFLICT DO UPDATE`) |

### Applying migrations

Migrations are not auto-applied. Use the Supabase SQL Editor to run them manually, or `npx supabase db push` after `npx supabase link --project-ref xsejivvwfyitkosaojtd`.

---

## Data flow: upload → dashboard

```
1. User uploads CSV
   └── client: sha256 dedup check
   └── INSERT invoice_uploads (csv_text, content_sha256)

2. User clicks "Refresh analysis"
   └── POST /api/invoices/analyze
       ├── SELECT invoice_uploads (metadata only, then csv_text in batches of 10)
       ├── SELECT master_mapping (full table, cached in memory by fingerprint)
       ├── parse + filter + dedupe + aggregate  [lib/invoices/]
       ├── UPSERT invoice_upload_analyses (full JSON summary)
       ├── DELETE + INSERT invoice_spend_by_date  (only if no filters active)
       └── invalidate Redis key  analysis:{userId}

3. Dashboard loads
   └── GET /api/invoices/analyze
       ├── Redis hit → return immediately
       └── Redis miss → SELECT invoice_upload_analyses → cache in Redis
```
