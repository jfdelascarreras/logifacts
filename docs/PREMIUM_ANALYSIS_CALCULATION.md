# Premium Analysis: how calculation works

This document describes **how invoice CSV data becomes dashboard totals** for **Premium Analysis**: reading uploads, preprocessing rows, joining mappings, and aggregating metrics.

Use it to compare behavior with another tool or chat (Power BI, Python notebooks, etc.).

---

## Scope

- **In scope:** `POST /api/invoices/analyze` → compute path that reads **`invoice_uploads.csv_text`**, parses CSV rows, optionally applies dashboard filters, then runs **`computeInvoiceAnalysisSummary`**.
- **Out of scope:** `POST /api/invoices/upload` (FedEx/WWE Excel buffers, UPS CSV parser under `lib/invoices/parsers/`). That path builds structured invoice lines for storage; Premium Analysis aggregates **stored CSV text** instead.

Related architecture overview: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Entry points

| Step | File |
|------|------|
| HTTP handler | `app/api/invoices/analyze/route.ts` |
| Orchestration (DB loads + preprocess + summary) | `lib/invoices/premium-analysis-compute.ts` |
| Pure aggregation math | `lib/invoices/analysis-summary.ts` — **`computeInvoiceAnalysisSummary`** |
| CSV parsing → `InvoiceRecord[]` | `lib/invoices/csv.ts` — **`parseInvoiceCsvDocument`**, **`toNumber`**, etc. |

---

## Pipeline (order matters)

High-level flow inside **`computePremiumInvoiceAnalysis`**:

1. **Load** up to **200** `invoice_uploads` for the user (newest first): `id`, `csv_text`, `created_at`, `content_sha256`.
2. **Backfill** missing `content_sha256` from `csv_text` and persist (so dedupe is stable).
3. **Dedupe uploads by hash:** `dedupeInvoiceUploadRowsBySha256` keeps first occurrence per `content_sha256` (same binary content only counted once). Count reported as **`ingestDiagnostics.duplicateUploadRowsSkipped`**.
4. **Parse cache (optional):** if unchanged fingerprint + same profile company name, reuse **`fullRecords`** + **`ingestDiagnostics`** from `lib/invoices/analyze-parse-cache.ts`.
5. **Parse each deduped CSV:** `parseInvoiceCsvDocument` → `records`; accumulate **`rowsDroppedCriticalSciCorruption`** from identifier sanity checks inside CSV parsing/finalization.
6. **Club Colors filter:** `filterRowsLikeClubColorsPowerQuery` drops rows where **`Invoice Date`** is empty or the literal header string `"Invoice Date"` (embedded header rows).
7. **Dedupe charge lines:** `dedupeInvoiceRecordsStableOrder` (stable order, key-based duplicate merge). Drops counted in **`ingestDiagnostics.duplicateChargeRowsDropped`**.
8. **Profile override:** `applyProfileSenderCompanyName` may set **`Sender Company Name`** from the user profile (does not change money math).
9. **Filter meta** is built from **full unfiltered** `fullRecords`: `buildInvoiceAnalysisFilterMeta`.
10. **Dashboard filters** (year, months, legacy `yearMonth`, account): `filterInvoiceRecords(fullRecords, appliedFilters)` → **`records`** used for aggregation only.
11. **Mappings:** rows from **`charge_description_mappings`** → map keyed by normalized **`charge_description`** via `buildChargeDescriptionLookup`.
12. **Summary:** `computeInvoiceAnalysisSummary(records, mappingByDescription)` → **`InvoiceAnalysisSummary`**.
13. **Dashboard payload** adds **`filterMeta`**, **`appliedFilters`**, and **`ingestDiagnostics`**.

---

## `computeInvoiceAnalysisSummary` — row model

Each input row is one **charge line** (many lines per shipment / invoice).

### Numeric parsing

Amounts and quantities use **`toNumber`** from `lib/invoices/csv.ts` on fields such as **`Net Amount`**, **`Invoice Amount`**, **`Duty Amount`**, **`Billed Weight`**, **`Entered Weight`**, **`Package Quantity`**, **`Zone`**.

### Charge description → categories

1. **`Charge Description`** on the row is trimmed.
2. Lookup key = **`normalizeMappingText(charge_description)`** from DB mappings (trim, collapse whitespace, **uppercase**).
3. From the matched mapping row (if any): **`category_1`**, **`category_2`**, **`category_3`** are each passed through **`normalizeMappingText`** again for comparison.

If there is **no** mapping, those strings are empty; **`category2` label** for rollups becomes **`UNMAPPED`**.

### Derived dimensions (per row)

| Output / use | Rule |
|--------------|------|
| **Carrier** | `rec['Carrier Name']` or `'Unknown'` |
| **Service** | `Original Service Description` trim, else `Charge Category Code` trim, else `'Unknown'` |
| **Mode** | `modeFromZone(zone)` from numeric **Zone** (Ground, Air, Express/Special, international bands, etc.) — see `lib/invoices/analysis-summary.ts`. |
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
- **`byCarrier`** / **`byService`**: increment **`shipmentCount`** by **1 per charge line** (not per distinct shipment), and add net / invoice amounts.

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

## Outputs attached only in Premium dashboard flow

| Field | Meaning |
|-------|---------|
| **`filterMeta`** | Distinct **years**, **yearMonths** (`YYYY-MM`), **accountNumbers** from **`fullRecords`** (unfiltered). |
| **`appliedFilters`** | Echo of POST body filters. |
| **`ingestDiagnostics`** | `duplicateUploadRowsSkipped`, `duplicateChargeRowsDropped`, `rowsDroppedCriticalSciCorruption`. |

---

## Files quick reference

```
app/api/invoices/analyze/route.ts     → triggers compute, persists summary JSON
lib/invoices/premium-analysis-compute.ts → orchestration + ingest diagnostics + cache
lib/invoices/csv.ts                   → CSV → InvoiceRecord, Club Colors filter, numbers
lib/invoices/analysis-summary.ts      → computeInvoiceAnalysisSummary + filters + helpers
lib/invoices/identifier-safety.ts     → upload dedupe + charge dedupe + SCI/id hygiene (invoked from compute/csv path)
lib/invoices/analyze-parse-cache.ts   → optional parse reuse + cached ingest diagnostics
```

---

## Version note

Behavior matches the repository at the time this file was written. If **`computeInvoiceAnalysisSummary`** or **`computePremiumInvoiceAnalysis`** changes, reconcile this doc with those functions first.
