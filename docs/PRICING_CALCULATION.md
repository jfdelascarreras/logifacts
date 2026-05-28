# UPS Rate Calculator — Sources & Output

This document describes **every data source, input field, calculation step, and output field** for the UPS rate estimator. For a plain-language guide on how to use the calculator, see [PRICING_USER_GUIDE.md](./PRICING_USER_GUIDE.md).

Scope: `POST /api/pricing/estimate` → `estimateUPS()` → `UPSRateBreakdown`.

---

## Data sources

All input data lives in `lib/pricing/data/`. None of it is hardcoded in the application logic.

### `ups-rates.json`
- **Source:** 2026 UPS Daily Rates XLSX (`Invoices skills/ups-plan-invoice-csv/daily-rates-us-en.xlsx`)
- **Effective date:** 2025-12-22
- **Shape:** `service → weight (lb, string) → zone (string) → rate ($)`
- **Services covered:** `ground`, `3day`, `2day`, `2day_am`, `nda_saver`, `nda`
- **Weight range:** 1–150 lbs
- **Zones covered:** 2–8 (standard US) + 44 (Alaska), 45 (Hawaii/Puerto Rico), 46 (other territories)
- **Regenerate:** `pnpm dlx tsx scripts/convert-ups-data.ts` after replacing the source XLSX

### `zone-charts/{prefix}.json` (902 files)
- **Source:** UPS Zone Advisor XLS exports, one file per 3-digit origin ZIP prefix (e.g. `601.json` for origin ZIP 601xx)
- **Shape:** `destPrefix (3-digit string) → { ground, 3day, 2day, 2day_am, nda_saver, nda }` — each value is a zone number or `null` (service not available to that destination)
- **Territory ZIPs:** Alaska (995–999) and Hawaii (967–969) are hardcoded in the conversion script because UPS Zone Advisor lists them as individual 5-digit ZIP footnotes, not 3-digit prefix rows
- **Regenerate:** `pnpm dlx tsx scripts/convert-ups-data.ts` after updating the XLS files

### `zone-charts/_manifest.json`
- **Shape:** `{ prefixes: number[] }` — sorted list of all available origin 3-digit prefixes
- **Used for:** fuzzy origin prefix resolution — if the user's origin prefix isn't available, the largest prefix ≤ theirs is used

### `ups-fuel-surcharge-history.json`
- **Source:** UPS weekly fuel surcharge index (manual entry)
- **Shape:** array of entries, most recent first. Each entry:
  ```json
  { "weekOf": "2026-05-25", "domesticGround": 0.275, "domesticAir": 0.3125 }
  ```
- **Used as:** `fuelHistory[0]` — the most recent entry is always the live rate
- **Ground rate as of 2026-05-25:** 27.5%
- **Air rate as of 2026-05-25:** 31.25%
- **Update cadence:** UPS publishes new rates Monday morning; add a new entry to the front of the array

### `accessorials.json`
- **Source:** UPS 2026 Rate and Service Guide — Revised Rates for Value-Added Services (`sources/preview-accessorial-us-en.pdf`)
- **Effective date:** 2025-12-22
- **Contains:**
  - Residential surcharge: $6.50 ground, $7.00 air
  - Address correction: $25.25 (both)
  - Delivery Area Surcharge (DAS): 8 rate combinations (ground/air × commercial/residential × standard/extended)
  - Large package surcharge: zone-tiered, separate commercial and residential tables
  - Additional handling: zone-tiered, separate weight/dimensions/packaging tables
  - Remote area surcharge: $46.25 (Alaska), $16.50 (Hawaii), $16.50 (US-48 remote)
  - Declared value: $1.70 per $100, $5.11 minimum
- **Does NOT contain:** fuel surcharge (weekly variable, tracked separately above)

### `zip-surcharges.json`
- **Source:** UPS DAS and Remote Area ZIP list
- **Entries:** 25,782 ZIP codes
- **Shape:** `{ "ZIPCODE": "type" }` where type is one of:
  - `"das_standard"` — Delivery Area Surcharge, standard rate (7,626 ZIPs)
  - `"das_extended"` — Delivery Area Surcharge, extended rate (14,276 ZIPs)
  - `"remote_alaska"` — Remote Area, Alaska rate (219 ZIPs)
  - `"remote_hawaii"` — Remote Area, Hawaii rate (68 ZIPs)
  - `"remote_us48"` — Remote Area, contiguous US remote rate (3,593 ZIPs)
- **Important:** A ZIP is either DAS or remote — never both. ZIPs absent from the file have no surcharge.
- **Note:** Many Alaska/Hawaii ZIPs are `das_standard`, not remote (e.g. Anchorage 99501 = `das_standard`). The prefix-based assumption that all AK/HI ZIPs are remote is wrong.

---

## Inputs

`POST /api/pricing/estimate` accepts JSON:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `weightLbs` | `number` | Yes | Actual package weight in pounds. Must be > 0. |
| `dimensionsIn` | `{ length, width, height }` | No | All values in inches. Required to compute DIM weight and check large-package / additional-handling thresholds. |
| `originZip` | `string` | No | 5-digit override. Falls back to `user.user_metadata.origin_zip` from the user profile. |
| `destinationZip` | `string` | Yes | Exactly 5 digits. |
| `service` | `string` | Yes | `'ground'` `'3day'` `'2day'` `'2day_am'` `'nda_saver'` `'nda'` |
| `residential` | `boolean` | Yes | `true` = residential delivery. Affects residential surcharge and DAS rate key. |
| `nonStandardPackaging` | `boolean` | No | Bags, shrink wrap, tires — triggers packaging-type additional handling if no higher priority trigger applies. |
| `declaredValueDollars` | `number` | No | Declared value in dollars. `0` or omitted = no coverage. |
| `addressCorrection` | `boolean` | No | Include post-shipment address correction charge in the estimate. |
| `contractDiscounts` | `ContractDiscounts` | No | Per-field override of profile discounts. Profile discounts are the default; body discounts win per-field. |
| *(UI only)* `markupPct` | `number` | No | Percentage margin added on top of `totalEstimatedCharge` to produce a client-facing price. Not sent to the API — computed client-side in `rate-result.tsx`. |

`ContractDiscounts` shape (all fields optional, fraction 0–0.95):
```typescript
{
  transportation?:     number   // applied to published rate
  fuelSurcharge?:      number   // applied to fuel surcharge amount
  residential?:        number   // applied to residential surcharge
  das?:                number   // applied to DAS and remote area surcharges
  additionalHandling?: number   // applied to additional handling surcharge
  largePackage?:       number   // applied to large package surcharge
  addressCorrection?:  number   // applied to address correction charge
  declaredValue?:      number   // applied to declared value charge
}
```

Profile discounts are saved per user in `user.user_metadata.contract_discounts` and applied automatically. Values above 0.95 are silently clamped to 0.95.

---

## Calculation steps

The nine charges are computed in this order inside `estimateUPS()`:

### 1 — DIM weight

```
DIM_DIVISORS:
  ground              → 220
  3day / 2day / 2day_am / nda_saver / nda  → 194

dimWeightLbs = ceil(length × width × height / divisor)
```

If no dimensions are provided, `dimWeightLbs = null`.

### 2 — Billable weight

```
billableWeightLbs   = max(ceil(actualWeightLbs), dimWeightLbs)
billableWeightSource = 'dimensional' if DIM > ceil(actual), else 'actual'
```

If the billable weight exceeds the highest weight in the rate table for that service, the estimate returns an error.

### 3 — Zone resolution

```
originPrefix  = first 3 digits of originZip
chartPrefix   = originPrefix if in _manifest, else largest prefix ≤ originPrefix
chart file    = zone-charts/{chartPrefix}.json

destPrefix    = first 3 digits of destinationZip
zone          = chart[destPrefix][service]   → null if service unavailable to that dest
```

**Zone encoding by service:**

| Service | Zone range | Example: zone 5 |
|---------|-----------|-----------------|
| ground | 2–8, 44 (AK), 45 (HI/PR), 46 | 5 |
| nda | 102–108, 124 (AK), 125 (HI) | 105 |
| nda_saver | 132–138 | 135 |
| 2day | 202–208, 224 (AK), 225 (HI) | 205 |
| 2day_am | 242–248 | 245 |
| 3day | 302–308 | 305 |

For zone-tiered accessorial lookups, the encoded zone is reduced to a **base zone (2–8)** by subtracting the service offset. Territory zones (outside 2–8 after subtraction) are treated as base zone 8.

### 4 — Published rate

```
publishedRate = ups-rates.json[service][billableWeightLbs][zone]
```

Returns an error if no rate exists for that weight/zone combination.

### 5 — Net Transportation Charge

```
discounts.transportation = clamp(input, 0, 0.95)
netTransportationCharge  = publishedRate × (1 − discounts.transportation)
```

### 6 — Fuel surcharge

```
rate = fuelHistory[0].domesticGround   (for ground)
     = fuelHistory[0].domesticAir      (for 3day / 2day / 2day_am / nda_saver / nda)

fuelSurcharge = netTransportationCharge × rate × (1 − discounts.fuelSurcharge)
```

### 7 — Residential surcharge

```
listRate = accessorials.residentialSurcharge.ground   ($6.50)   if service = ground
         = accessorials.residentialSurcharge.air      ($7.00)   otherwise

residentialSurcharge = listRate × (1 − discounts.residential)   if residential = true
                     = 0                                          otherwise
```

### 8 — Delivery Area Surcharge (DAS)

```
kind = zip-surcharges[destinationZip]   → 'das_standard' | 'das_extended' | null | remote type

if kind starts with 'das_':
  svcGroup   = 'air' if air service, else 'ground'
  custGroup  = 'Residential' if residential, else 'Commercial'
  extSuffix  = 'Extended' if kind = 'das_extended', else ''
  rateKey    = svcGroup + custGroup + extSuffix
  dasListRate = accessorials.deliveryAreaSurcharge[rateKey]
  dasSurcharge = dasListRate × (1 − discounts.das)
else:
  dasSurcharge = 0
```

DAS rate reference (list rates):

| | Commercial | Commercial Extended | Residential | Residential Extended |
|---|---|---|---|---|
| Ground | $4.50 | $5.70 | $6.55 | $8.85 |
| Air | $4.50 | $5.70 | $6.55 | $8.85 |

### 9 — Large package surcharge

Only evaluated when `dimensionsIn` is provided.

```
Trigger: longest side > 96 in  OR  (longest side + 2 × (second + third)) > 130 in

if triggered:
  baseZone = zone − service_offset   (clamped to 8 if outside 2–8)
  listRate = zone-tiered rate from accessorials.largePackageSurcharge.commercial or .residential
  largePackageSurcharge = listRate × (1 − discounts.largePackage)
```

Large package takes **precedence** — if triggered, additional handling (step 10) is skipped.

Zone-tiered rates (commercial, list):

| Zone | Rate |
|------|------|
| 2 | $219.50 |
| 3–4 | $239.50 |
| 5–6 | $273.00 |
| 7+ | $286.00 |

Residential rates are ~$35 higher per tier.

### 10 — Additional handling

Skipped if large package surcharge was triggered. Highest-priority trigger only:

```
Priority order: weight → dimensions → packaging

weight trigger:     actualWeightLbs > 70 lbs
dimension trigger:  longest side > 48 in  OR  second-longest side > 30 in
packaging trigger:  nonStandardPackaging = true  (bags, shrink wrap, tires, unstable items)

if triggered:
  baseZone = zone − service_offset   (clamped to 8)
  listRate = zone-tiered rate from accessorials.additionalHandling[triggerType]
  additionalHandlingSurcharge = listRate × (1 − discounts.additionalHandling)
```

### 11 — Remote area surcharge

```
kind = zip-surcharges[destinationZip]

if kind = 'remote_alaska': listRate = accessorials.remoteAreaSurcharge.alaska   ($46.25)
if kind = 'remote_hawaii': listRate = accessorials.remoteAreaSurcharge.hawaii   ($16.50)
if kind = 'remote_us48':   listRate = accessorials.remoteAreaSurcharge.us48     ($16.50)
else:                       listRate = 0

remoteAreaSurcharge = listRate × (1 − discounts.das)   // shares DAS discount slot
```

### 12 — Declared value charge

```
if declaredValueDollars > 0:
  rawCharge = max(
    accessorials.declaredValue.minimum,           ($5.11)
    declaredValueDollars / 100 × ratePerHundred   ($1.70 per $100)
  )
  declaredValueCharge = rawCharge × (1 − discounts.declaredValue)
else:
  declaredValueCharge = 0
```

### 13 — Address correction charge

```
if addressCorrection = true:
  addressCorrectionCharge = accessorials.addressCorrection.ground × (1 − discounts.addressCorrection)
                                                                      ($25.25)
else:
  addressCorrectionCharge = 0
```

### Total

```
totalEstimatedCharge =
    netTransportationCharge
  + fuelSurcharge
  + residentialSurcharge
  + dasSurcharge
  + largePackageSurcharge
  + additionalHandlingSurcharge
  + remoteAreaSurcharge
  + declaredValueCharge
  + addressCorrectionCharge
```

---

## Output — `UPSRateBreakdown`

Every successful call returns this object:

| Field | Type | Description |
|-------|------|-------------|
| `service` | `UPSService` | Service level used |
| `actualWeightLbs` | `number` | Weight as submitted |
| `dimWeightLbs` | `number \| null` | DIM weight, or null if no dimensions given |
| `billableWeightLbs` | `number` | The weight used to look up the rate |
| `billableWeightSource` | `'actual' \| 'dimensional'` | Which weight governed |
| `zone` | `number` | Service-encoded zone (e.g. 205 for 2Day zone 5) |
| `publishedRate` | `number` | UPS list rate from the rate table ($) |
| `contractDiscounts` | `Required<ContractDiscounts>` | All 8 discount fractions actually used (0 if not set) |
| `netTransportationCharge` | `number` | Published rate after transportation discount |
| `fuelSurchargeRate` | `number` | Fuel surcharge fraction applied (e.g. 0.275) |
| `fuelSurcharge` | `number` | Fuel charge in dollars |
| `residentialSurcharge` | `number` | $0 if commercial |
| `dasSurchargeType` | `'standard' \| 'extended' \| null` | DAS tier, or null if no DAS |
| `dasSurcharge` | `number` | DAS charge in dollars |
| `largePackageSurcharge` | `number` | $0 if not triggered |
| `additionalHandlingTrigger` | `'weight' \| 'dimensions' \| 'packaging' \| null` | What triggered AH, or null |
| `additionalHandlingSurcharge` | `number` | $0 if not triggered |
| `remoteAreaType` | `'alaska' \| 'hawaii' \| 'us48' \| null` | Remote area classification, or null |
| `remoteAreaSurcharge` | `number` | $0 if not a remote area ZIP |
| `declaredValueCharge` | `number` | $0 if no declared value |
| `addressCorrectionCharge` | `number` | $0 if not flagged |
| `totalEstimatedCharge` | `number` | Sum of all charges above |

### Customer price (UI-only, not in API response)

Computed in `rate-result.tsx` when the user enters a markup percentage in the form:

```
markupAmount  = totalEstimatedCharge × (markupPct / 100)
customerPrice = totalEstimatedCharge + markupAmount
```

Neither value is returned by the API or stored anywhere — they are derived in the browser from the breakdown and the form input.

---

## Worked example

**Input:** Ground, 5 lb, no dimensions, origin 601xx (Chicago), dest 10001 (NYC), commercial, 56% transportation discount, no other discounts.

| Step | Value |
|------|-------|
| DIM weight | null (no dimensions) |
| Billable weight | 5 lb (actual) |
| Zone | 5 (ground, Chicago → NYC) |
| Published rate | $18.65 |
| Net TC | $18.65 × 0.44 = $8.21 |
| Fuel surcharge | $8.21 × 27.5% = $2.26 |
| Residential | $0 (commercial) |
| DAS | 10001 = `das_standard`, ground commercial = $4.50 |
| Large package | $0 |
| Additional handling | $0 |
| Remote area | $0 |
| Declared value | $0 |
| Address correction | $0 |
| **Total** | **$14.97** |

With a **20% mark up** entered in the form:

| | |
|---|---|
| Your cost (UPS) | $14.97 |
| Mark Up (20%) | +$2.99 |
| **Bill to Client** | **$17.96** |

---

## What needs updating when rates change

| What changed | Action |
|---|---|
| **Fuel surcharge** (weekly) | Add new entry to the front of `lib/pricing/data/ups-fuel-surcharge-history.json` |
| **Annual rate change** (every Jan) | Replace source XLSX, run `pnpm dlx tsx scripts/convert-ups-data.ts`, update `accessorials.json` from new PDF, update effective dates |
| **Zone chart change** | Replace source XLS files, re-run convert script |
| **DAS / remote area ZIP list change** | Replace `lib/pricing/data/zip-surcharges.json` |
| **Contract renegotiation** | User updates discounts in My Profile → Settings |

---

## Key files

```
lib/pricing/ups-estimate.ts              orchestrates all steps
lib/pricing/ups-rates.ts                 DIM divisors, rate lookup, fuel rate helper
lib/pricing/ups-accessorials.ts          isLargePackage, additionalHandlingTrigger,
                                         remoteAreaType, dasType, baseZone, tieredRate
lib/pricing/ups-zone-lookup.ts           dest ZIP prefix → encoded zone
lib/pricing/zone-chart-loader.ts         origin ZIP → chart file loader
lib/pricing/types.ts                     UPSService, UPSEstimateInput, UPSRateBreakdown,
                                         ContractDiscounts
lib/pricing/data/ups-rates.json          2026 rate table
lib/pricing/data/ups-fuel-surcharge-history.json  weekly fuel surcharge history
lib/pricing/data/accessorials.json       2026 list rates for all accessorials
lib/pricing/data/zip-surcharges.json     25,782 ZIP → DAS / remote type
lib/pricing/data/zone-charts/            902 per-origin zone chart JSON files
scripts/convert-ups-data.ts             converts XLS/XLSX source files to JSON
app/api/pricing/estimate/route.ts        HTTP handler: auth, validation, zone load, merge discounts
app/components/pricing/ups-quote-form.tsx  input form
app/components/pricing/rate-result.tsx   cost breakdown display
app/components/profile/contract-discounts-editor.tsx  profile discount settings
lib/pricing/ups-estimate.test.ts         146 unit tests
```
