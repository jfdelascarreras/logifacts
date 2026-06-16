# Logifacts — Database Reference

Supabase PostgreSQL · Project ref: `xsejivvwfyitkosaojtd`

---

## Tables at a glance

| Table | Purpose | Scope |
|-------|---------|-------|
| `master_mapping` | Carrier charge taxonomy (shared reference) | All users |
| `invoice_uploads` | Raw CSV files — one row per upload | Per user |
| `invoice_upload_analyses` | Full JSON analysis cache | Per user |
| `invoice_spend_by_date` | Pre-aggregated daily spend rollup | Per user |
| `invoice_rows` | Deduplicated structured charge lines | Per user |
| `invoices` | Multipart invoice header (FedEx / WWE ingest) | Per user |
| `invoice_lines` | Multipart invoice charge lines (FedEx / WWE ingest) | Per user |
| `users_data` | User profile and settings | Per user |
| `marketing_tbm` | Marketing / brand content | Per user |

---

## Entity Relationship

```
auth.users
  │
  ├── invoice_uploads          (user_id → auth.users CASCADE)
  │     │
  │     ├── invoice_upload_analyses  (invoice_upload_id → invoice_uploads)
  │     │
  │     └── invoice_rows             (invoice_upload_id → invoice_uploads SET NULL)
  │           ▲
  │           └── also linked via source_invoice_id ─────────────────┐
  │                                                                   │
  ├── invoices                 (user_id → auth.users CASCADE)         │
  │     │                                                             │
  │     └── invoice_lines      (invoice_id → invoices CASCADE)        │
  │     │                                                             │
  │     └─────────────────────────────────────────────── invoice_rows ┘
  │                            (source_invoice_id → invoices CASCADE)
  │
  ├── invoice_spend_by_date    (user_id → auth.users CASCADE)
  ├── users_data               (user_id → auth.users CASCADE)
  └── marketing_tbm            (user_id → auth.users CASCADE)

master_mapping                 (shared reference — no user_id)
```

---

## Table Reference

### `master_mapping`

Shared reference table. Maps every carrier charge description to the canonical taxonomy used for analysis and dashboards. Not user-scoped — all authenticated users read the same rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `carrier` | `text NOT NULL` | `'UPS'` · `'FedEx'` · `'WWE'` |
| `charge_description` | `text NOT NULL` | Exact string as it appears on invoices |
| `transportation_mode` | `text` | `'Parcel'` · `'LTL'` · `'Other'` |
| `category_1` | `text` | Top-level spend category |
| `category_2` | `text` | Secondary category |
| `category_3` | `text` | Tertiary category |
| `category_4` | `text` | Service-level detail |
| `category_5` | `text` | Leaf-level label |
| `standardized_charge` | `text` | Cross-carrier normalized charge name |

**Unique constraint:** `(carrier, charge_description)`

**RLS:** Authenticated users may SELECT. Writes are service-role only (seeded via migration).

**Rows:** ~249 covering UPS and FedEx charge descriptions. Updated by re-running `20260520110001_seed_master_mapping.sql` (idempotent `ON CONFLICT DO UPDATE`).

---

### `invoice_uploads`

One row per uploaded CSV file. Stores the raw content and a SHA-256 fingerprint for deduplication.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid NOT NULL` FK → `auth.users CASCADE` | |
| `original_file_name` | `text` | Cleaned of RFC 5987 encoding prefix |
| `csv_text` | `text` | Full raw CSV content |
| `row_count` | `integer` | Number of data rows |
| `status` | `upload_status` enum | `uploaded` · `processing` · `complete` · `failed`. Default `uploaded` |
| `content_sha256` | `text` | SHA-256 of normalized CSV for dedup |
| `created_at` | `timestamptz` | |

**Indexes:**
- `(user_id, content_sha256) WHERE content_sha256 IS NOT NULL` — dedup lookup

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE via `(select auth.uid()) = user_id`.

---

### `invoice_upload_analyses`

One JSON analysis result per upload. The dashboard reads the most recent row rather than re-computing from CSVs on every page load.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid NOT NULL` FK → `auth.users CASCADE` | |
| `invoice_upload_id` | `uuid` FK → `invoice_uploads` | Most recent upload at time of analysis (upsert key) |
| `summary` | `jsonb` | Full `InvoiceAnalysisSummary` — spend by month, category, carrier, filter metadata, ingest diagnostics |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Unique constraint:** `(invoice_upload_id)` — upsert target. Re-analyzing the same upload overwrites the row; uploading new files creates a new row.

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE.

**Cache:** Redis key `analysis:{userId}` (TTL 1 hour) mirrors the result. Invalidated on every `POST /api/invoices/analyze`.

---

### `invoice_spend_by_date`

Pre-aggregated daily spend. One row per `(user_id, invoice_date, account_number)`. Written only on unfiltered analysis runs.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid NOT NULL` FK → `auth.users CASCADE` | |
| `invoice_date` | `date NOT NULL` | |
| `account_number` | `text NOT NULL` | Carrier account number |
| `is_legacy_account` | `boolean NOT NULL` | `true` for rows that pre-date per-account rollups |
| `total_cost` | `numeric` | Sum of all charges for that day and account |
| `net_spend` | `numeric` | Mirrors `total_cost` currently |

**No explicit primary key.** Identity is the unique constraint below.

**Unique constraint:** `(user_id, invoice_date, account_number)`

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE.

**Write pattern:** Full delete-then-upsert on each unfiltered refresh — all rows for `user_id` are deleted then re-inserted from the freshly computed analysis in chunks of 400.

---

### `invoice_rows`

Deduplicated structured charge lines — the canonical, queryable version of raw invoice data. UPS rows sync on every unfiltered analyze run. FedEx/WWE rows sync on multipart upload.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `user_id` | `uuid NOT NULL` FK → `auth.users CASCADE` | |
| `invoice_upload_id` | `uuid` FK → `invoice_uploads SET NULL` | UPS source file. Nullable — rows are kept if the upload is deleted |
| `source_invoice_id` | `uuid` FK → `invoices CASCADE` | FedEx / WWE source. Nullable — UPS rows use `invoice_upload_id` instead |
| `row_hash` | `text NOT NULL` | Carrier-aware SHA-256 dedup key |
| `created_at` | `timestamptz NOT NULL` | |
| `account_number` | `text` | |
| `invoice_date` | `text` | Raw carrier date string (e.g. `'01/15/2025'`) |
| `invoice_number` | `text` | |
| `tracking_number` | `text` | |
| `charge_category_code` | `text` | e.g. `'INF'` · `'ICC'` |
| `charge_category_detail_code` | `text` | |
| `charge_classification_code` | `text` | e.g. `'FRT'` · `'ACC'` |
| `charge_description_code` | `text` | |
| `charge_description` | `text` | |
| `net_amount` | `numeric` | |
| `invoice_amount` | `numeric` | |
| `duty_amount` | `numeric` | |
| `billed_weight` | `numeric` | |
| `entered_weight` | `numeric` | |
| `package_quantity` | `integer` | |
| `zone` | `text` | |
| `carrier_name` | `text` | |
| `original_service_description` | `text` | |
| `lead_shipment_number` | `text` | |
| `shipment_reference_number_1` | `text` | |

**Unique constraint:** `(user_id, row_hash)` — natural dedup key. Upserts on conflict are ignored.

**Indexes:**
- `(user_id, invoice_date)` — date-range queries
- `(user_id, account_number)` — account filter queries
- `(invoice_upload_id) WHERE invoice_upload_id IS NOT NULL` — upload-scoped lookups
- `(source_invoice_id) WHERE source_invoice_id IS NOT NULL` — multipart invoice lookups

**RLS:** Per-user SELECT / INSERT / DELETE. No UPDATE policy — rows are append-only; re-sync deletes and re-inserts.

**Note on `invoice_date`:** Stored as `text` intentionally — carrier date formats vary (`MM/DD/YYYY`, `YYYY-MM-DD`, etc.) and are normalized at analysis time, not at ingest.

---

### `invoices`

Header record for multipart invoice ingest (FedEx and WWE). One row per uploaded invoice file. Created by `POST /api/invoices/upload`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid NOT NULL` FK → `auth.users CASCADE` | |
| `carrier` | `text` | `'FedEx'` · `'WWE'` |
| `invoice_number` | `text` | |
| `invoice_date` | `text` | |
| `filename` | `text` | |
| `upload_status` | `text` | |
| `total_amount` | `numeric` | |
| `created_at` | `timestamptz` | |

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE.

---

### `invoice_lines`

Individual charge lines from multipart invoice ingest. One row per charge line within an `invoices` record.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `invoice_id` | `uuid NOT NULL` FK → `invoices CASCADE` | |
| `carrier` | `text` | |
| `charge_description` | `text` | |
| `standardized_charge` | `text` | From `master_mapping` lookup |
| `transportation_mode` | `text` | |
| `category_1–5` | `text` | Taxonomy hierarchy from `master_mapping` |
| `charge_amount` | `numeric` | |
| `shipment_date` | `text` | |
| `zone` | `text` | |
| `destination_state` | `text` | |
| `service_level` | `text` | |
| `reference_1` | `text` | |
| `mapped` | `boolean` | `true` if a `master_mapping` entry was found |
| `charge_classification_code` | `text` | `'FRT'` · `'ACC'` — for Accessorials KPI |
| `charge_category_code` | `text` | `'INF'` · `'ICC'` — excluded from Accessorials |
| `package_quantity` | `integer` | For Total Volume KPI |
| `created_at` | `timestamptz NOT NULL` | |

**Indexes:**
- `(invoice_id, charge_classification_code, charge_category_code)` — KPI filter queries

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE. Ownership verified via join to `invoices.user_id`.

---

### `users_data`

User profile and account settings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid NOT NULL` FK → `auth.users CASCADE` | |
| *(other profile columns)* | | Created before migration history; see live schema |

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE.

---

### `marketing_tbm`

Marketing and brand content store. Currently dormant — no active app references.

**RLS:** Per-user SELECT / INSERT / UPDATE / DELETE.

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `master_mapping` | All authenticated | Service role | Service role | Service role |
| `invoice_uploads` | Own | Own | Own | Own |
| `invoice_upload_analyses` | Own | Own | Own | Own |
| `invoice_spend_by_date` | Own | Own | Own | Own |
| `invoice_rows` | Own | Own | — | Own |
| `invoices` | Own | Own | Own | Own |
| `invoice_lines` | Via parent invoice | Via parent invoice | Via parent invoice | Via parent invoice |
| `users_data` | Own | Own | Own | Own |
| `marketing_tbm` | Own | Own | Own | Own |

**Pattern:** All user-scoped policies use `TO authenticated` and `(select auth.uid()) = user_id` (subquery form for planner efficiency). `invoice_lines` ownership is checked via `EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND user_id = auth.uid())`.

---

## Data Flow: Upload → Dashboard

```
1. User selects CSV files
   ├── Client computes content_sha256 per file
   ├── Skip files already in invoice_uploads (same hash)
   └── INSERT invoice_uploads (csv_text, row_count, status='uploaded', content_sha256)

2. User triggers Refresh
   └── POST /api/invoices/analyze
       ├── SELECT invoice_uploads metadata (no csv_text yet — avoids timeout)
       ├── Backfill missing content_sha256 hashes
       ├── Check in-memory parse cache (key = userId + upload fingerprints)
       │    ├── Hit  → skip re-parsing
       │    └── Miss → fetch csv_text in batches of 10
       │              → parse + filter + deduplicate rows
       │              → populate parse cache
       ├── Apply any active dashboard filters
       ├── computeInvoiceAnalysisSummary()
       ├── UPSERT invoice_upload_analyses  (full JSON summary)
       ├── DELETE + UPSERT invoice_spend_by_date  (skipped when filters active)
       ├── Sync invoice_rows for UPS  (skipped when filters active)
       └── Invalidate Redis key  analysis:{userId}

3. Dashboard loads
   └── GET /api/invoices/analyze
       ├── Redis hit  → return immediately  (TTL: 1 hour)
       └── Redis miss → SELECT invoice_upload_analyses ORDER BY updated_at DESC
                      → store in Redis → return
```

---

## Migration History

The initial tables (`invoice_uploads`, `invoice_upload_analyses`, `invoice_spend_by_date`, `master_mapping`) were created manually in the Supabase dashboard — `20260326151151_remote_schema.sql` is an empty placeholder. All subsequent migrations are alter-only or create-if-not-exists.

| Migration | What it does |
|-----------|-------------|
| `20260326151151` | Empty placeholder for manual initial schema |
| `20260508123000` | Enable RLS + initial per-user policies on upload tables |
| `20260508124000` | Assign Club Colors data to `jfdelascarreras` account |
| `20260508125500` | Re-apply RLS policies idempotently |
| `20260508160000` | Add `content_sha256` column + index to `invoice_uploads` |
| `20260508235000` | Drop FK from `invoice_spend_by_date` to `dim_date` |
| `20260509120000` | Add `account_number` to `invoice_spend_by_date`; rebuild unique index |
| `20260514170000` | Create `invoice_rows` table with full DDL, indexes, and RLS |
| `20260515210000` | Add KPI classification columns to `invoice_lines` |
| `20260518193000` | Add `carrier` + `standardized_charge` columns to `charge_description_mappings` |
| `20260519140000` | Drop `charge_description_mappings` after verifying parity with `master_mapping` |
| `20260520104500` | Add UPDATE RLS policy to `invoice_lines` |
| `20260520110000` | Ensure `master_mapping` exists as a BASE TABLE |
| `20260520110001` | Seed `master_mapping` with full taxonomy (idempotent) |
| `20260604100000` | Remove duplicate RLS policies on `invoice_spend_by_date` |
| `20260604100100` | Rename `master_mapping` policy to `_authenticated`; restrict to `authenticated` role |
| `20260604100200` | Drop unused `dim_date` table |
| `20260604100300` | Revoke public execute on `rls_auto_enable()`; pin `set_updated_at` search_path |
| `20260604100400` | Repair migration history for `20260520110000/1` |
| `20260604110000` | Standardize all RLS policies — `authenticated` role + `(select auth.uid())` initplan pattern |
| `20260604110100` | Add sparse index on `invoice_rows.invoice_upload_id` |
| `20260604120000` | Convert `upload_status` to enum; NOT NULL on ownership columns; `is_legacy_account` flag |
| `20260604120100` | Sync migration version history |
| `20260605100000` | Add `source_invoice_id` FK on `invoice_rows` for FedEx/WWE multipart ingest |
| `20260605110000` | Add `user_id → auth.users` FK + NOT NULL on `invoices`, `invoice_uploads`, `users_data`, `invoice_spend_by_date` |
| `20260605120000` | Drop `(legacy)` sentinel default from `invoice_spend_by_date.account_number` |
| `20260605130000` | Retype monetary/weight columns to `numeric`, `package_quantity` to `integer` in `invoice_rows` |
| `20260605140000` | Declare explicit `invoice_lines.invoice_id → invoices(id)` FK |

### Applying migrations

```bash
supabase link --project-ref xsejivvwfyitkosaojtd
supabase db push
```

---

## Removed Tables

| Table | Removed by | Reason |
|-------|-----------|--------|
| `dim_date` | `20260604100200` | Unused — 0 rows, no FK references |
| `charge_description_mappings` | `20260519140000` | Consolidated into `master_mapping` |
