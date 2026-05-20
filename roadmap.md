# Logifacts — Roadmap

Milestones are implemented sequentially via `/implement [N]`. Each entry is the source of truth for scope; do not expand scope during implementation — stop and `/scope` a new milestone instead.

---

## M-1: UPS Rate Estimator (Club Colors Contract)

**Status:** not implemented
**Area:** pricing
**Goal:** Port the Club Colors UPS quoting tool (Contract D001207201, Addendum B, Hoffman Estates IL origin) into the app as a standalone `/pricing` page with ZIP-to-zone lookup, DIM weight calculation, stacked contract discounts, and a full per-shipment cost breakdown.

**Touches:**
- `lib/pricing/ups-rates.ts` — rate tables (Ground, Ground Saver, 3-Day, 2nd Day Air, NDA; zones 2–8; weight breakpoints 1–150 lbs) and discount schedule (service incentive, tier incentive, PLD bonus)
- `lib/pricing/ups-zone-lookup.ts` — resolves destination ZIP (3-digit prefix) → zone integer using a static zone chart
- `lib/pricing/data/ups-zone-chart.json` — UPS zone chart for Hoffman Estates origin (3-digit ZIP prefix → zone 2–8); **must be sourced from UPS before this milestone can be implemented**
- `lib/pricing/ups-estimate.ts` — pure `estimateUPS(input): UPSRateResult` function; no I/O
- `lib/pricing/ups-estimate.test.ts` — unit tests covering DIM governs, actual governs, residential, each service, zone boundary, weight interpolation
- `lib/pricing/index.ts` — barrel export
- `app/api/pricing/estimate/route.ts` — `POST /api/pricing/estimate`; validates input, calls `estimateUPS`, returns result; auth-gated
- `app/components/pricing/ups-quote-form.tsx` — form: actual weight, dimensions (L×W×H), origin ZIP (prefilled Hoffman Estates), destination ZIP, service selector, delivery type toggle
- `app/components/pricing/rate-result.tsx` — result card: net cost hero, billable weight badge, discount chips (service/tier/PLD), cost breakdown table (list → incentives → net TC → fuel → residential → total), accessorial reference rates
- `app/pricing/page.tsx` — standalone `/pricing` route; Server Component; wires form + result

**Calculation spec (from Contract D001207201 Addendum B):**

| Step | Rule |
|------|------|
| DIM weight | `ceil(L × W × H / 220)` Ground/Saver; `ceil(L × W × H / 194)` air services |
| Billable weight | `ceil(max(actual, DIM))` |
| Published rate | Interpolate between nearest weight breakpoints in rate table for service × zone |
| Service incentive | Ground: 35% (≤5 lb), 38% (≤10), 41% (≤20), 43% (≤30), 45% (>30); Saver: 20%; 3-Day/2-Day/NDA: 0% |
| Tier incentive | Ground: 16%; Saver: 0%; 3-Day: 48%; 2nd Day: 56%; NDA: 61.4% |
| PLD bonus | Ground/Saver: 5%; air services: 10% |
| Total discount | `min(service + tier + PLD, 95%)` |
| Net TC | `publishedRate × (1 − totalDiscount)` |
| Fuel surcharge | `netTC × 17.2%` (est.; 30% off UPS list fuel rate) |
| Residential surcharge | `$6.30 list × 40% net = $2.52` (60% off list) |
| Total | `netTC + fuel + residential` |

**Contract accessorial reference rates (display only, not calculated per-shipment):**

| Accessorial | Net rate |
|-------------|----------|
| Address Correction | ~$7.88 (~50% off list) |
| Residential Surcharge | $2.52 (60% off $6.30 list) |
| Delivery Area Surcharge | $3.80–$7.60 (~50% off list) |
| Fuel Surcharge | ~17.2% of net TC |
| Third Party Billing | 75% off list |
| Declared Value | 41.18% off list |

**Notes / constraints:**
- **ZIP-to-zone data dependency:** `lib/pricing/data/ups-zone-chart.json` must be created from the UPS zone chart for origin ZIP 60169 (Hoffman Estates, IL) before implementation. UPS publishes zone charts per origin at ups.com/zone-advisor. File shape: `{ "606": 2, "606": 3, ... }` keyed by 3-digit destination ZIP prefix.
- All displayed costs must be labeled **"Estimate"** — actual invoice charges vary (weekly fuel rate, quarterly rebate not included).
- Quarterly rebate (3%) is intentionally excluded from per-shipment calculation.
- Stateless — no data persisted per query.
- Auth-gated: `/pricing` redirects unauthenticated users to login.
- `lib/pricing/` must remain pure (no Supabase, no HTTP, no side effects).
- Rate logic must be fully tested before the API route is wired up.
- FedEx and WWE pricing are deferred to future milestones.
