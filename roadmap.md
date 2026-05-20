# Logifacts — Roadmap

Milestones are implemented sequentially via `/implement [N]`. Each entry is the source of truth for scope; do not expand scope during implementation — stop and `/scope` a new milestone instead.

---

## M-1: UPS Rate Estimator (Club Colors Contract)

**Status:** implemented
**Area:** pricing
**Goal:** Port the Club Colors UPS quoting tool (Contract D001207201, Addendum B) into the app as a standalone `/pricing` page — origin ZIP comes from the authenticated user's profile, destination ZIP drives zone lookup, and the result shows DIM weight, stacked contract discounts, and a full per-shipment cost breakdown.

**Touches:**
- `lib/pricing/ups-rates.ts` — rate tables (Ground, Ground Saver, 3-Day, 2nd Day Air, NDA; zones 2–8; weight breakpoints 1–150 lbs) and discount schedule (service incentive, tier incentive, PLD bonus)
- `lib/pricing/ups-zone-lookup.ts` — resolves `(origin3, dest3) → zone` using a static national zone table
- `lib/pricing/data/ups-zones.json` — UPS national zone table keyed by `"ORIGIN3_DEST3"` → zone 2–8; **must be sourced before implementation** (see data dependency note below)
- `lib/pricing/ups-estimate.ts` — pure `estimateUPS(input): UPSRateResult` function; no I/O
- `lib/pricing/ups-estimate.test.ts` — unit tests covering DIM governs, actual governs, residential, each service, zone boundary, weight interpolation
- `lib/pricing/index.ts` — barrel export
- `app/api/pricing/estimate/route.ts` — `POST /api/pricing/estimate`; reads `user_metadata.origin_zip`, validates input, calls `estimateUPS`, returns result; auth-gated
- `app/components/pricing/ups-quote-form.tsx` — form: actual weight, dimensions (L×W×H), origin ZIP (prefilled from `user_metadata.origin_zip`), destination ZIP, service selector, delivery type toggle
- `app/components/pricing/rate-result.tsx` — result card: net cost hero, billable weight badge, discount chips (service/tier/PLD), cost breakdown table (list → incentives → net TC → fuel → residential → total), accessorial reference rates
- `app/pricing/page.tsx` — standalone `/pricing` route; Server Component; reads `user_metadata.origin_zip`, passes to form as default

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
- **Origin ZIP from user profile:** `user_metadata.origin_zip` is the shipping origin for the authenticated user. Same pattern as `user_metadata.company_name`. The form prefills from this value; users can override per-query but the stored value is the default.
- **Zone lookup data dependency:** `lib/pricing/data/ups-zones.json` must be built before implementation. UPS publishes zone charts per origin 3-digit prefix at ups.com/zone-advisor. The full national table shape is `{ "606_900": 5, "606_100": 3, ... }` keyed by `"ORIGIN3_DEST3"`. Alternatively, source a pre-compiled national zone CSV (e.g. from a UPS developer resource or third-party dataset) and convert to JSON.
- **Zone fallback:** If a destination ZIP prefix has no entry for the user's origin, return a clear error (`"Zone not found for this origin/destination combination"`) — do not silently default.
- All displayed costs must be labeled **"Estimate"** — actual invoice charges vary (weekly fuel rate, quarterly rebate not included).
- Quarterly rebate (3%) is intentionally excluded from per-shipment calculation.
- Stateless — no data persisted per query.
- Auth-gated: `/pricing` redirects unauthenticated users to login.
- `lib/pricing/` must remain pure (no Supabase, no HTTP, no side effects). Origin ZIP is passed in as a function argument, not read from a session inside lib.
- Rate logic must be fully tested before the API route is wired up.
- FedEx and WWE pricing are deferred to future milestones.
