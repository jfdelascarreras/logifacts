/**
 * ****************************************************************************
 * OPERATIONAL WARNING — PRODUCTION MUST STAY ALIGNED WITH THE MASTER WORKBOOK *
 * ****************************************************************************
 *
 * **`master_mapping` is the single canonical taxonomy table** for this repo.
 * Premium Analysis, structured invoice lines, and mapping APIs resolve
 * `(carrier, charge_description)` categories from Postgres — **not** from the
 * Excel file at runtime. The workbook is authoritative for *changes*; the DB
 * is authoritative for *serving* lookups after each seed run.
 *
 * **Whenever the Master Mapping Excel is updated** (new carriers, new charge
 * types / descriptions, category moves, standardized_charge changes, etc.),
 * **`supabase/seed.ts` must be re-run against production** (and staging/local
 * as applicable) immediately after migrations are satisfied, so analyses do
 * not drift from finance’s signed-off mapping:
 *
 *   pnpm dlx tsx supabase/seed.ts
 *
 * Omitting this step causes misclassified or unknown charges / KPIs despite
 * a correct workbook in git. Full env paths and pitfalls: **`docs/ARCHITECTURE.md`**
 * (taxonomy + Related commands sections).
 *
 * -----------------------------------------------------------------------------
 * Mechanics (brief)
 *
 * Seeds **`master_mapping`** from the consolidated mapping workbook.
 *
 * **`MASTER_MAPPING_XLSX`** — explicit path override (optional). Otherwise
 * tries (first existing):
 *   - Invoices skills/Master_Mapping_Consolidated_Updated_3.xlsx
 *   - Invoices skills/Master_Mapping_Consolidated_Updated.xlsx
 *
 * **Env:** `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`;
 * **`SUPABASE_SERVICE_KEY`** (preferred) or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as fallback.
 */
import { createClient } from '@supabase/supabase-js'

import type { MasterMappingXlsxSeedRow } from '../lib/invoices/excel-master-mapping'
import {
  parseMasterMappingXlsxFromFile,
  resolveDefaultMasterMappingXlsxPaths,
} from '../lib/invoices/excel-master-mapping'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const UPSERT_COLUMNS = ['carrier', 'charge_description'] as const
const UPSERT_COLUMNS_STR = UPSERT_COLUMNS.join(',')

/** Supabase rejects oversized batches for wide rows safely under this cap. */
const CHUNK_SIZE = 200

function chunk<T>(xs: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += CHUNK_SIZE) out.push(xs.slice(i, i + CHUNK_SIZE))
  return out
}

function upsertPayload(rows: MasterMappingXlsxSeedRow[]) {
  return rows.map((r) => ({
    carrier: r.carrier,
    charge_description: r.charge_description,
    transportation_mode: r.transportation_mode,
    category_1: r.category_1,
    category_2: r.category_2,
    category_3: r.category_3,
    category_4: r.category_4,
    category_5: r.category_5,
    standardized_charge: r.standardized_charge,
  }))
}

async function seed() {
  const paths = await resolveDefaultMasterMappingXlsxPaths()
  if (!paths.length) {
    console.error(
      'No workbook found. Drop Master_Mapping_Consolidated_Updated*.xlsx under `Invoices skills/` or set MASTER_MAPPING_XLSX.'
    )
    process.exit(1)
  }

  const xlsxPath = paths[0]!
  console.log(`Reading master mapping workbook: ${xlsxPath}`)
  let rows: MasterMappingXlsxSeedRow[]
  try {
    rows = await parseMasterMappingXlsxFromFile(xlsxPath)
  } catch (e) {
    console.error('Failed to parse workbook:', e)
    process.exit(1)
  }

  if (!rows.length) {
    console.error('Workbook parsed zero taxonomy rows.')
    process.exit(1)
  }

  console.log(`Upserting ${rows.length} rows into master_mapping...`)

  const payload = upsertPayload(rows)

  for (const slice of chunk(payload)) {
    const { error: masterErr } = await supabase
      .from('master_mapping')
      .upsert(slice, {
        onConflict: UPSERT_COLUMNS_STR,
        ignoreDuplicates: false,
      })
    if (masterErr) {
      console.error('master_mapping upsert failed:', masterErr.message)
      process.exit(1)
    }
  }

  console.log('Seed complete.')
}

seed()
