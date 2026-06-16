# Premium Analysis: how calculation works

This document describes **how invoice CSV data becomes dashboard totals** for **Premium Analysis**: reading uploads, preprocessing rows, joining mappings, and aggregating metrics.

Use it to compare behavior with another tool or chat (Power BI, Python notebooks, etc.).

**Accuracy audit:** [`PREMIUM_ANALYSIS_AUDIT.md`](./PREMIUM_ANALYSIS_AUDIT.md)  
**Offline Python (canonical):** `python3 scripts/run_invoice_analysis.py --golden`  
Requires `pandas`, `openpyxl`, `xlrd` (same as legacy scripts).

---

## Scope

- **In scope:** `POST /api/invoices/analyze` → compute path that reads **`invoice_uploads.csv_text`**, parses CSV rows, optionally applies dashboard filters, then runs **`computeInvoiceAnalysisSummary`**.
- **Partially shared:** ingest via **`POST /api/invoices/upload`** (FedEx/WWE Excel + UPS CSV under `lib/invoices/parsers/`) persists invoice lines mapped with **`master_mapping`**. Premium Analysis aggregates **UPS-style `csv_text` in `invoice_uploads`** joined to the same **`master_mapping`** taxonomy rows (see seed in [`ARCHITECTURE.md`](./ARCHITECTURE.md)).

Related architecture overview: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Entry points

| Step | File |
|------|------|
| HTTP handler | `app/api/invoices/analyze/route.ts` |
| Public module entry | `lib/premium-analysis/index.ts` — import `@/lib/premium-analysis` |
| Orchestration (DB loads + preprocess + summary) | `lib/premium-analysis/compute.ts` |
| Carrier ingest adapters | `lib/premium-analysis/ingest-adapters/` |
| Pure aggregation math | `lib/premium-analysis/analysis-summary.ts` — **`computeInvoiceAnalysisSummary`** |
| Period matrix (avg spend / shipments) | `lib/premium-analysis/period-averages-matrix.ts` |
| CSV parsing → `InvoiceRecord[]` | `lib/invoices/csv.ts` — **`parseInvoiceCsvDocument`**, **`toNumber`**, etc. |

---

## Pipeline (order matters)

High-level flow inside **`computePremiumInvoiceAnalysis`**:

1. **Load** up to **200** `invoice_uploads` for the user (newest first): metadata only (`id`, `created_at`, `content_sha256`) in one query — **no `csv_text` yet** (fetching csv_text for 50+ files in a single query exceeds Supabase's statement timeout). Then fetch `csv_text` in **batches of 10** (`CSV_FETCH_BATCH = 10`) using `.in('id', batchIds)`.
2. **Backfill** missing `content_sha256` from `csv_text` and persist (so dedupe is stable).
3. **Dedupe uploads by hash:** `dedupeInvoiceUploadRowsBySha256` keeps first occurrence per `content_sha256` (same binary content only counted once). Count reported as **`ingestDiagnostics.duplicateUploadRowsSkipped`**.
4. **Parse cache (optional):** if unchanged fingerprint + same profile company name, reuse **`fullRecords`** + **`ingestDiagnostics`** from `lib/premium-analysis/analyze-parse-cache.ts`.
5. **Parse each deduped CSV:** `parseInvoiceCsvDocument` → `records`; accumulate **`rowsDroppedCriticalSciCorruption`** from identifier sanity checks inside CSV parsing/finalization.
6. **Club Colors filter:** `filterRowsLikeClubColorsPowerQuery` drops rows where **`Invoice Date`** is empty or the literal header string `"Invoice Date"` (embedded header rows).
7. **Dedupe charge lines:** `dedupeInvoiceRecordsStableOrder` (stable order, key-based duplicate merge). Drops counted in **`ingestDiagnostics.duplicateChargeRowsDropped`**.
8. **Profile override:** `applyProfileSenderCompanyName` may set **`Sender Company Name`** from the user profile (does not change money math).
9. **Filter meta** is built from **full unfiltered** `fullRecords`: `buildInvoiceAnalysisFilterMeta`.
10. **Dashboard filters** (year, months, legacy `yearMonth`, account): `filterInvoiceRecords(fullRecords, appliedFilters)` → **`records`** used for aggregation only.
11. **Mappings:** load all rows from **`master_mapping`** (`carrier`, `standardized_charge`, `charge_description`, `transportation_mode`, `category_1`…`category_5`). Build **`mappingByDescription`** via **`buildChargeDescriptionLookup`** (carrier-aware composite keys plus UPS legacy keys — see below).
12. **Summary:** `computeInvoiceAnalysisSummary(records, mappingByDescription)` → **`InvoiceAnalysisSummary`**.
13. **Dashboard payload** adds **`filterMeta`**, **`appliedFilters`**, and **`ingestDiagnostics`**.

---

## `computeInvoiceAnalysisSummary` — row model

Each input row is one **charge line** (many lines per shipment / invoice).

### Numeric parsing

Amounts and quantities use **`toNumber`** from `lib/invoices/csv.ts` on fields such as **`Net Amount`**, **`Invoice Amount`**, **`Duty Amount`**, **`Billed Weight`**, **`Entered Weight`**, **`Package Quantity`**, **`Zone`**.

### Carrier + charge description → categories

1. **`Charge Description`** on the row is trimmed.
2. **Carrier-side key** starts from **`normalizeMappingText`** on **`Carrier Name`** (fallback **`UPS`** if blank): FedEx variants fold to **`FEDEX`**; WWE / “World…” strings fold to **`WWE`**.
3. **Description-side key** = **`normalizeMappingText(charge_description)`** — trim, collapse whitespace, uppercase (same normalization as taxonomy rows loaded from Supabase).

**Resolution order** (first hit wins):

1. **Composite:** canonical carrier (`UPS`, `FEDEX`, or `WWE`) **+ TAB +** description key — e.g. FedEx CSV row uses the FedEx mapping row for that charge text.
2. If the invoice carrier is **not UPS** and step 1 missed: **UPS + TAB +** description key (shared UPS charge wording on non-UPS files).
3. **Description key only** — legacy rows keyed without carrier (backward compatible).

### What `buildChargeDescriptionLookup` stores

For each mapping row from the DB:

- **Composite:** canonical carrier (**`UPS`**, **`FEDEX`**, or **`WWE`**) followed by a **tab** and **`descKey`**, pointing at `{ transportation_mode, category_1 … category_5 }`.
- If the row is **`UPS`**, **also** sets **`descKey` →** same payload so old data without composite keys still works.

**`standardized_charge`** is selected from Supabase for future use but is **not** part of fuel/accessorial/category math today; KPIs still use **`category_1…5`** derived from **`master_mapping`**.

### From the matched mapping row (if any)

If a row matches: **`category_1`**, **`category_2`**, **`category_3`** are each passed through **`normalizeMappingText`** again for comparison (`FUEL SURCHARGE`, bucket labels, etc.).

If there is **no** mapping, those strings are empty; **`category2` label** for rollups becomes **`UNMAPPED`**.

### Derived dimensions (per row)

| Output / use | Rule |
|--------------|------|
| **`Carrier`** | `rec['Carrier Name']` or `'Unknown'` (display bucket; mapping resolver defaults blank carrier name to **`UPS`**) |
| **Service** | `Original Service Description` trim, else `Charge Category Code` trim, else `'Unknown'` |
| **Mode** | `modeFromZone(zone)` from numeric **Zone** (Ground, Air, Express/Special, international bands, etc.) — see `lib/premium-analysis/analysis-summary.ts`. |
| **Weight bucket** | `weightBucketFromLbs(billedWeight)` |
| **Date key** | `parseInvoiceDateKey('Invoice Date')` → `YYYY-MM-DD` or `null` if unparseable |
| **Account dim** | Trimmed **`Account Number`**, or **`(no account)`** |
| **Invoice dim** | Trimmed **`Invoice Number`**, or **`(no invoice)`** |

---

## Core money rollups (every row)

For each charge line:

- **`totals.netAmount`** += **`Net Amount`**
- **`totals.invoiceAmount`** += **`Invoice Amount`**
- **`totals.dutyAmount`** += **`Duty Amount`**
- **`measures.totalCost`** += **`Net Amount`** (same as net in this engine)
- **`sumBilledWeight`** / **`sumEnteredWeight`** accumulate weights (all rows)
- **`byCarrier`** / **`byService`**: increment **`shipmentCount`** by **1 per charge line** (not per distinct shipment — the field name is misleading; one shipment produces many charge lines), and add net / invoice amounts.

---

## KPI splits (`measures`)

Definitions mirror comments in code referencing Python/Power BI naming:

| Measure | Rule |
|---------|------|
| **`fuelCost`** | Row is fuel iff **`category_3 === 'FUEL SURCHARGE'`** (after normalization). Add **`Net Amount`**. |
| **`costSurcharges`** | **`category_3`** in **`{'FUEL SURCHARGE','ACCESSORIAL SURCHARGE','SURCHARGE'}`**. Add **`Net Amount`**. |
| **`costAccessorials`** | **`Charge Classification Code`** (uppercased) **`=== 'ACC'`** and **`Charge Category Code`** not in **`INF`**, **`ICC`**. Add **`Net Amount`**. |

**Note:** Fuel is **both** `fuelCost` and (because it is in the set) **`costSurcharges`**. Accessorial cost uses **classification ACC**, not category_3 alone.

---

## Package / volume metrics

After the main loop:

- Build **`shipmentPackageDedupeKey(rec)`** = **`${Invoice Number}::${shipId}`** where **`shipId`** is first non-empty of:
  - **`Tracking Number`**
  - **`Shipment Reference Number 1`**
  - **`Lead Shipment Number`**
- If **`shipId`** is missing, the row **does not** contribute to package dedupe keys.
- For each key, **`Package Quantity`** is **`max`** across rows sharing that key (then floored implicitly by **`toNumber`** behavior on the stored string).
- **`measures.totalPackages`**: sum of those per-shipment max quantities.
- **`measures.packageDedupeShipmentCount`**: count of distinct keys.
- **`volumeUnits` per row** for category/mode/bucket rollups: **`max(1, Package Quantity)`** (each **charge line** adds this to volume aggregations).

### Cost per piece (CPP)

For **category2**, **mode**, and **weight bucket** aggregates:

- **`totalCpp`** = **`totalCost / totalVolume`** when **`totalVolume > 0`**, else **`0`**.

---

## Time / invoice rollups

All of the following use the **same** fuel / surcharge / accessorial split rules as above where **`costFuel`**, **`costSurcharges`**, **`costAccessorials`** appear.

| Aggregate | Grain | Notes |
|-----------|-------|------|
| **`dailySpend`** | **`Invoice Date`** → day | Rows without parseable date **omit** from daily/monthly splits but **still** count in global totals / carrier / service / CPP buckets that do not require date. |
| **`dailySpendByAccount`** | **`date` × `accountNumber`** | |
| **`monthlySpend`** | Month label like **`March 2025`** (UTC calendar month from date key) | Sorted newest first via internal `sortKey`. |
| **`spendByInvoice`** | **`invoiceNumber` only** (matches Club Colors Python: one row per invoice). **`invoiceDate`** = **minimum** date key across all lines for that invoice. **`accountNumber`** lists distinct raw accounts sorted and comma-separated when more than one appears (data-quality artifacts); otherwise a single account or **`(no account)`**. |

---

## Dashboard filters (`filterInvoiceRecords`)

Applied **after** ingest dedupe and **before** `computeInvoiceAnalysisSummary`:

- **`yearMonth`** (if `YYYY-MM`): keep rows whose date key starts with that year-month.
- Else: optional **`year`** (calendar year prefix on date key), optional **`months`** (calendar month numbers 1–12), combined as AND when both set.
- Optional **`accountNumber`**: case-insensitive exact match on trimmed **`Account Number`**.

When **no** active filters, all preprocessed **`fullRecords`** are summarized.

---

## AGENTS Invoices outputs (`lib/premium-analysis/agents-outputs.ts`)

After `computeInvoiceAnalysisSummary`, **`enrichSummaryWithAgentsOutputs`** adds methodology-aligned blocks from [AGENTS Invoices.md](../AGENTS%20Invoices.md):

| Module | Output |
|--------|--------|
| `spec-categories.ts` | AGENTS charge categories (`BASE_FREIGHT`, `FUEL`, …) from `standardized_charge` + taxonomy |
| `carrier-mix.ts` | Shipments and avg cost by carrier × service × zone mode |
| `trend-flags.ts` | Months >20% above 3-month rolling average |
| `anomaly-detection.ts` | Eight universal flags (fuel/EIA, accessorial rate, address correction, …) |
| `contract-compliance.ts` | UPS `Incentive Amount` vs profile `contract_discounts` |
| `savings-estimator.ts` | Annualized low/high savings range |
| `action-prioritization.ts` | Ranked actions (top 3 executable) |

Persisted on `invoice_upload_analyses.summary` JSON and shown in **Agents findings** on the Premium Analysis dashboard.

---

## Outputs attached only in Premium dashboard flow

| Field | Meaning |
|-------|---------|
| **`filterMeta`** | Distinct **years**, **yearMonths** (`YYYY-MM`), **accountNumbers** from **`fullRecords`** (unfiltered). |
| **`appliedFilters`** | Echo of POST body filters. |
| **`ingestDiagnostics`** | `duplicateUploadRowsSkipped`, `duplicateChargeRowsDropped`, `rowsDroppedCriticalSciCorruption`. |

---

## Files quick reference

```
app/api/invoices/analyze/route.ts          → triggers compute, persists summary JSON
lib/premium-analysis/index.ts            → public entry (@/lib/premium-analysis)
lib/premium-analysis/compute.ts          → orchestration + filters + summary assembly
lib/premium-analysis/ingest-adapters/    → UPS CSV + FedEx/WWE multipart → InvoiceRecord[]
lib/premium-analysis/analysis-summary.ts → computeInvoiceAnalysisSummary + filters + helpers
lib/premium-analysis/period-averages-matrix.ts → year / month / ISO week matrices
lib/premium-analysis/analyze-parse-cache.ts    → in-memory UPS parse cache
lib/invoices/csv.ts                      → CSV → InvoiceRecord, Club Colors filter, numbers
lib/invoices/mapping.ts                  → master_mapping join for multipart upload ingest
lib/invoices/excel-master-mapping.ts     → workbook → seed rows (not on analyze hot path)
supabase/seed.ts                         → upsert master_mapping
```

---

## Version note

Behavior matches the repository at the time this file was written. If **`computeInvoiceAnalysisSummary`** or **`computePremiumInvoiceAnalysis`** changes, reconcile this doc with those functions first.
