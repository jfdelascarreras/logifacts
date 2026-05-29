# Logifacts — agent handbook

Authoritative deep context for AI / human contributors. **Only facts confirmed in this repository** are included; where the schema or behavior is not fully defined in git, that is stated explicitly.

For a shorter pointer, see root [`AGENTS.md`](./AGENTS.md). For invoice pipeline detail, see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/PREMIUM_ANALYSIS_CALCULATION.md`](./docs/PREMIUM_ANALYSIS_CALCULATION.md).

---

## 1. Project overview

**Logifacts** is a carrier invoice analytics SaaS for logistics and operations teams who want to understand and control their shipping spend.

Users upload multi-carrier invoice CSVs (UPS, FedEx, WWE) and the app transforms raw billing data into actionable insights: where they are overspending, which charges are anomalies, how their spend breaks down by carrier, service type, and account, and how it trends over time.

The core value is turning a 250-column carrier invoice — which no human wants to read — into a clear, structured summary that an ops manager can act on. A good output answers: "What did I spend last month, on what, and is anything wrong?" A bad output is a data dump with no interpretation.

**Who the user is:** An authenticated user representing a company. Their `company_name` is in `user_metadata` and is applied to the analysis via `applyProfileSenderCompanyName`. Each user's data is fully isolated by `user_id` via RLS.

**Current product scope:**
- **Invoice Analysis:** multi-carrier CSV ingestion (UPS, FedEx, WWE), taxonomy via `master_mapping`, deterministic aggregation, persisted summaries and daily spend rollups.
- **Dashboard:** visual analytics over analyzed invoice data — spend over time, breakdowns by carrier / service type / mapped category, anomaly highlights. Forecasting and ML features planned.
- **Pricing:** user inputs tentative shipment details (weight, dimensions, destination) and gets estimated carrier rates for comparison before sending.
- **Auth:** Supabase cookie-based sessions gating all non-public routes.

---

## 2. Tech stack (from `package.json` and config files)

| Layer | Package / tool | Version / notes |
|--------|----------------|-----------------|
| Framework | `next` | `16.2.1` |
| UI | `react`, `react-dom` | `19.2.4` |
| Auth / DB client | `@supabase/ssr`, `@supabase/supabase-js` | `^0.9.0`, `^2.100.1` |
| Cache | `@upstash/redis` | `^1.38.0` (`lib/cache/redis.ts`, `lib/cache/analysis-cache.ts`) |
| Excel parsing / export | `exceljs` | `^4.4.0` |
| XLSX (dev tooling) | `xlsx` | `^0.18.5` (`devDependencies`) |
| Styling | `tailwindcss`, `@tailwindcss/postcss` | `^4` |
| Components | `radix-ui`, `shadcn`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `next-themes`, `tw-animate-css` | per `package.json` |
| Language | `typescript` | `^5` |
| Lint | `eslint`, `eslint-config-next` | `^9`, `16.2.1` |
| Tests | `vitest` | `^4.1.5` |
| CLI | `supabase` | `^2.84.2` (`devDependencies`) |
| Package manager | **pnpm** | `pnpm-lock.yaml` present — never use npm or yarn |

**Config files:**
- `next.config.ts` — `turbopack.root` set to project root.
- `tsconfig.json` — `strict`, paths: `@/*` → `./*`, `@/app-components/*` → `./app/components/*`; excludes `supabase/functions/**/*`.
- `eslint.config.mjs` — ignores `.next`, `Invoices skills/**`, `supabase/.temp/**`, `outputs/**`.
- `vitest.config.ts` — `environment: 'node'`, `include: ['**/*.test.ts']`, alias `@` → repo root.
- `components.json` — shadcn style `radix-nova`, RSC, Tailwind in `app/globals.css`, aliases `components` → `@/components`, `ui` → `@/components/ui`.

**Next.js note:** This version differs from typical training-data docs. Consult `node_modules/next/dist/docs/` before writing framework code. Heed deprecation notices.

---

## 3. Folder structure

| Path | Role |
|------|------|
| `app/` | Next.js App Router pages (`page.tsx`), `layout.tsx`, `globals.css`, API routes under `app/api/`. |
| `app/api/invoices/` | Invoice HTTP API: `analyze/`, `analyze/export/`, `analysis/`, `export/[invoiceId]/`, `mapping/`, `upload/`. |
| `app/api/pricing/` | Pricing API: `estimate/` — UPS rate estimation endpoint. |
| `app/components/` | Feature/UI by area: `analysis/`, `invoices/`, `dashboard/`, `pricing/`, `theme/`, `branding/`. Import alias `@/app-components/...` also resolves here. |
| `components/` | Shared UI primitives (shadcn-style under `components/ui/`). |
| `hooks/` | Shared hooks (e.g. `use-mobile.ts`). |
| `lib/` | Shared libraries: Supabase clients (`lib/supabase/`), cache (`lib/cache/`), invoice domain (`lib/invoices/`), pricing domain (`lib/pricing/`). |
| `lib/invoices/` | Core invoice domain: CSV, dedupe hash, `analysis-summary.ts` engine, parsers, mapping, exporter. |
| `lib/invoices/parsers/` | Carrier parsers: `ups.ts`, `fedex.ts`, `wwe.ts`, shared `scalars.ts`. |
| `lib/pricing/` | Pricing domain: `ups-estimate.ts` (orchestration), `ups-rates.ts` (constants + rate lookup), `ups-zone-lookup.ts`, `types.ts`, `data/` (rate + zone JSON). |
| `types/` | Shared TS types (`types/invoice.ts` — `Invoice`, `InvoiceLine`, filters, carriers). |
| `docs/` | Architecture and calculation documentation. |
| `supabase/migrations/` | Versioned Postgres migrations (not complete DDL history — see §4). |
| `supabase/seed.ts` | Upserts `master_mapping` from workbook. |
| `supabase/functions/` | Edge functions (e.g. `onboard-user`). Excluded from main tsconfig. |
| `Invoices skills/` | Offline workbooks / examples. Ignored by ESLint. |
| `outputs/` | Generated artifacts. Ignored by ESLint. Not required for runtime. |
| `proxy.ts` | Invokes Supabase session refresh for matched routes. |

### Where does new code go?

| What you're creating | Where it goes |
|----------------------|---------------|
| New carrier parser | `lib/invoices/parsers/[carrier].ts` |
| New invoice domain logic | `lib/invoices/` (pure function, no side effects) |
| New pricing / rate logic | `lib/pricing/` (pure function, no side effects) |
| New dashboard chart or visual | `app/components/dashboard/` |
| New pricing UI component | `app/components/pricing/` |
| New shared hook | `hooks/` |
| New UI primitive | `components/ui/` |
| New feature component | `app/components/[area]/` |
| New API endpoint | `app/api/[resource]/route.ts` |
| New shared type | `types/` |
| New Supabase migration | `supabase/migrations/[timestamp]_[description].sql` |
| New prompt / AI helper | `lib/invoices/prompts/` or `lib/pricing/prompts/` |

---

## 4. Database schema

Full reference: **[`docs/DATABASE.md`](./docs/DATABASE.md)** — complete column lists, RLS policies, migration history, and upload → dashboard data flow.

### 4.1 Active tables (summary)

- **`master_mapping`** — Shared reference table. Grain `(carrier, charge_description)`. ~249 rows covering UPS and FedEx. All authenticated users may SELECT; writes via service role only.
- **`invoice_uploads`** — Raw CSV storage. One row per file. Per-user RLS. Includes `content_sha256` for dedup.
- **`invoice_upload_analyses`** — Full JSON analysis cache. Upserted on every Refresh. One row per user (keyed by most-recent upload). Mirrored in Redis.
- **`invoice_spend_by_date`** — Daily spend rollup. One row per `(user_id, invoice_date, account_number)`. Written only on unfiltered refreshes. Primary source for time-series charts.
- **`invoice_rows`** — Structured charge lines with dedup by `row_hash`. No UPDATE policy — append-only.

### 4.2 Deprecated / removed

- **`charge_description_mappings`** — Dropped. Do not reference or recreate. Replaced by `master_mapping`.
- **`invoices`** / **`invoice_lines`** — Multipart ingest path is deprecated. Do not build on these tables. All ingestion goes through `invoice_uploads`.

---

## 5. Key conventions

### Component and rendering model
- Use **Server Components by default.** Only add `'use client'` when you need hooks, event handlers, or browser APIs.
- Forms and mutations use Server Actions or `POST /api/...` routes — not client-side fetch unless interactivity requires it.
- Loading and error states: use Next.js `loading.tsx` and `error.tsx` at the route level, not inline spinners scattered through components.

### Imports and aliases
- Always use `@/` alias. Use `@/app-components/` for feature components in `app/components/`.
- Invoice domain barrel: `@/lib/invoices` (re-exports from `analysis-summary.ts`, `csv.ts`, `dedupe-hash.ts`).
- UI primitives: `@/components/ui/...`

### Supabase clients
- **Server:** `lib/supabase/server.ts` — `createServerClient` with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `cookies()`.
- **Client:** `lib/supabase/client.ts` — for browser components only.

### API route pattern
```ts
const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// All queries filter by user.id — never trust client-supplied user_id
```

### Architecture boundary (critical)
- **`lib/invoices/`** and **`lib/pricing/`** — pure domain logic. No Supabase calls, no HTTP, no side effects.
- **`app/api/`** — orchestration only. Calls lib functions, reads/writes DB, returns responses.
- Never put computation logic in API routes. Never put DB calls in lib functions.

### Dashboard conventions
- Chart components are always `'use client'` — they require browser APIs.
- Data fetching happens in the Server Component parent; charts receive pre-shaped data as props.
- Read from `invoice_spend_by_date` for time-series, `invoice_rows` for category breakdowns. Never re-aggregate raw CSVs at render time.
- Future forecasting logic goes in `lib/invoices/forecasting/` as pure functions, tested before UI wiring.
- Future ML anomaly logic goes in `lib/invoices/anomaly/`, same rule.

### Pricing conventions
- Pricing is stateless — no data persisted per query.
- Rate logic is pure: `lib/pricing/` only. No DB calls, no HTTP inside lib.
- DIM divisors: **220** for Ground; **194** for all Air services (`3day`, `2day`, `2day_am`, `nda_saver`, `nda`). SB program uses divisor **166** when volume exceeds 864 cu in.
- Label all rate results as **estimates** in the UI — actual charges may vary.
- Full pipeline details: [`docs/PRICING_CALCULATION.md`](./docs/PRICING_CALCULATION.md).

---

## 6. How to run locally

### Environment variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_URL=https://[your-project].supabase.co     # seed script
SUPABASE_SERVICE_KEY=your-service-role-key           # seed script + DELETE /api/account (close account)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key      # alias accepted by close-account API
MASTER_MAPPING_XLSX=./path/to/mapping-workbook.xlsx  # optional, for seed
```

### Commands

```bash
pnpm install
pnpm dev        # localhost:3000
pnpm build
pnpm start
pnpm test       # vitest run
pnpm test:watch
pnpm lint
```

### Seed taxonomy

```bash
pnpm dlx tsx supabase/seed.ts
```

Run against remote Supabase using the service key. `master_mapping` must be populated before invoice analysis works.

---

## 7. Invoice upload → analysis pipeline

There is **one ingestion path.** The multipart path (`invoices` / `invoice_lines`) is deprecated — do not use or extend it.

1. User uploads 250-column-style CSV file(s) via `invoice-csv-upload.tsx`.
2. Client deduplicates by content SHA-256 (`normalizeCsvForDedupe` + `sha256HexUtf8` from `dedupe-hash.ts`).
3. `invoice_uploads.insert` chunked at `INSERT_CHUNK_SIZE = 5`.
4. `POST /api/invoices/analyze` — body carries only `filters` (optional).
5. Server loads uploads + `master_mapping`, merges CSVs via `parseInvoiceCsvDocument`, applies `filterRowsLikeClubColorsPowerQuery`, dedupes/stable-orders rows, applies `applyProfileSenderCompanyName` from `user.user_metadata.company_name`, builds charge lookup, runs `computeInvoiceAnalysisSummary`.
6. Persists `invoice_spend_by_date` (only when no active filters) and upserts `invoice_upload_analyses`. Invalidates Redis cache key `analysis:${userId}`.
7. Client dispatches `PREMIUM_ANALYSIS_UPDATED` event.

**Parse cache:** In-memory per user+fingerprint (`lib/invoices/analyze-parse-cache.ts`). Not Redis.

---

## 8. Dashboard

Visualizes the output of the invoice analysis pipeline. Does not re-process raw data — reads from already-persisted tables.

### Data sources per visual

| Visual | Source table | Key fields |
|--------|-------------|------------|
| Spend over time (line/bar) | `invoice_spend_by_date` | `invoice_date`, `total_cost`, `net_spend`, `account_number` |
| Spend by carrier | `invoice_rows` | `carrier`, cost fields |
| Spend by service type | `invoice_rows` | `transportation_mode`, cost fields |
| Spend by category | `invoice_rows` | `category_1`–`category_5` (via `master_mapping`) |
| Anomaly highlights | `invoice_upload_analyses` | `summary` JSON — flagged charges |

### Spend Forecast (implemented)

A **Forecast tab** on the Premium Analysis page projects Total Cost and Fuel Surcharge $ for the next 3 months.

**Model:** time-series forecast of `base freight = totalCost − costFuel` using the best-fit baseline (mean / last_value / seasonal_naive). Fuel cost is applied on top as a scenario multiplier.

**Scenarios:** Low / Current / High are auto-derived from the last 90 days of `lib/pricing/data/ups-fuel-surcharge-history.json` (maintained manually, prepend one row per week). User can also type a custom %.

**Key files:**

| File | Purpose |
|------|---------|
| `lib/invoices/forecasting/` | Pure forecast functions (types, series, metrics, baselines, forecast, index) |
| `lib/pricing/ups-fuel-surcharge-history.ts` | `loadFuelSurchargeHistory()`, `deriveFuelScenarios()` |
| `lib/pricing/data/ups-fuel-surcharge-history.json` | Weekly UPS rate history (newest-first) |
| `app/api/invoices/forecast/route.ts` | POST-only, auth-gated, no DB writes |
| `app/components/analysis/cost-forecast-card.tsx` | Forecast tab UI (SVG chart + scenario picker) |

Full doc: [`docs/FORECASTING.md`](./docs/FORECASTING.md). Spec & bootcamp material: [`Forecasting Material/forecasting_agent.md`](./Forecasting%20Material/forecasting_agent.md).

### Planned (not yet implemented)

- **ML anomaly detection** — flag charges deviating from historical patterns. Logic in `lib/invoices/anomaly/`.

Must be implemented as tested pure functions before being wired to the UI.

---

## 9. Pricing feature

Lets users estimate UPS shipping costs before sending a package. Stateless — no data persisted per query.

### Flow

1. User inputs weight, optional dimensions, origin/destination ZIP, service, rate program (Daily vs Small Business), residential flag, and optional accessorial flags.
2. `POST /api/pricing/estimate` resolves origin ZIP (body override → user profile), loads the zone chart (in-memory cached), warms fuel surcharge cache from UPS on Redis miss, merges profile `contract_discounts`, calls **`estimateUPS`** in `lib/pricing/ups-estimate.ts`.
3. Response contains `UPSRateBreakdown`: billable weight, zone, published rate, net TC, fuel surcharge, accessorials, total.

### Key types (`lib/pricing/types.ts`)

```ts
type UPSService = 'ground' | '3day' | '2day' | '2day_am' | 'nda_saver' | 'nda'
type UPSRateType = 'daily' | 'smallBusiness'

type ContractDiscounts = {
  transportation?: number    // 0–0.95, applied to published rate
  fuelSurcharge?: number
  residential?: number
  das?: number
  additionalHandling?: number
  largePackage?: number
  addressCorrection?: number
  declaredValue?: number
}

type UPSEstimateInput = {
  weightLbs: number
  dimensionsIn?: { length: number; width: number; height: number }
  destinationZip: string
  service: UPSService
  rateType?: UPSRateType
  residential: boolean
  nonStandardPackaging?: boolean
  declaredValueDollars?: number
  addressCorrection?: boolean
  zoneChart: ZoneChart
  contractDiscounts?: ContractDiscounts
  fuelSurchargeRates?: { ground: number; air: number }
}
```

Profile discounts live in `user_metadata.contract_discounts` (My Profile). Markup % for client pricing is UI-only in `rate-result.tsx`.

### File locations

- Orchestration: `lib/pricing/ups-estimate.ts`
- Rate constants + table lookup: `lib/pricing/ups-rates.ts`
- Zone resolution: `lib/pricing/ups-zone-lookup.ts`, `lib/pricing/zone-chart-loader.ts`
- Fuel cache (Redis + UPS scrape): `lib/cache/ups-fuel-surcharge-cache.ts`
- Rate data: `lib/pricing/data/ups-rates.json`, `ups-sb-rates.json`
- Zone charts: `lib/pricing/data/zone-charts/{prefix}.json`
- UI form: `app/components/pricing/ups-quote-form.tsx`
- UI result: `app/components/pricing/rate-result.tsx`
- API routes: `app/api/pricing/estimate/route.ts`, `app/api/pricing/fuel-surcharge/route.ts`
- Full calculation doc: [`docs/PRICING_CALCULATION.md`](./docs/PRICING_CALCULATION.md)

---

## 10. What NOT to do

- **Do not use training-data Next.js assumptions** — this is Next.js 16. Read `node_modules/next/dist/docs/` first.
- **Do not build on `invoices` or `invoice_lines`** — multipart ingest is deprecated. All ingestion goes through `invoice_uploads`.
- **Do not reference `charge_description_mappings`** — dropped. Use `master_mapping`.
- **Do not add side effects to `computeInvoiceAnalysisSummary` or anything it calls** — accuracy tests depend on purity. No DB calls, Redis writes, or I/O inside this function or its callees.
- **Do not put computation logic in API routes** — routes orchestrate, lib functions compute.
- **Do not put DB or HTTP calls in `lib/invoices/` or `lib/pricing/`** — pure functions only.
- **Do not re-aggregate raw CSV data at dashboard render time** — read from `invoice_spend_by_date` and `invoice_rows`.
- **Do not add a new charting library** without checking `package.json` first.
- **Do not persist pricing queries** unless a scoped milestone explicitly requires it.
- **Do not sync `invoice_spend_by_date` when filters are active** — the route guard exists for a reason; do not remove it.
- **Do not send Excel files through any upload path** — rejected with 422.
- **Do not use npm or yarn** — pnpm only.
- **Do not advocate for DB resets** — not reversible.
- **Do not design migrations assuming only this repo's DDL** — reconcile with the live Supabase project.
- **`invoice_rows` has no UPDATE policy** — INSERT-only unless a migration adds UPDATE.

---

## 11. Testing

- **Runner:** `pnpm test` → `vitest run`; `pnpm test:watch` → `vitest`
- **Environment:** Node (not jsdom)
- **Primary accuracy suite:** `lib/invoices/analysis-summary.test.ts` — deterministic assertions against `computeInvoiceAnalysisSummary`. Source of truth for correctness.
- **Other tests:** `lib/invoices/analyze-parse-cache.test.ts`, `lib/invoices/fixtures/invoice-unpivot-fixtures.test.ts`
- **Rule:** Any change to `lib/invoices/analysis-summary.ts` or its dependencies must keep all existing tests passing. Run `pnpm test` before marking any implementation done.
- **Pricing:** New logic in `lib/pricing/` must have its own test file before being wired to the API route.
- **Dashboard forecasting / ML:** Must be tested as pure functions before UI connection.

---

## 12. Skills

### `/scope` — define a new feature

**Process:**
1. Ask: what is the feature? what problem does it solve?
2. Ask: which area? (`invoice` | `dashboard` | `pricing` | `db` | `api`)
3. Ask: edge cases, constraints, dependencies?
4. Write to `roadmap.md`:

```md
## M-[N]: [Feature name]
**Status:** not implemented
**Area:** invoice | dashboard | pricing | db | api
**Goal:** [one sentence]
**Touches:** [files/areas affected]
**Notes:** [edge cases, constraints, open questions]
```

No code. Output is the roadmap entry only.

---

### `/implement [N]` — build a milestone

**Process:**
1. Read M-[N] in `roadmap.md`. Read all files under "Touches."
2. Implement following §5 conventions.
3. **Dashboard area:** chart is `'use client'`, data fetched in Server Component parent, source table matches §8.
4. **Pricing area:** rate logic pure in `lib/pricing/`, test file added before wiring to API.
5. Add or update tests if domain logic changed.
6. Run `pnpm test` — must pass before done.
7. Update M-[N] status to `implemented`.

Do not go outside M-[N] scope. If scope is wrong, stop and `/scope` again.

---

### `/drain` — implement all pending milestones

**Process:**
1. List all `not implemented` milestones from `roadmap.md` in order.
2. Run `/implement [N]` for each sequentially.
3. Confirm tests pass after each before moving on.
4. Report summary when done.

---

### `/review` — review an implementation

**Process:**
1. Read the milestone entry to understand intent.
2. Review changed files against §5 conventions and §10 rules.
3. Check:
   - `computeInvoiceAnalysisSummary` still pure?
   - Architecture boundary holds? (lib = pure, api = orchestration)
   - Dashboard: data fetching in Server Component parent?
   - Pricing: rate logic in `lib/pricing/` and tested?
   - New DB columns have migrations?
   - All tests pass?
4. Report: ✓ looks good / ⚠ minor issues / ✗ needs rework.

Run with a different model than the one that implemented for best results.

---

## 13. Cross-reference index

| Topic | Location |
|-------|----------|
| **Full database schema, RLS, migration history** | `docs/DATABASE.md` |
| Architecture diagram and folder map | `docs/ARCHITECTURE.md` |
| KPI / premium calculation steps | `docs/PREMIUM_ANALYSIS_CALCULATION.md` |
| Legacy taxonomy migration notes | `docs/CHARGE_DESCRIPTION_MAPPINGS_MIGRATION.md` |
| Next.js agent hint | `AGENTS.md` |
| Lint ignore rules | `eslint.config.mjs` |
