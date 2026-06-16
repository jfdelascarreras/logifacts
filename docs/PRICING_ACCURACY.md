# Shipment Calculator — Accuracy, Sources & Audit

This document states **what the LogiFacts Shipment Calculator models**, **where the numbers come from**, **how totals are built**, and **how we validate** them.

For step-by-step calculation math, see:

- [PRICING_CALCULATION.md](./PRICING_CALCULATION.md) — UPS
- [FEDEX_PRICING_CALCULATION.md](./FEDEX_PRICING_CALCULATION.md) — FedEx
- [PRICING_USER_GUIDE.md](./PRICING_USER_GUIDE.md) — using the UI

---

## What the calculator is (and is not)

| | |
|---|---|
| **Is** | A deterministic estimate from **published 2026 list rates**, **zone charts**, **weekly fuel index**, **DAS/remote ZIP lists**, and **accessorial tables**, with **contract discounts** from the user profile |
| **Is not** | A live carrier API quote, guaranteed ship cost, or invoice. Carrier billing can differ due to rating corrections, peak/seasonal surcharges, account programs, or rules not yet modeled |

**Tolerance target:** cross-validation cases match within **±$0.01** vs captured reference totals.

**Last audit:** 2026-06-09

---

## Data sources by carrier

### UPS

| Source publication | Generated data | Effective |
|---|---|---|
| 2026 UPS Daily Rates XLSX | `lib/pricing/data/ups-rates.json` | 2025-12-22 |
| UPS Zone Advisor XLS (902 origin prefixes) | `lib/pricing/data/zone-charts/` | 2026 |
| UPS Rate & Service Guide — accessorial PDF | `lib/pricing/data/accessorials.json` | 2025-12-22 |
| UPS DAS + Remote Area ZIP list | `lib/pricing/data/zip-surcharges.json` (25,782 ZIPs) | 2026 |
| UPS weekly fuel index | `lib/pricing/data/ups-fuel-surcharge-history.json` | **2026-05-25:** Ground 27.5%, Air 31.25% |

Source pack: [`lib/pricing/data/sources/ups/README.md`](../lib/pricing/data/sources/ups/README.md)

### FedEx

| Source publication | Generated data | Effective |
|---|---|---|
| FedEx Standard List Rates 2026 PDF | `lib/pricing/data/fedex-rates.json` | 2026-01-05 |
| FedEx Service Guide 2026 + surcharge changes | `lib/pricing/data/fedex-accessorials.json` | 2026-01-05 |
| `fedex_zones_COMPLETE.csv` | `lib/pricing/data/fedex-zone-charts/` (975 prefixes) | 2026 |
| FedEx DAS ZIP list + 2025 change overlay | `lib/pricing/data/fedex-zip-surcharges.json` (~25,854 ZIPs) | 2025 |
| FedEx weekly fuel index | `lib/pricing/data/fedex-fuel-surcharge-history.json` | **2026-06-01:** Ground 26.75%, Express 30.75% |

Source pack: [`lib/pricing/data/sources/fedex/README.md`](../lib/pricing/data/sources/fedex/README.md)

**Carrier separation:** UPS and FedEx source documents live in separate folders. FedEx zones and DAS are **not** bootstrapped from UPS data.

---

## How totals are calculated

Both carriers follow the same high-level pipeline in `estimateUPS()` / `estimateFedEx()`:

1. **Resolve service** (FedEx: `ground` + residential → `home_delivery`)
2. **Dimensional weight** when L×W×H provided (UPS: divisor 220 ground / 194 air; FedEx: 139)
3. **Billable weight** = `ceil(max(actual, DIM))`
4. **Zone** from origin-prefix chart → destination-prefix → service-specific zone
5. **Published list rate** from JSON rate table
6. **Contract discounts** (profile defaults; API body can override per field)
7. **Fuel surcharge** = fuel index × net transportation (UPS Small Business waives fuel)
8. **Accessorials** — residential, DAS, oversize/large package, additional handling, remote area, declared value, address correction (carrier-specific rules)
9. **`totalEstimatedCharge`** = sum of all net line items

Client **markup %** is applied **only in the browser** (`rate-result.tsx`) — not stored or returned by the API.

---

## Validation & test results (2026-06-09)

### TypeScript unit tests (Vitest)

```bash
pnpm exec vitest run lib/pricing
```

| Suite | Tests |
|---|---|
| `ups-estimate.test.ts` | DIM, zones, surcharges, full estimate paths |
| `fedex-estimate.test.ts` | FedEx pipeline + declared value |
| `zone-chart-prefix.test.ts` | Origin prefix resolution |
| `ups-fuel-surcharge.test.ts` | Fuel history helpers |
| **Total** | **85 passed** |

### Python cross-validation

Replicates TypeScript logic against JSON data, compares to **captured reference totals** in fixture files.

```bash
python3 scripts/test_pricing_tool.py
python3 scripts/test_pricing_tool.py --tests scripts/fedex_pricing_test_cases.json
```

| Fixture | Cases | Result | Coverage |
|---|---|---|---|
| `scripts/pricing_test_cases.json` | 50 | **50/50 PASS** | All UPS services, commercial/residential, DIM, DAS, declared value, Small Business, multi-origin, expected errors |
| `scripts/fedex_pricing_test_cases.json` | 7 | **7/7 PASS** | Ground, Home Delivery, Express Saver, Priority Overnight, DIM, local zone 2 |

Export audit spreadsheet:

```bash
python3 scripts/export_pricing_results.py
python3 scripts/export_pricing_results.py --tests scripts/fedex_pricing_test_cases.json --out outputs/fedex_pricing_audit.xlsx
```

Output: `outputs/pricing_audit.xlsx`, `outputs/fedex_pricing_audit.xlsx`

---

## Known limitations

### Both carriers

- Domestic parcel rating only
- Fuel index must be updated weekly or estimates drift
- Profile `contract_discounts` shape is shared between carriers
- No peak/seasonal surcharges, carbon fees, or third-party billing

### UPS

- No SurePost, international, or freight
- 2nd Day Air A.M. unavailable on some lanes (returns error)

### FedEx

- Alaska/Hawaii DAS ZIPs map to remote tier ($16.75); separate AK ($46) / HI ($16.25) DAS amounts not modeled separately
- Express rates parsed to 50 lb max
- No One Rate, SmartPost, freight, or international
- `High_Cost_Service_Area_ZIPs_preview.pdf` is FedEx Freight only — excluded

---

## Keeping accuracy current

| Change | Action |
|---|---|
| Weekly fuel | Update `*-fuel-surcharge-history.json` (UPS also has live scrape cache) |
| Annual tariff | Re-run convert scripts; update accessorial JSON from new PDFs |
| Zone chart change | Re-run `convert-ups-data.ts` or `convert_fedex_data.py` |
| DAS ZIP change | Replace carrier ZIP surcharge JSON |
| New validation case | Add to `pricing_test_cases.json` or `fedex_pricing_test_cases.json`; re-run audit export |

---

## Key implementation files

```
lib/pricing/ups-estimate.ts          UPS orchestration
lib/pricing/fedex-estimate.ts        FedEx orchestration
app/api/pricing/estimate/route.ts    HTTP API
scripts/test_pricing_tool.py         Python cross-validator
scripts/export_pricing_results.py    Excel audit export
lib/pricing/calculator-metadata.ts   UI accuracy disclosure constants
app/components/pricing/calculator-accuracy-panel.tsx
```
