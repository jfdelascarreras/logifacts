# FedEx Rate Calculator — Sources & Output

This document describes **every data source, input field, calculation step, and output field** for the FedEx rate estimator in the LogiFacts Shipment Calculator.

Scope: `POST /api/pricing/estimate` with `carrier: "fedex"` → `estimateFedEx()` → `FedExRateBreakdown`.

For UPS, see [PRICING_CALCULATION.md](./PRICING_CALCULATION.md). For usage, see [PRICING_USER_GUIDE.md](./PRICING_USER_GUIDE.md).

---

## Data sources

All input data lives in `lib/pricing/data/`. None of it is hardcoded in application logic.

### `fedex-rates.json`
- **Source:** `lib/pricing/data/sources/fedex/FedEx_Standard_List_Rates_2026.pdf` via `scripts/convert_fedex_data.py`
- **Effective date:** 2026-01-05 (updated 2026-06-01)
- **Shape:** `service → weight (lb, string) → zone (string) → rate ($)`
- **Services:** `ground`, `home_delivery`, `express_saver`, `2day`, `standard_overnight`, `priority_overnight`
- **Weight range:** Ground/HD 1–150 lb; Express 1–50 lb
- **Zones:** 2–8 (continental US)
- **Regenerate:** `pnpm dlx tsx scripts/convert-fedex-data.ts`

### `fedex-zone-charts/{prefix}.json`
- **Source:** `sources/fedex/fedex_zones_COMPLETE.csv` via `scripts/convert_fedex_data.py`
- **Shape:** `destPrefix → { ground, home_delivery, express_saver, 2day, standard_overnight, priority_overnight }`
- **Note:** Express and Ground zones differ per FedEx's native zone chart

### `fedex-accessorials.json`
- **Source:** `sources/fedex/Service_Guide_2026.pdf` + `sources/fedex/surcharge_and_fee_changes_2026.pdf` (via `scripts/convert_fedex_data.py`)
- **Contains:** Home Delivery residential ($6.45), Express residential ($6.95), DAS tiers, zone-tiered AHS, zone-tiered oversize, declared value, address correction
- **Carrier separation:** FedEx sources live under `sources/fedex/` only — see [`sources/fedex/README.md`](../lib/pricing/data/sources/fedex/README.md)

### `fedex-zip-surcharges.json`
- **Source:** `sources/fedex/DAS_Contiguous_Extended_Remote_Alaska_Hawaii_2025.txt` (or PDF) + `DAS_Zip_Code_Changes_2025.pdf`
- **Types:** `das_standard`, `das_extended`, `das_remote`
- **Carrier separation:** FedEx DAS sources live under `sources/fedex/` only

### `fedex-fuel-surcharge-history.json`
- **Source:** FedEx weekly fuel index (maintained + live scrape)
- **Shape:** `{ weekOf, ground, express }` — most recent entry used when live cache unavailable

---

## Inputs

`POST /api/pricing/estimate` accepts JSON with `carrier: "fedex"`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `carrier` | `"fedex"` | No | Defaults to `"ups"` when omitted |
| `weightLbs` | `number` | Yes | Actual package weight |
| `dimensionsIn` | `{ length, width, height }` | No | Inches; DIM divisor **139** |
| `originZip` | `string` | No | Falls back to profile `origin_zip` |
| `destinationZip` | `string` | Yes | 5 digits |
| `service` | `string` | Yes | FedEx service key (see below) |
| `residential` | `boolean` | Yes | Maps `ground` + residential → `home_delivery` |
| `nonStandardPackaging` | `boolean` | No | Triggers packaging AHS |
| `declaredValueDollars` | `number` | No | $4.95 min up to $300; $1.65/$100 above |
| `addressCorrection` | `boolean` | No | Post-shipment correction |
| `contractDiscounts` | `ContractDiscounts` | No | Profile defaults; body overrides per field |

**Services:** `ground`, `home_delivery`, `express_saver`, `2day`, `standard_overnight`, `priority_overnight`

---

## Calculation pipeline

1. **Service resolution** — `ground` + `residential=true` → `home_delivery`
2. **DIM weight** — `ceil(L×W×H / 139)` when dimensions provided
3. **Billable weight** — `ceil(max(actual, DIM))`
4. **Zone lookup** — origin prefix → `fedex-zone-charts/{prefix}.json` → dest prefix → service zone
5. **Published rate** — `fedex-rates.json[service][billableWt][zone]`
6. **Contract discounts** — applied to transportation and each surcharge category
7. **Fuel surcharge** — `% × net transportation`; Ground fuel for ground/HD, Express fuel for air services
8. **Home Delivery surcharge** — $6.45 when service is `home_delivery`
9. **Express residential** — $6.45 when Express + residential
10. **DAS** — from `fedex-zip-surcharges.json` + tier rates in `fedex-accessorials.json`
11. **Oversize** — longest side > 96 in, L+Girth > 130 in, or weight > 150 lb
12. **Additional handling** — weight > 50 lb, dimensions, or non-standard packaging (flat $39 list)
13. **Declared value** — min $4.95 up to $300; $1.65 per $100 above
14. **Address correction** — $22.50 when flagged
15. **`totalEstimatedCharge`** — sum of all net charges

---

## Output

`FedExRateBreakdown` includes `carrier: "fedex"`, service, weights, zone, published rate, discount breakdown, each surcharge line, and `totalEstimatedCharge`.

---

## Validation

```bash
pnpm exec vitest run lib/pricing/fedex-estimate.test.ts
python3 scripts/test_pricing_tool.py --tests scripts/fedex_pricing_test_cases.json
```

Cross-validate against [FedEx Rate Tools](https://www.fedex.com/ratetools/RateToolsMain.do) and captured totals in `scripts/fedex_pricing_test_cases.json`.

---

## Known limitations (v1)

- Alaska/Hawaii DAS ZIPs map to `das_remote` tier ($16.75); Service Guide also lists separate Alaska ($46) / Hawaii ($16.25) DAS amounts not yet modeled separately
- `High_Cost_Service_Area_ZIPs_preview.pdf` is FedEx Freight (FXF) only — not used in parcel calculator
- Express rates parsed to 50 lb max (PDF table limit)
- No FedEx One Rate, SmartPost, freight, or international
- Profile `contract_discounts` shared with UPS shape
