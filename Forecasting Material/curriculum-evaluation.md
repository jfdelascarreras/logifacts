# Evaluation curriculum (for spend forecasting)

Condensed from Karpathy wiki (FML lecture 2, lecture 5, `model-evaluation`). Applies to **regression-style** forecast errors, not classification accuracy.

---

## Why not “accuracy”

Spend forecasting is **numeric prediction**. Use **MAPE**, **MAE**, or **RMSE** on hold-out periods — not accuracy, precision, or recall.

---

## Hold-out evaluation (from FML lecture 2)

1. Split history into **train** (early) and **hold-out** (most recent h periods, e.g. h = 3 months).
2. Fit model **only on train**.
3. Predict hold-out months.
4. Compute **MAPE** on hold-out.
5. Select model with **lowest hold-out MAPE** among baselines.

**Overfitting signal:** train error keeps improving while hold-out MAPE worsens → simplify model or shorten horizon.

**Cross-validation mindset:** for monthly series with enough history, rolling-origin CV is ideal; minimum viable = single hold-out block.

---

## MAPE

```
MAPE = mean( |actual - forecast| / |actual| ) × 100%
```

- Scale-free — comparable across accounts.
- Guard: if `actual === 0`, skip or clamp (sparse months).

**Report in UI:** “Hold-out MAPE (last 3 months): 12%” with model name.

---

## Baselines (must beat before shipping SARIMA)

| Baseline | Definition |
|----------|------------|
| Mean | Forecast = historical average |
| Seasonal naïve | Forecast month M = actual month M one year ago (or last month if no YoY) |
| Last value | Forecast = previous month |

If SARIMA does not beat seasonal naïve on hold-out, **ship the baseline**.

---

## Generalization rules

- Training performance on full history is **misleading**.
- Never tune on the same months you report as “forecast accuracy.”
- Document whether forecast uses **filtered** or **full** analysis (see `forecasting_agent.md`).

---

## Expected value (FML lecture 5) — phase 2

Use when forecasts drive **actions** (budget alerts, carrier negotiations):

```
EV = Σ p(outcome) × value(outcome)
```

Examples:

- **Under-forecast** → surprise cash need (negative utility).
- **Over-forecast** → idle budget (opportunity cost).

Map MAPE bands to user-facing risk labels (“high confidence” vs “wide uncertainty”) once intervals exist.

---

## Minimum history guidelines

| History length | Recommendation |
|----------------|----------------|
| < 6 months | Show trend only; warn “insufficient for seasonality” |
| 6–11 months | Seasonal naïve or mean; no SARIMA |
| ≥ 12 months | SARIMA / Holt-Winters eligible |
| ≥ 24 months | Stronger seasonal naïve and SARIMA identification |
