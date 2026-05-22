# Build plan — spend forecasting in Logifacts

Checklist aligned with [`forecasting_agent.md`](./forecasting_agent.md). Check items off in PR descriptions.

---

## Phase 0 — Scope (v1)

- [ ] Target: **`totalCost`**, **monthly** grain, **3-month** horizon
- [ ] Segment: all accounts combined — use **`monthlySpend`** directly (already aggregated across accounts; no re-summing needed)
- [ ] Data path: **`monthlySpend`** from current analysis summary (works with filters)
- [ ] UI: one card on Premium Analysis dashboard
- [ ] No DB migration required for v1

---

## Phase 1 — `lib/invoices/forecasting/`

- [ ] `types.ts` — `SpendObservation`, `ForecastPoint`, `ForecastResult`
- [ ] `series.ts` — sort, fill gaps, aggregate daily → monthly
- [ ] `metrics.ts` — MAPE, hold-out split
- [ ] `baselines.ts` — mean, seasonal naïve, last value
- [ ] `forecast.ts` — `forecastSpendSeries()` orchestrator
- [ ] `index.ts` — re-export
- [ ] Export from `lib/invoices/index.ts`

---

## Phase 2 — Tests

- [ ] `series.test.ts`
- [ ] `metrics.test.ts`
- [ ] `baselines.test.ts`
- [ ] `forecast.test.ts`
- [ ] `pnpm test` — all existing `analysis-summary.test.ts` still pass

---

## Phase 3 — API

- [ ] `app/api/invoices/forecast/route.ts` — POST, auth, call lib
- [ ] Request: `{ monthlySpend?, horizon?, holdoutPeriods? }`
- [ ] Response: history, forecast, model, mape, warnings

---

## Phase 4 — UI

- [ ] `app/components/analysis/cost-forecast-card.tsx` (client)
- [ ] Integrate in `premium-dashboard.tsx` near monthly trends
- [ ] Match chart style of `cost-trend-grid.tsx` (CSS vars, SVG)
- [ ] Empty states: short history, zero data, loading/error

---

## Phase 5 — Docs

- [ ] `docs/FORECASTING.md` (user-facing behavior)
- [ ] Update `agent.md` § Dashboard — forecasting no longer “planned only”
- [ ] This folder kept in sync

---

## Phase 6 — v2 (later)

- [ ] Read `invoice_spend_by_date` when unfiltered
- [ ] Per-account forecast dropdown
- [ ] `costFuel` / `costAccessorials` series
- [ ] SARIMA or external stats engine if baselines insufficient
- [ ] Redis cache for forecast payloads
