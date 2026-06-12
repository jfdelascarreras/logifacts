# Premium Analysis — calculation audit

**Audit date:** 2026-06-11  
**Source of truth:** `lib/premium-analysis/` (TypeScript), orchestrated by `computePremiumInvoiceAnalysis` in `compute.ts`.

This document is an accuracy-focused audit of the live app calculation path. Use it with [`PREMIUM_ANALYSIS_CALCULATION.md`](./PREMIUM_ANALYSIS_CALCULATION.md) and the offline mirror at `scripts/premium_analysis_mirror/`.

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| Core money rollups (`computeInvoiceAnalysisSummary`) | **Sound** | Deterministic; covered by 181 Vitest tests including golden synthetic proofs |
| Carrier taxonomy (`master_mapping`) | **Sound** | Composite carrier+description lookup with UPS fallback |
| Shipment / package volume | **Fixed (FedEx)** | Requires `Tracking Number` on ingest; FedEx parser now reads `Express or Ground Tracking ID` |
| Date rollups (FedEx/WWE) | **Sound** | Uses `primaryRollupDateRaw` — not Invoice Date alone |
| AGENTS extensions | **Sound** | Spec categories, carrier mix, anomalies, savings layered after core summary |
| Offline mirror (`scripts/premium_analysis_mirror/`) | **Canonical Python** | Ports TS engine rules for folder/CSV testing outside the app |

---

## 1. Pipeline (order is load-bearing)

```
POST /api/invoices/analyze
  → loadPremiumIngestRecords()     # per-carrier adapters → InvoiceRecord[]
  → buildInvoiceAnalysisFilterMeta()  # on FULL unfiltered set
  → filterInvoiceRecords()         # dashboard filters only
  → buildChargeDescriptionLookup() # from master_mapping
  → computeInvoiceAnalysisSummary()
  → buildSpendShipmentPeriodMatrix()
  → enrichSummaryWithAgentsOutputs()
  → persist summary JSON + daily spend
```

**Rule:** Filters apply **after** ingest dedupe, **before** aggregation. Filter meta is always built from the **unfiltered** record set.

---

## 2. Ingest accuracy requirements

### UPS CSV (`invoice_uploads.csv_text`)

1. Parse with delimiter detect (`;` vs `,`), optional header row skip.
2. `finalizeParsedInvoiceRecords` — drop rows with corrupted scientific-notation invoice/account IDs.
3. `filterRowsLikeClubColorsPowerQuery` — drop rows where `Invoice Date` is empty or the literal `"Invoice Date"`.
4. `dedupeInvoiceRecordsStableOrder` — stable charge-line dedupe.
5. Upload-level dedupe by `content_sha256`.

### FedEx / WWE multipart (`invoices` + `invoice_lines`)

1. Parser unpivots charge lines per shipment row.
2. **FedEx must populate tracking** on every line (`tracking_id` → `reference_1` → `Tracking Number` in analysis adapter).
3. `filterRowsLikeClubColorsPowerQuery` for FedEx/WWE: keep row if **any** of `Invoice Date`, `Transaction Date`, `Shipment Date` is a real value (not header echo).
4. `invoiceLinesToRecords` maps multipart lines into the 250-column `InvoiceRecord` shape.

### Critical field mapping (multipart → analysis)

| InvoiceRecord column | Source |
|---------------------|--------|
| `Tracking Number` | `invoice_lines.reference_1` (tracking ID at ingest) |
| `Original Service Description` | `invoice_lines.service_level` |
| `Net Amount` | `charge_amount` |
| `Carrier Name` | parent `invoices.carrier` |
| `Package Quantity` | `package_quantity` (default 1) |

---

## 3. Core aggregation (`computeInvoiceAnalysisSummary`)

### 3.1 Numeric parsing (`toNumber`)

- Empty → `0`
- **Any letter a–z → `0`** (prevents tracking numbers in amount columns from polluting totals)
- Accounting negatives `(123.45)` → `-123.45`
- Strips `$`, `,`, spaces; must match `^-?\d*\.?\d+$` after clean

### 3.2 Taxonomy lookup (per charge line)

Resolution order for `Charge Description`:

1. `{FEDEX|WWE|UPS}\t{NORMALIZED_DESC}`
2. If carrier ≠ UPS: `UPS\t{NORMALIZED_DESC}`
3. `{NORMALIZED_DESC}` (legacy UPS-only keys)

Normalization: trim, collapse whitespace, **uppercase**.

### 3.3 KPI measures (every charge line)

| Measure | Inclusion rule |
|---------|----------------|
| `totalCost` | Sum of `Net Amount` (all rows) |
| `fuelCost` | `category_3 === 'FUEL SURCHARGE'` |
| `costSurcharges` | `category_3 ∈ {FUEL SURCHARGE, ACCESSORIAL SURCHARGE, SURCHARGE}` |
| `costAccessorials` | `Charge Classification Code === 'ACC'` AND `Charge Category Code ∉ {INF, ICC}` **OR** `category_1 === 'ACCESSORIAL SURCHARGE'` with category_3 not in surcharge set |

**Intentional overlap:** Fuel rows count in **both** `fuelCost` and `costSurcharges`.

### 3.4 Package / shipment volume

```text
shipmentPackageDedupeKey = `${Invoice Number}::${shipId}`
shipId = first non-empty of:
  Tracking Number → Shipment Reference Number 1 → Lead Shipment Number
```

- Rows **without** `shipId` → **excluded** from package dedupe (common before FedEx tracking fix).
- Per key: `Package Quantity` = **max** across lines sharing the key.
- `totalPackages` = sum of per-key max quantities.
- `packageDedupeShipmentCount` = distinct keys.
- CPP / volume rollups use `max(1, Package Quantity)` **per charge line** (not deduped).

### 3.5 Date rollups

- Date key from `parseInvoiceDateKey(primaryRollupDateRaw(rec))`.
- **UPS:** `Invoice Date` only.
- **FedEx/WWE:** `Shipment Date` → `Transaction Date` → `Invoice Date` (per-line activity; multipart ingest sets header invoice date on every row).
- **Multipart ingest:** `fetchInvoiceLines` paginates past PostgREST’s 1000-row cap (one invoice can be 15k+ lines).
- Rows with unparseable dates: still in global totals; **omitted** from daily/monthly splits.

### 3.6 `spendByInvoice`

- Group by `Invoice Number` only (Club Colors / Python dashboard parity).
- `invoiceDate` = **minimum** date key across lines.
- `accountNumber` = single account, or comma-joined sorted list when multiple accounts appear on one invoice.

### 3.7 `byCarrier` / `byService` in core summary

- `chargeLineCount` = number of charge lines (not shipments).
- `enrichSummaryWithAgentsOutputs` adds `shipmentCount` = distinct `shipmentPackageDedupeKey` per dimension.

---

## 4. Period matrix (`buildSpendShipmentPeriodMatrix`)

- **Spend:** daily rollup by `primaryRollupDateRaw` date key (same as `dailySpend`).
- **Shipments:** `shipmentIdentityKey` — uses `shipmentPackageDedupeKey` first; fallback `invoice::ref` or `invoice::no-ship-id`.
- Shipment assigned to period of **earliest** date key seen for that identity.
- Month/week buckets only include periods with `activeDays > 0` (sparse matrix).

---

## 5. AGENTS extensions (post-core)

| Module | Depends on | Accuracy note |
|--------|------------|---------------|
| `spec-categories.ts` | `standardized_charge` + taxonomy + substring fallback | Unmapped rows use charge-description heuristics |
| `carrier-mix.ts` | `shipmentPackageDedupeKey` + `Original Service Description` | Zero shipments if tracking missing |
| `anomaly-detection.ts` | AGENTS categories + fuel rerate (EIA) | Fuel flags need base+ fuel on same shipment key |
| `savings-estimator.ts` | Anomaly amounts × recovery rates × annualization | `monthly_spend_spike` recovery rate = 0 |
| `contract-compliance.ts` | UPS `Incentive Amount` vs profile metadata | FedEx uses `Earned Discount` mapping separately |

---

## 6. Verification checklist

Run before trusting dashboard numbers:

- [ ] `pnpm exec vitest run` — all tests green (181+).
- [ ] FedEx uploads: re-ingest after tracking fix; confirm `packageDedupeShipmentCount > 0`.
- [ ] `python3 scripts/run_invoice_analysis.py --golden` — synthetic parity with TS golden proof.
- [ ] Compare mirror output to dashboard for same CSV folder: `totalCost`, `fuelCost`, `totalPackages`, `packageDedupeShipmentCount`, `monthlySpend`.
- [ ] Spot-check one invoice: sum of `spendByInvoice.totalCost` = `measures.totalCost`.

---

## 7. Python offline stack

| Entry point | Role |
|-------------|------|
| `scripts/run_invoice_analysis.py` | **Primary CLI** — folder or single CSV |
| `scripts/premium_analysis_mirror/` | Engine, ingest, export (TS parity) |

Legacy `scripts/invoice_analysis/` and `scripts/map_club_colors_invoices.py` were removed (2026-06-11); they used divergent measure definitions and are not part of the app pipeline.

---

## 8. Accuracy risks to monitor

1. **Re-upload required** after tracking fix — existing `invoice_lines` rows lack `reference_1` tracking.
2. **Unmapped charge descriptions** → empty taxonomy → fuel/accessorial splits may miss rows until `master_mapping` is updated.
3. **WWE fuel embedded** — fuel not a separate line; fuel KPIs and EIA rerate under-count WWE.
4. **`toNumber` alpha guard** — if a carrier puts text in `Net Amount`, row contributes `0` (safe but silent).
5. **ISO week math** — uses UTC ISO week algorithm in `isoWeekYearFromDateKey`; cross-check near year boundaries.

---

## 9. Files reference

| Concern | File |
|---------|------|
| Orchestration | `lib/premium-analysis/compute.ts` |
| Core math | `lib/premium-analysis/analysis-summary.ts` |
| Period matrix | `lib/premium-analysis/period-averages-matrix.ts` |
| AGENTS layer | `lib/premium-analysis/agents-outputs.ts` |
| FedEx parser | `lib/invoices/parsers/fedex.ts` |
| Multipart adapter | `lib/premium-analysis/ingest-adapters/shared.ts` |
| Golden tests | `lib/premium-analysis/analysis-summary.test.ts` |
| Offline mirror | `scripts/premium_analysis_mirror/engine.py` |
