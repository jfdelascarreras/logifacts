# Apply multicarrier `charge_description_mappings` migration

> **Deprecated (taxonomy consolidation):** production taxonomy now lives only in **`master_mapping`**. Migration **`20260519140000_drop_charge_description_mappings_after_parity.sql`** removes **`charge_description_mappings`** after verifying parity. This document remains as a **historical checklist** for databases that still need to apply **`20260518193000_charge_description_mappings_carrier_standardized_charge.sql`** before that consolidation migration runs.

Use this checklist **before** running `pnpm dlx tsx supabase/seed.ts` (or any `onConflict: 'carrier,charge_description'` upsert) against **production**.

## Historical snapshot (Logifacts prod — **before** multicarrier migration)

| Item | Legacy schema |
|------|--------------------------|
| Columns | `charge_description`, `transportation_mode`, `category_1…5`, `id` (uuid), `created_at`, `updated_at` — **no** `carrier` / `standardized_charge` |
| Uniqueness | **`UNIQUE (charge_description)`** (`charge_description_mappings_charge_description_key`) |
| Composite index | **Not present** |

## Target state

- **`carrier`**: `text NOT NULL DEFAULT 'UPS'`
- **`standardized_charge`**: `text` nullable
- **Uniqueness**: **`UNIQUE (carrier, charge_description)`** (index `charge_description_mappings_carrier_charge_desc_uidx`)

## Instructions

### 1. Preflight — duplicate descriptions

Duplicate `charge_description` values would contradict the assumption that legacy rows become one UPS row each; resolve data before applying migration.

Run in SQL editor (or psql):

```sql
SELECT charge_description, count(*) AS n
FROM public.charge_description_mappings
GROUP BY 1
HAVING count(*) > 1;
```

If any rows return, merge or deduplicate manually, then rerun until **zero rows**.

### 2. Apply the migration

**Option A — Supabase CLI (linked project)**

From the repo root, with CLI logged in and project linked:

```bash
pnpm exec supabase db push
```

(Or `supabase migration up` depending on your Supabase CLI workflow.)  
Ensure the pushed history includes **`20260518193000_charge_description_mappings_carrier_standardized_charge.sql`**.

**Option B — Dashboard SQL**

Open **SQL Editor** in the Supabase project and execute the contents of:

`supabase/migrations/20260518193000_charge_description_mappings_carrier_standardized_charge.sql`

### 3. Verify

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'charge_description_mappings'
  AND column_name IN ('carrier', 'standardized_charge')
ORDER BY column_name;

-- Named UNIQUE constraints only (multicarrier may also surface as UNIQUE INDEX alone)
SELECT c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.relname = 'charge_description_mappings'
  AND c.contype = 'u';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'charge_description_mappings';
```

Expect:

- `carrier` and `standardized_charge` present  
- **`UNIQUE (carrier, charge_description)`** exists (typically via index `charge_description_mappings_carrier_charge_desc_uidx`)  
- Old **`UNIQUE (charge_description)`** constraint **dropped**

### 4. Run multicarrier seed / upserts

Only after verification:

```bash
pnpm dlx tsx supabase/seed.ts
```

Use **`SUPABASE_SERVICE_KEY`** for service-role upserts against RLS-protected tables.

---

## Post-migration + seed checkpoint (Logifacts prod)

_Last SQL verification **2026-05-18**._

### 1. Migration verified

| Criterion | Result |
|-----------|--------|
| **`carrier`** / **`standardized_charge`** columns | Present (`carrier NOT NULL DEFAULT 'UPS'`) |
| Old **`UNIQUE (charge_description)`** | Removed |
| **`UNIQUE (carrier, charge_description)`** | **`charge_description_mappings_carrier_charge_desc_uidx`** |
| Backfill **`carrier = 'UPS'`** for legacy rows | **0** blank/null carriers (**213** rows) |

### 2. Tables populated (`master_mapping` / `charge_description_mappings`)

Both tables: **213 rows** — consistent pair counts imply upserts ran without orphaning one side.  
**Gap:** **`standardized_charge`** was still unset on **all** rows → run seed from **`Master_Mapping_Consolidated_Updated*.xlsx`** (`pnpm dlx tsx supabase/seed.ts`) to load labels and any FedEx/WWE rows.

### 3. Row counts per carrier (current prod)

| `carrier` | `master_mapping` | `charge_description_mappings` |
|-----------|-----------------|--------------------------------|
| UPS | **213** | **213** |
| FedEx | — | — |
| WWE | — | — |

### Queries to re-validate

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'charge_description_mappings';

SELECT 'charge_description_mappings' AS tbl, carrier, COUNT(*) AS n
FROM public.charge_description_mappings GROUP BY carrier
UNION ALL
SELECT 'master_mapping', carrier, COUNT(*)
FROM public.master_mapping GROUP BY carrier
ORDER BY tbl, carrier;

SELECT
  COUNT(*) FILTER (WHERE standardized_charge IS NOT NULL AND TRIM(standardized_charge) <> '') AS with_std,
  COUNT(*) AS total
FROM public.charge_description_mappings;
```

## Rollback notes

Rolling back uniqueness is disruptive if FedEx/WWE rows already exist. Prefer restores from backup if you must revert after multicarrier data is loaded.
