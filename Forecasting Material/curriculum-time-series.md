# Time series curriculum (for invoice spend forecasting)

Condensed from Karpathy wiki (`time-series-analysis`, DHLCPP TSA lectures 1–4). Use when implementing `lib/invoices/forecasting/`.

---

## Why time series fits Logifacts spend

- **Input:** daily or monthly **total cost** (same definition as `dailySpend` / `monthlySpend` in `analysis-summary.ts`).
- **Output:** future periods + error metric (MAPE on hold-out).
- **Order matters:** never shuffle dates; train only on the past.

---

## What makes TS different from tabular ML

1. Data has a **specific order** — cannot shuffle.
2. Uses **past values** as features (few external features in v1).
3. Avoid **look-ahead bias** — future data must not inform training.
4. Often require **stationarity** before ARIMA/SARIMA.
5. Primary metric for logistics spend: **MAPE**.

---

## Key vocabulary

| Term | Definition |
|------|------------|
| Stationarity | Constant mean, variance, autocorrelation over time |
| Trend | Long-term increase or decrease in spend |
| Seasonality | Regular pattern (e.g. monthly billing cycles, peak seasons) |
| Residual | Noise after trend + seasonal removed |
| Lag | Value at T−k used to predict T |
| Differencing | \(y_t - y_{t-1}\) to remove trend |

**Decomposition:**

```
Observed spend = Trend + Seasonal + Residual
```

---

## Stationarity — ADF test

- H₀: unit root (non-stationary)
- H₁: stationary
- Rule: p-value < 0.05 → treat as stationary (or difference further)

For **monthly invoice spend**, trend and yearly seasonality are common → use **seasonal differencing** or **SARIMA** rather than only raw levels.

---

## ACF / PACF (model identification)

| Pattern | Suggests |
|---------|----------|
| ACF decays gradually, PACF cuts at p | AR(p) |
| ACF cuts at q, PACF decays | MA(q) |
| Spikes at lag 12 (monthly data) | Seasonal component (m=12) |

---

## Models (in order of complexity)

| Model | When to use for spend |
|-------|------------------------|
| Mean baseline | Sanity check; often too naive |
| Seasonal naïve | Strong v1 candidate (same month last year) |
| Last value | Very short history |
| AR / MA / ARMA | After ACF/PACF on stationary series |
| ARIMA(p,d,q) | Trend + short memory |
| **SARIMA(p,d,q)(P,D,Q)_m** | **Monthly spend with yearly seasonality (m=12)** |
| LSTM / Transformer | Only if SARIMA fails and long multivariate history exists |

**SARIMA notation:**

```
ARIMA(p, d, q)(P, D, Q)_m
m = 12 for monthly data
```

---

## Model selection

- **AIC / BIC:** lower is better; BIC favors simpler models.
- **Residuals:** should look like white noise after fit.
- **Hold-out MAPE:** compare models on last h months not used in training.

---

## Complete pipeline (map to Logifacts)

| Step | TSA lecture | Logifacts action |
|------|-------------|------------------|
| 1 | Load + datetime index | Build series from `monthlySpend` or `invoice_spend_by_date` |
| 2 | Visualize, decompose | Dashboard chart (history + forecast) |
| 3 | ADF / stationarity | Optional in lib diagnostics; document in API response |
| 4 | ACF/PACF | v2 model tuning; v1 use baselines + Holt-Winters or seasonal naïve |
| 5 | Fit SARIMA | v2 if baselines MAPE too high |
| 6 | Validate residuals | Unit tests + hold-out MAPE |
| 7 | Forecast + MAPE | `POST /api/invoices/forecast` response |

---

## Random walk caution

If spend differences look like noise with no structure, **simple baselines beat complex models**. Do not default to LSTM.

---

## Logifacts-specific mapping

| Forecast target | Recommended grain |
|-----------------|-------------------|
| Budget / finance | **Monthly** `totalCost` |
| Operations | Daily (noisier); consider 7-day rolling sum |

Always use **`totalCost`** from `computeInvoiceAnalysisSummary` (fuel + accessorial + surcharge rules already applied).
