# Spend forecasting — agent handbook

Authoritative instructions for implementing **cost forecasting** in Logifacts Premium Analysis. Pair this file with root [`agent.md`](../agent.md); do not contradict architecture rules there.

**Folder contents:**

| Doc | Role |
|-----|------|
| This file | Implementation rules for AI / engineers |
| [`curriculum-time-series.md`](./curriculum-time-series.md) | Pasted TSA theory (Karpathy bootcamp) |
| [`curriculum-evaluation.md`](./curriculum-evaluation.md) | Pasted evaluation theory (FML 2 & 5) |
| [`build-plan.md`](./build-plan.md) | Sprint checklist |
| [`karpathy-sources.md`](./karpathy-sources.md) | Links to full wiki + PDFs in `Bootcamp/Karpathy` |

---

## 1. Problem statement

**Goal:** Predict future **logistics spend** from historical invoice analysis so ops/finance users can budget and spot divergence early.

**Good output:** “Next 3 months total cost ≈ $X (hold-out MAPE 11%, seasonal naïve)” with a chart of history + forecast.

**Bad output:** Re-parsing raw CSVs at forecast time, or a black-box number with no metric or data caveat.

---

## 2. What to forecast (v1 defaults)

| Choice | v1 value | Rationale |
|--------|----------|-----------|
| Metric | `totalCost` | Same as dashboard “Cost”; rules in `computeInvoiceAnalysisSummary` |
| Frequency | **Monthly** | Less noise than daily; matches `monthlySpend` |
| Horizon | **3** periods | Practical planning window |
| Segment | All accounts **summed** | Per-account in v2 |
| Split metrics | None in v1 | Add `costFuel`, etc. in v2 |

---

## 3. Data sources (read-only)

### Canonical cost definition

- **`lib/invoices/analysis-summary.ts`** — `computeInvoiceAnalysisSummary` produces `dailySpend`, `monthlySpend`, `dailySpendByAccount`.
- **`docs/PREMIUM_ANALYSIS_CALCULATION.md`** — how charge lines become `totalCost`.

Do **not** invent a new cost formula in forecasting code.

### Where series come from

| Source | When | Notes |
|--------|------|-------|
| **`summary.monthlySpend`** | Preferred v1 | Available after analyze; **respects dashboard filters** |
| **`invoice_spend_by_date`** | v2 / unfiltered | Written only when **no filters** on `POST /api/invoices/analyze` |
| Raw `invoice_uploads.csv_text` | **Never** | Violates dashboard architecture |

### Filter behavior

- **Filters active:** `invoice_spend_by_date` is **not** updated (see `app/api/invoices/analyze/route.ts`). Forecast must use **filtered** `monthlySpend` from `invoice_upload_analyses.summary` JSON.
- **UI must label:** “Based on filtered data” vs “Full refresh history.”

---

## 4. Architecture (mandatory)

Same boundaries as root `agent.md`:

```
lib/invoices/forecasting/   ← pure functions only (no Supabase, no fetch)
app/api/invoices/forecast/  ← auth + load series + call lib + JSON
app/components/analysis/  ← client chart (props or POST response)
```

### Do

- Put all math in `lib/invoices/forecasting/*.ts`.
- Unit test before UI (`vitest`, Node environment).
- Re-export from `lib/invoices/index.ts` when stable.
- Match existing chart patterns (`cost-trend-grid.tsx`, `mom-waterfall.tsx`) — SVG + `--chart-*` tokens.
- Use **pnpm** only.

### Do not

- Call Supabase inside `lib/invoices/forecasting/`.
- Put forecasting algorithms in API routes or React components.
- Re-aggregate CSV at dashboard or forecast time.
- Write to `invoice_spend_by_date` from forecast endpoints.
- Add a new charting library without checking `package.json`.
- Break `analysis-summary.test.ts` determinism.

---

## 5. Curriculum to apply (theory)

Implement using pasted material in this folder — not from memory.

### Primary — time series (DHLCPP)

Read in order:

1. [`curriculum-time-series.md`](./curriculum-time-series.md)
2. Karpathy deep dives: `karpathy-sources.md` → `dhlcpp-tsa-lecture1` … `lecture4`

**Pipeline to code:**

1. Build monthly series from `monthlySpend`.
2. Visualize (UI).
3. Fit **baselines** first (mean, seasonal naïve, last value).
4. Hold-out **MAPE** — pick winner.
5. v2: SARIMA(?,?,?)(?,?,?)₁₂ if baselines insufficient.

### Secondary — evaluation (FML)

- [`curriculum-evaluation.md`](./curriculum-evaluation.md) — hold-out, MAPE, overfitting.
- Optional later: expected value framing (FML 5) for budget alerts.

### Explicitly out of scope for v1

- Module 8 deep learning, Module 6 NLP, FML classification (SVM, Naïve Bayes, kNN).
- See `karpathy-sources.md`.

---

## 6. Library layout

```
lib/invoices/forecasting/
  types.ts       # SpendObservation, ForecastPoint, ForecastResult, options
  series.ts      # normalize monthlySpend → sorted series, gap policy
  metrics.ts     # mape, trainHoldoutSplit
  baselines.ts   # mean, seasonalNaive, lastValue + predict
  forecast.ts    # forecastSpendSeries() — select model by hold-out MAPE
  index.ts
```

### `series.ts` — critical normalization notes

Two things to do before any math:

1. **Convert month labels:** `monthlySpend[].month` from the engine is `"March 2025"` (human-readable label), **not** `YYYY-MM`. Call `yearMonthKeyFromEngineMonthLabel(row.month)` (already exported from `lib/invoices/`) to get the `YYYY-MM` key. Skip rows where it returns `null`.

2. **Reverse sort:** `monthlySpend` is returned **newest-first** by `computeInvoiceAnalysisSummary`. Sort ascending by `YYYY-MM` key before building the series — all time series math assumes chronological order.

Optional v2: `sarima.ts`, `diagnostics.ts` (ADF, ACF summaries as metadata).

### `forecastSpendSeries` contract (sketch)

```ts
type ForecastSpendOptions = {
  horizon: number           // default 3
  holdoutPeriods?: number   // default 3
  minHistory?: number       // default 6
  fillMissingMonths?: 'zero' | 'none'  // default 'zero', document in response
}

type ForecastSpendResult = {
  history: Array<{ period: string; value: number }>
  forecast: Array<{ period: string; value: number; lower?: number; upper?: number }>
  model: 'mean' | 'seasonal_naive' | 'last_value' | 'holt_winters' | 'sarima'
  metrics: { mape: number; holdoutPeriods: number }
  warnings: string[]
}
```

---

## 7. API — `POST /api/invoices/forecast`

**File:** `app/api/invoices/forecast/route.ts`

1. `createClient()` + `getUser()` → 401 if missing.
2. Parse body: `{ monthlySpend?, horizon?, holdoutPeriods? }`.
3. If `monthlySpend` missing or empty → optional fallback: query `invoice_spend_by_date`, aggregate to month (document warning if empty).
4. `forecastSpendSeries(...)` from lib.
5. Return JSON; no DB writes in v1.

**Auth:** same as `app/api/invoices/analyze/route.ts`.

---

## 8. UI — Premium Analysis

**File:** `app/components/analysis/cost-forecast-card.tsx` (`'use client'`)

- Trigger when `summary.monthlySpend` updates (after analyze refresh).
- POST forecast API with current `monthlySpend`.
- Show: history (solid), forecast (dashed), model badge, MAPE, warnings.
- Disable with message if `< 6` months of data.

**Integrate:** `app/components/analysis/premium-dashboard.tsx` near monthly spend section.

---

## 9. Edge cases (required UX / API warnings)

| Condition | Behavior |
|-----------|----------|
| `< 6` months history | No forecast; explain minimum data |
| `6–11` months | **Mean + last_value only** — seasonal naïve requires a full 12-month cycle and must be excluded from the candidate set; warn “seasonality not reliable” |
| `≥ 12` months | All baselines eligible including seasonal naïve; SARIMA in v2 |
| `history - holdoutPeriods < 3` | Training set too small; reduce `holdoutPeriods` or return no forecast with explanation (e.g. 6-month history with default `holdoutPeriods=3` leaves only 3 training points — MAPE is unreliable) |
| All-zero months | MAPE skip or omit; warn user |
| Filters active | `warnings: ['filtered_data']` |
| Analyze never run | Empty state → run analysis first |

---

## 10. Testing

| File | Assert |
|------|--------|
| `forecasting/series.test.ts` | Sort, month keys `YYYY-MM`, gap fill |
| `forecasting/metrics.test.ts` | MAPE on known vector |
| `forecasting/baselines.test.ts` | Seasonal naïve on 24-month fixture |
| `forecasting/forecast.test.ts` | End-to-end model selection |

**Gate:** `pnpm test` green; no changes to `computeInvoiceAnalysisSummary` behavior unless intentional and tested.

---

## 11. Implementation order

Follow [`build-plan.md`](./build-plan.md) checkbox order:

1. lib + tests  
2. API  
3. UI card  
4. `docs/FORECASTING.md` + update root `agent.md` dashboard section  

---

## 12. Model selection policy (for agents)

1. Always implement and test **baselines** first.
2. Ship the model with **lowest hold-out MAPE** among implemented candidates.
3. Do not add SARIMA / Python / new dependencies until baselines are in production and measured.
4. Prefer **seasonal naïve** for monthly invoice spend when history is `12–23` months; use **mean or last_value** for `6–11` months (seasonal naïve requires at least one full 12-month cycle).
5. Report **MAPE** in API and UI; never claim “95% accurate” without defining the window.

---

## 13. Security & privacy

- Forecast routes: `user_id` from session only; never accept `user_id` from client body.
- Do not log full spend series in production logs.
- Forecast JSON is derived from user invoice data — same RLS scope as analysis.

---

## 14. When user asks to “implement forecasting”

1. Read this file + [`build-plan.md`](./build-plan.md).
2. Read `docs/PREMIUM_ANALYSIS_CALCULATION.md` (cost fields).
3. Implement lib + tests first; show sample `ForecastSpendResult` in PR.
4. Wire API + UI only after tests pass.
5. Update root `agent.md` § Dashboard planned → implemented.

---

## 15. Related paths (quick reference)

| Item | Path |
|------|------|
| Aggregation | `lib/invoices/analysis-summary.ts` |
| Analyze route | `app/api/invoices/analyze/route.ts` |
| Daily spend table | `docs/DATABASE.md` → `invoice_spend_by_date` |
| Dashboard | `app/components/analysis/premium-dashboard.tsx` |
| Cost charts | `app/components/analysis/cost-trend-grid.tsx` |
| Root agent rules | `agent.md` |

---

## 16. Karpathy repo (external reference)

Full slide summaries and PDFs: see [`karpathy-sources.md`](./karpathy-sources.md).

This folder is a **working copy** of the material needed in Logifacts; if the wiki changes, sync `curriculum-*.md` when lecture content updates.
