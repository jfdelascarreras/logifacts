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
| `app/api/pricing/` | Pricing API: rate estimation endpoints (to be created). |
| `app/components/` | Feature/UI by area: `analysis/`, `invoices/`, `dashboard/`, `pricing/`, `theme/`, `branding/`. Import alias `@/app-components/...` also resolves here. |
| `components/` | Shared UI primitives (shadcn-style under `components/ui/`). |
| `hooks/` | Shared hooks (e.g. `use-mobile.ts`). |
| `lib/` | Shared libraries: Supabase clients (`lib/supabase/`), cache (`lib/cache/`), invoice domain (`lib/invoices/`), pricing domain (`lib/pricing/`). |
| `lib/invoices/` | Core invoice domain: CSV, dedupe hash, `analysis-summary.ts` engine, parsers, mapping, exporter. |
| `lib/invoices/parsers/` | Carrier parsers: `ups.ts`, `fedex.ts`, `wwe.ts`, shared `scalars.ts`. |
| `lib/pricing/` | Pricing domain: rate calculation logic, carrier rate tables, shipment estimation (to be created). |
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

### 4.1 What migrations in `supabase/migrations/` define or change

- **`20260508123000_enforce_rls_for_invoice_tables.sql`** — Enables RLS and idempotent policies for `invoice_uploads`, `invoice_upload_analyses`, `invoice_spend_by_date` (`auth.uid() = user_id`). `dim_date` stays shared/read-only.
- **`20260508160000_invoice_uploads_content_sha256.sql`** — Adds `invoice_uploads.content_sha256 text`, index on `(user_id, content_sha256)` where not null.
- **`20260509120000_invoice_spend_by_date_account_number.sql`** — Adds `invoice_spend_by_date.account_number text NOT NULL DEFAULT '(legacy)'`; unique index `(user_id, invoice_date, account_number)`.
- **`20260508235000_drop_invoice_spend_by_date_dim_date_fk.sql`** — Drops FK to `dim_date` if present.
- **`20260514170000_invoice_rows.sql`** — `CREATE TABLE public.invoice_rows` with `user_id`, `invoice_upload_id` (FK nullable), `row_hash`, analysis-shaped text columns, timestamps. Unique `(user_id, row_hash)`. RLS SELECT/INSERT/DELETE. **No UPDATE policy.**
- **`20260515210000_invoice_lines_kpi_columns.sql`** — Adds `charge_classification_code`, `charge_category_code`, `package_quantity` to `invoice_lines`. Index on `(invoice_id, charge_classification_code, charge_category_code)`.
- **`20260519140000_drop_charge_description_mappings_after_parity.sql`** — Drops `charge_description_mappings`. Consolidates on `master_mapping`.

**Important:** Migrations here only `CREATE` the `invoice_rows` table. `invoice_uploads`, `invoice_upload_analyses`, `master_mapping`, and `invoice_spend_by_date` are assumed to exist from earlier work. Reconcile with the linked Supabase project for full DDL.

### 4.2 Application-inferred table shapes

- **`master_mapping`** — Grain `(carrier, charge_description)`. Fields: `id`, `carrier`, `charge_description`, `transportation_mode`, `category_1`–`category_5`, `standardized_charge`.
- **`invoice_uploads`** — Fields: `id`, `user_id`, `original_file_name`, `csv_text`, `row_count`, `status`, `content_sha256`, `created_at`.
- **`invoice_upload_analyses`** — Fields: `id`, `user_id`, `invoice_upload_id`, `summary`, `created_at`, `updated_at`. Upsert on `invoice_upload_id`.
- **`invoice_spend_by_date`** — Fields: `user_id`, `invoice_date`, `account_number`, `total_cost`, `net_spend`. Unique on `(user_id, invoice_date, account_number)`. Delete-then-upsert per analysis run (only when no active filters). **Primary source for dashboard time-series charts.**
- **`invoice_rows`** — Fields: `user_id`, `invoice_upload_id` (nullable FK), `row_hash`, analysis-shaped text columns, timestamps. **Primary source for dashboard category breakdowns.**

### 4.3 Relationships

- `invoice_rows.user_id` → `auth.users`; optional `invoice_upload_id` → `invoice_uploads`
- `invoice_upload_analyses` keyed by `invoice_upload_id`, scoped by `user_id`

### 4.4 Deprecated / removed

- **`charge_description_mappings`** — Dropped. Do not reference or recreate.
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
- Pricing is stateless — no data persisted per query (unless a future milestone explicitly scopes that).
- Rate logic is pure: `lib/pricing/` only. External carrier API calls go in the API route, not lib.
- Dimensional weight must be calculated when applicable: `L × W × H / 139` (inches / lbs, UPS/FedEx standard).
- Label all rate results as **estimates** in the UI — actual charges may vary.

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

### Planned (not yet implemented)

- **Forecasting** — time-series projection from `invoice_spend_by_date`. Logic in `lib/invoices/forecasting/`.
- **ML anomaly detection** — flag charges deviating from historical patterns. Logic in `lib/invoices/anomaly/`.

Both must be implemented as tested pure functions before being wired to the UI.

---

## 9. Pricing feature

Lets users estimate carrier shipping costs before sending a package. Stateless — no data persisted per query.

### Flow

1. User inputs: weight (lbs), dimensions (L × W × H inches), origin zip, destination zip, service type (optional).
2. `POST /api/pricing/estimate` calls pure rate functions in `lib/pricing/`, returns estimates per carrier.
3. UI shows side-by-side carrier rate comparison.

### Types

```ts
type ShipmentInput = {
  weightLbs: number
  dimensionsIn: { length: number; width: number; height: number }
  originZip: string
  destinationZip: string
  serviceType?: string
}

type RateEstimate = {
  carrier: string        // 'UPS' | 'FedEx' | 'WWE'
  serviceType: string
  estimatedCost: number
  currency: 'USD'
  notes?: string         // e.g. 'dimensional weight applied'
}
```

### File locations

- Rate logic: `lib/pricing/estimate.ts`
- Carrier-specific rules: `lib/pricing/rates/[carrier].ts`
- UI components: `app/components/pricing/`
- API route: `app/api/pricing/route.ts`

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
| Architecture diagram and folder map | `docs/ARCHITECTURE.md` |
| KPI / premium calculation steps | `docs/PREMIUM_ANALYSIS_CALCULATION.md` |
| Legacy taxonomy migration notes | `docs/CHARGE_DESCRIPTION_MAPPINGS_MIGRATION.md` |
| Next.js agent hint | `AGENTS.md` |
| Lint ignore rules | `eslint.config.mjs` |
