# Pricing: how the rate estimate works

This document describes **how user inputs become a shipping cost estimate** for the Pricing feature: zone resolution, DIM weight, rate table lookup, discount, fuel surcharge, and residential surcharge.

Use it to compare behavior with UPS published tools or to understand what needs updating when carrier rates change.

---

## Scope

- **In scope:** `POST /api/pricing/estimate` → compute path that resolves a zone chart, applies DIM weight rules, looks up a published rate, applies contract discount, and adds surcharges via **`estimateUPS`**.
- **Out of scope:** Invoice analysis (separate pipeline — see [`PREMIUM_ANALYSIS_CALCULATION.md`](./PREMIUM_ANALYSIS_CALCULATION.md)).

---

## Entry points

| Step | File |
|------|------|
| HTTP handler | `app/api/pricing/estimate/route.ts` |
| Pure estimation math | `lib/pricing/ups-estimate.ts` — **`estimateUPS`** |
| Rate table + surcharge constants | `lib/pricing/ups-rates.ts` |
| Zone resolution | `lib/pricing/ups-zone-lookup.ts` — **`lookupZone`** |
| Types + service labels | `lib/pricing/types.ts` |
| Published rate data | `lib/pricing/data/ups-rates.json` |
| Zone charts (per origin prefix) | `lib/pricing/data/zone-charts/{prefix}.json` |

---

## Pipeline (order matters)

High-level flow inside **`estimateUPS`**:

1. **Validate weight** — must be > 0.
2. **DIM weight** — if dimensions provided, compute `ceil(L × W × H / divisor)`.
3. **Billable weight** — `max(ceil(actual), DIM)`, or `ceil(actual)` if no dimensions. Source tagged `'actual'` or `'dimensional'`.
4. **Max weight check** — billable weight must not exceed the highest weight in the rate table for that service (derived at runtime from `ups-rates.json`).
5. **Zone lookup** — extract 3-digit dest ZIP prefix, look up zone from the loaded chart file.
6. **Published rate** — index into `ups-rates.json` by `service → billableWeightLbs → zone`.
7. **Contract discount** — clamp input to `[0, 0.95]`, compute Net Transportation Charge.
8. **Fuel surcharge** — `Net TC × FUEL_SURCHARGE_RATE`.
9. **Residential surcharge** — flat `RES_SURCHARGE_NET` if `residential = true`, else `0`.
10. **Total** — sum of Net TC + fuel + residential.

---

## Inputs

Sent as JSON body to `POST /api/pricing/estimate`:

| Field | Type | Notes |
|-------|------|-------|
| `weightLbs` | `number` | Actual package weight in pounds. Must be > 0. |
| `dimensionsIn` | `{ length, width, height }` | Optional. All values must be positive numbers (inches). |
| `destinationZip` | `string` | Exactly 5 digits. |
| `service` | `'ground' \| '3day' \| '2day' \| 'nda_saver' \| 'nda'` | UPS service level. |
| `residential` | `boolean` | `true` = residential delivery surcharge applied. |
| `contractDiscountPct` | `number` | Optional. Fraction `0–0.95` (e.g. `0.56` = 56% off). Defaults to `0`. |
| `originZip` | `string` | Optional 5-digit override. Falls back to `user.user_metadata.origin_zip` from the user profile. |

---

## Step-by-step calculation

### 1. DIM weight

```
DIM_DIVISORS:
  ground    → 220
  3day      → 194
  2day      → 194
  nda_saver → 194
  nda       → 194

dimWeightLbs = ceil(length × width × height / DIM_DIVISORS[service])
```

Source: `lib/pricing/ups-rates.ts` — `calcDimWeight`.

If no dimensions are provided, `dimWeightLbs = null` and the actual weight governs.

### 2. Billable weight

```
billableWeightLbs = max(ceil(actualWeightLbs), dimWeightLbs)
billableWeightSource = 'dimensional' if DIM > actual, else 'actual'
```

Always rounded up to the next whole pound. Source: `calcBillableWeight`.

### 3. Zone resolution

The API route resolves the **origin ZIP** (body override → user profile) and finds the nearest available zone chart prefix:

```
AVAILABLE_PREFIXES = [5, 20, 100, 200, 300, 400, 500, 601, 700, 750, 800, 850, 900, 941, 980]
prefix = largest prefix ≤ first 3 digits of originZip
```

Chart file loaded: `lib/pricing/data/zone-charts/{prefix}.json`

Then inside **`lookupZone`**:
```
destPrefix = first 3 digits of destinationZip
zone = chart[destPrefix][service]
```

Returns `null` (error) if the dest prefix has no entry or the service has no zone.

### 4. Published rate lookup

```
publishedRate = ups-rates.json[service][billableWeightLbs][zone]
```

`ups-rates.json` is keyed as `service → weight (string) → zone (string) → rate ($)`. The file was generated from the **2026 UPS Daily Rates XLSX** via `scripts/convert-ups-data.ts` and is not hardcoded — it covers the full weight/zone matrix per service.

Returns `null` (error) if no rate exists for that combination.

### 5. Contract discount + Net Transportation Charge

```
contractDiscountPct = clamp(input, 0, 0.95)    // 95% max
netTransportationCharge = publishedRate × (1 − contractDiscountPct)
```

A discount of `0` means the user pays full list price. No discount is applied if the field is omitted.

### 6. Fuel surcharge

```
FUEL_SURCHARGE_RATE = 0.172   (17.2%)
fuelSurcharge = netTransportationCharge × FUEL_SURCHARGE_RATE
```

`FUEL_SURCHARGE_RATE` is a hardcoded constant in `lib/pricing/ups-rates.ts`. UPS publishes a new fuel surcharge percentage weekly — **this constant must be updated manually** when the rate changes.

### 7. Residential surcharge

```
RES_SURCHARGE_NET = 2.52     ($6.30 list × 40% net = 60% off list)
residentialSurcharge = residential ? RES_SURCHARGE_NET : 0
```

Hardcoded in `lib/pricing/ups-rates.ts`. Represents the contracted net rate for residential delivery.

### 8. Total

```
totalEstimatedCharge = netTransportationCharge + fuelSurcharge + residentialSurcharge
```

---

## Worked example (screenshot values)

**Input:** Ground, 5 lb actual, 12 × 3 × 2 in, dest ZIP → Zone 2, commercial, no discount.

| Step | Calculation | Result |
|------|-------------|--------|
| DIM weight | `ceil(12 × 3 × 2 / 220)` | 1 lb |
| Billable weight | `max(ceil(5), 1)` | **5 lb** (actual governs) |
| Published rate | `ups-rates.json["ground"]["5"]["2"]` | **$14.19** |
| Contract discount | 0% | — |
| Net Transportation Charge | `$14.19 × 1.00` | **$14.19** |
| Fuel surcharge | `$14.19 × 17.2%` | **+$2.44** |
| Residential | commercial | **$0** |
| **Total** | | **$16.63** |

---

## Contract Accessorial Rates reference card

Displayed in the UI as a reference only — **not added to the estimate total**. All values are hardcoded in `lib/pricing/ups-rates.ts` → `ACCESSORIAL_REFERENCE`.

| Accessorial | Estimated net | Basis |
|-------------|---------------|-------|
| Address Correction | ~$7.88 | ~50% off list |
| Residential Surcharge | $2.52 | 60% off $6.30 list |
| Delivery Area Surcharge | $3.80–$7.60 | ~50% off list |
| Fuel Surcharge | ~17.2% of net TC | 30% off list rate |
| Third Party Billing | 75% off list | — |
| Declared Value | 41.18% off list | — |

---

## What needs manual updates

| Item | Location | Trigger |
|------|----------|---------|
| **Fuel surcharge %** | `FUEL_SURCHARGE_RATE` in `lib/pricing/ups-rates.ts` | UPS updates weekly |
| **Residential surcharge net** | `RES_SURCHARGE_NET` in `lib/pricing/ups-rates.ts` | UPS contract renegotiation |
| **Published rate table** | `lib/pricing/data/ups-rates.json` | Annual UPS rate change — re-run `scripts/convert-ups-data.ts` with new XLSX |
| **Zone charts** | `lib/pricing/data/zone-charts/*.json` | Origin coverage changes — re-run `scripts/convert-ups-data.ts` |
| **Accessorial reference values** | `ACCESSORIAL_REFERENCE` in `lib/pricing/ups-rates.ts` | Contract renegotiation |

---

## Files quick reference

```
app/api/pricing/estimate/route.ts        → auth, input validation, origin ZIP resolution, zone chart load
lib/pricing/ups-estimate.ts              → estimateUPS — orchestrates all calculation steps
lib/pricing/ups-rates.ts                 → DIM divisors, rate lookup, fuel/residential constants, accessorial reference
lib/pricing/ups-zone-lookup.ts           → lookupZone — dest ZIP prefix → zone number
lib/pricing/types.ts                     → UPSService, UPSEstimateInput, UPSRateBreakdown
lib/pricing/data/ups-rates.json          → 2026 UPS Daily Rates (service → weight → zone → $)
lib/pricing/data/zone-charts/{prefix}.json → dest ZIP prefix → service → zone (one file per origin prefix)
scripts/convert-ups-data.ts              → converts UPS XLSX files into the above JSON files
lib/pricing/ups-estimate.test.ts         → unit tests with spot-checked rate values
app/components/pricing/ups-quote-form.tsx → input form UI
app/components/pricing/rate-result.tsx   → cost breakdown display
app/pricing/page.tsx                     → /pricing route
```

---

## Version note

Behavior matches the repository at the time this file was written. If **`estimateUPS`**, **`FUEL_SURCHARGE_RATE`**, or the rate/zone JSON files change, reconcile this doc with those files first.
