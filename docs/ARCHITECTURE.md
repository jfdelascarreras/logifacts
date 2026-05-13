# Logifacts — system architecture

This document describes how the **Premium Analysis** invoice flow fits together: upload, storage, analysis, caching, and how we **prove numeric accuracy** in automated tests.

---

## High-level diagram

```mermaid
flowchart LR
  subgraph browser [Browser]
    Upload[Invoice CSV upload UI]
  end

  subgraph next [Next.js]
    API[POST /api/invoices/analyze]
    Lib["lib/invoices/*\nparse · dedupe · aggregate"]
  end

  subgraph supa [Supabase PostgreSQL]
    Up[invoice_uploads]
    Map[charge_description_mappings]
    Spend[invoice_spend_by_date]
    Ana[invoice_upload_analyses]
  end

  Upload -->|insert csv_text + hash| Up
  Upload -->|Refresh analysis| API
  API --> Up
  API --> Map
  Lib --> API
  API --> Spend
  API --> Ana
```

**Principle:** raw invoices live in **`invoice_uploads`**; dashboard metrics are **derived** and stored in **`invoice_spend_by_date`** (daily rollup) and **`invoice_upload_analyses`** (full JSON summary cache). The **canonical business rules** for those derived values live in **`lib/invoices/analysis-summary.ts`** (pure TypeScript), not in SQL triggers.

---

## Folder structure (invoice domain)

| Location | Role |
|----------|------|
| `app/components/invoices/` | Upload UI (`invoice-csv-upload.tsx`) — client-side parse for row count, dedupe, Supabase insert. |
| `app/api/invoices/analyze/` | `route.ts` — auth, load uploads + mappings, call aggregation engine, write spend + analysis cache. |
| `lib/invoices/` | **Domain module**: CSV layout (`headers.ts`), parsing/filtering (`csv.ts`), content hash for dedupe (`dedupe-hash.ts`), **aggregation engine** (`analysis-summary.ts`), server hash helper (`dedupe-hash-server.ts`). Public entry: `lib/invoices/index.ts`. |
| `lib/invoices/analysis-summary.test.ts` | **Accuracy proofs** (Vitest) — same engine as production API. |
| `Invoices skills/` | **Offline** Excel mappings + optional Python tooling — **not** in the live web request path unless you wire them separately. |

---

## End-to-end process

### 1. Upload (`invoice_uploads`)

1. User selects one or more UPS-style CSV files (250-column layout; see `lib/invoices/headers.ts`).
2. Client reads file text, runs `parseInvoiceCsvText` to ensure rows parse and to compute **`row_count`**.
3. **Dedupe before insert**
   - **Same file name** already stored for this user (or duplicated in the batch) → skip.
   - **Same normalized content** (SHA-256 of normalized text; see `dedupe-hash.ts`) → skip, even if the file name differs (“duplicate folder” uploads).
4. Successful files are inserted with `user_id`, `original_file_name`, `csv_text`, `row_count`, `content_sha256`, `status`.
5. **Automatic analyze** — After a successful insert, the upload UI calls **`POST /api/invoices/analyze`** and dispatches a browser event so **`PremiumDashboard`** refreshes without a separate “analyze” button. Manual full recompute is **Refresh analysis** on the dashboard only.

Row-level **Sender Company Name** in storage is still whatever the carrier export contained; see analysis step for the user-profile override.

### 2. Analyze (`POST /api/invoices/analyze`)

1. **Authenticate** — Supabase session required.
2. **Load uploads** for the user (bounded batch, ordered by recency).
3. **Backfill `content_sha256`** when missing (legacy rows) using `dedupe-hash-server.ts` so future dedupe stays consistent.
4. **Parse & normalize rows**
   - `parseInvoiceCsvText` on each upload’s `csv_text`.
   - `filterRowsLikeClubColorsPowerQuery` — aligns with the Power Query–style filter (drop invalid/system rows).
   - `applyProfileSenderCompanyName` — if `user.user_metadata.company_name` is set, every row’s `Sender Company Name` is replaced for reporting consistency.
5. **Load mappings** from `charge_description_mappings` and build a lookup (`buildChargeDescriptionLookup`).
6. **Aggregate** with `computeInvoiceAnalysisSummary` in `analysis-summary.ts` — **single source of truth** for totals, fuel/accessorial splits, carrier/service, daily/monthly spend, category/mode/weight buckets, package dedupe by shipment key, weight gap, etc.
7. **Persist results**
   - Replace user rows in `invoice_spend_by_date` from the computed daily series.
   - Upsert `invoice_upload_analyses` (summary JSON, keyed by latest `invoice_upload_id` while values aggregate across uploads in that run).

### 3. Read path (dashboard)

Premium Analysis UI loads cached analysis and/or recomputes display from stored JSON spend — implementation lives under `app/components/analysis/` and calls `GET`/`POST` `/api/invoices/analyze` as wired today.

---

## Accuracy proofs (testing strategy)

**Goal:** Production numbers must match a **tested, deterministic** implementation, not an ad hoc copy in the route handler.

| Mechanism | Details |
|-----------|---------|
| **Pure engine** | `computeInvoiceAnalysisSummary` has **no** database or network calls. |
| **Co-located tests** | `lib/invoices/analysis-summary.test.ts` runs with **Vitest** (`pnpm test`). |
| **Golden-style cases** | Synthetic rows with hand-checked expectations for `totalCost`, `fuelCost`, `costAccessorials`, package dedupe, etc. |
| **Pipeline smoke** | Full 250-column CSV line → parse → filter → profile sender. |

**How to extend proofs for a “real product”:** add a **redacted real CSV snippet** under `lib/invoices/fixtures/` (or similar) and assert expected measures using a **frozen subset** of `charge_description_mappings`, or a signed-off JSON expected summary from finance/Power BI.

---

## Technology choices (invoice path)

| Concern | Choice |
|---------|--------|
| **Runtime for business logic** | **TypeScript** (`lib/invoices`) in the Next.js server. |
| **Persistence & auth** | **Supabase** (Postgres + RLS + Auth `user_metadata.company_name`). |
| **Python** | Optional for **download/ETL** under `Invoices skills/` — **not** required for the standard in-app upload → analyze loop. |

---

## Operational notes

- **Re-run analysis** whenever new files are uploaded; the API aggregates over the current batch of uploads (subject to the route’s limit).
- **Mapping changes** in `charge_description_mappings` change outcomes for the next analyze; for auditability, consider versioning mappings or storing a `mapping_revision` on analysis records (future enhancement).

---

## Related commands

```bash
pnpm test          # accuracy proofs (Vitest)
pnpm build         # production compile check
```

For Next.js and framework conventions, follow `AGENTS.md` and the local Next.js docs referenced there.
