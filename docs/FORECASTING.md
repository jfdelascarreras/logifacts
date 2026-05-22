# Spend Forecasting

The **Forecast tab** on the Premium Analysis page projects Total Cost and Fuel Surcharge $ for the next 3 months using actual invoice history.

> **Curriculum source:** The methodology (baseline-first, hold-out MAPE selection, seasonal naïve eligibility rules) follows the **Karpathy bootcamp TSA curriculum** — DHLCPP Time Series Analysis lectures 1–4, stored in `Forecasting Material/curriculum-time-series.md`. Deep learning approaches (Module 8) and SARIMA are explicitly deferred to v2.

---

## What the card shows

| Element | Description |
|---------|-------------|
| **Total Cost line** (solid, then dashed) | Historical and projected all-in spend |
| **Fuel Cost line** (solid, then dashed) | Historical and projected fuel surcharge $ |
| **Scenario selector** | Low / Current / High preset rates + custom % input |
| **Surcharge type** | Which UPS rate column to use (Domestic Ground, Domestic Air, etc.) |
| **Model badge** | Which baseline won: Mean, Last Value, or Seasonal Naïve |
| **MAPE badge** | Hold-out accuracy on the last 3 months of history |
| **Warnings** | Small training set, gaps filled, filtered data, etc. |

---

## How the forecast works

### Step 1 — Extract base freight series

For each month in `monthlySpend` (newest-first from the analysis engine):

```
base_freight[t] = totalCost[t] − costFuel[t]
```

Why base freight and not totalCost directly? Fuel surcharge is an exogenous multiplier (set by UPS weekly, not by shipping volume). Separating it lets us model the volume trend independently and then apply the user's chosen fuel rate on top — making "what if fuel goes up 5%?" a slider, not a re-forecast.

Labels like `"March 2025"` are converted to `YYYY-MM` keys, sorted ascending, and gaps are filled with `$0` (with a warning).

### Step 2 — Train/holdout split

```
train   = series[0 .. N - holdoutPeriods - 1]   (default holdoutPeriods = 3)
holdout = series[N - holdoutPeriods .. N - 1]
```

If `N − holdoutPeriods ≤ 3` the holdout is shrunk so the training set keeps at least 3 points; a `small_training_set` warning is added.

### Step 3 — Evaluate baseline candidates

Three models from the Karpathy TSA curriculum are fitted on `train` and scored on `holdout`:

| Model | Formula | Eligible when |
|-------|---------|---------------|
| **Mean** | `ŷ[t] = mean(train)` for all t | Always |
| **Last Value** | `ŷ[t] = train[N-1]` for all t | Always |
| **Seasonal Naïve** | `ŷ[t] = train[t − 12]` | history ≥ 12 months only |

**MAPE (Mean Absolute Percentage Error):**

```
MAPE = (1/h) × Σ |actual[t] − predicted[t]| / actual[t]
```

Returns `null` if any `actual[t] = 0` (division undefined). The model with the lowest non-null MAPE wins. If all MAPEs are null (all-zero actuals), Mean is used as the default.

### Step 4 — Retrain on full series and project

The winning model is retrained on the **entire** series (train + holdout) and asked for `horizon = 3` future periods.

### Step 5 — Apply fuel surcharge scenarios

```
projected_fuel[t]  = projected_base[t] × rate
projected_total[t] = projected_base[t] + projected_fuel[t]
```

Three rates (Low / Current / High) are derived from the last 90 days of the UPS weekly rate file:

| Scenario | Derivation |
|----------|-----------|
| **Low** | `min(rates in last 90 days)` |
| **Current** | `rates[0]` (most recent weekly row) |
| **High** | `max(rates in last 90 days)` |

All three scenario forecasts are pre-computed and returned in one API response. Switching buttons on the UI reads from the cached result — no re-fetch needed.

### Minimum history required: **6 months**. Fewer shows an empty state.

---

## Fuel surcharge scenarios

Three presets are derived automatically from `lib/pricing/data/ups-fuel-surcharge-history.json`.

Users can also type a **custom %** in the input field; it triggers a new API call and overrides the "Current" scenario.

Six surcharge type options:
- **All Fuel Surcharges** — simple average of all five types per weekly row (default)
- Domestic Ground
- Domestic Air
- Intl Air Export
- Intl Air Import
- Intl Ground (Export/Import)

---

## Updating the rate history file

`lib/pricing/data/ups-fuel-surcharge-history.json` is maintained manually. Each Monday when UPS publishes a new weekly rate:

1. Open the file.
2. **Prepend** one row to the array (newest-first convention):
   ```json
   { "effectiveDate": "YYYY-MM-DD", "domesticGround": 0.2750, "domesticAir": 0.3125, "intlAirExport": 0.4150, "intlAirImport": 0.4525, "intlGroundExportImport": 0.2775 }
   ```
3. Keep all historical rows — the file is the source of truth for scenario derivation.

> Also update `FUEL_SURCHARGE_RATE` in `lib/pricing/ups-rates.ts` to stay in sync with the latest `domesticGround` value (used by the pricing estimator).

---

## Key files

| File | Role |
|------|------|
| `lib/invoices/forecasting/types.ts` | Shared types (`SpendObservation`, `FuelForecastResult`, etc.) |
| `lib/invoices/forecasting/series.ts` | Extract base freight series from monthlySpend; fill gaps |
| `lib/invoices/forecasting/metrics.ts` | MAPE, train/holdout split |
| `lib/invoices/forecasting/baselines.ts` | Mean, last_value, seasonal_naive predictors |
| `lib/invoices/forecasting/forecast.ts` | `forecastFuelSurcharge()` — orchestrates everything |
| `lib/pricing/ups-fuel-surcharge-history.ts` | `loadFuelSurchargeHistory()`, `deriveFuelScenarios()` |
| `lib/pricing/data/ups-fuel-surcharge-history.json` | Weekly UPS rate data (newest-first) |
| `app/api/invoices/forecast/route.ts` | POST `/api/invoices/forecast` — auth, parse, call lib, return JSON |
| `app/components/analysis/cost-forecast-card.tsx` | React UI — SVG chart, scenario buttons, surcharge type picker |

---

## Warnings reference

| Warning key | Meaning |
|-------------|---------|
| `insufficient_history` | Fewer than 6 months of invoice data |
| `seasonality_not_reliable` | History is 6–11 months; seasonal_naive was excluded |
| `small_training_set` | Training set ≤ 3 months after holdout split — accuracy limited |
| `gaps_filled` | One or more months had no invoice data; filled with $0 |
| `filtered_data` | Forecast based on a filtered date/account subset, not all data |
| `using_stored_analysis` | monthlySpend was not in the request; loaded from last saved analysis |

---

## v2 roadmap

- Confidence intervals (percentile bootstrap over baselines)
- Automatic weekly rate file update via UPS RSS / scraper
- Per-account or per-carrier sub-forecasts
- Export forecast to Excel alongside the analysis export
