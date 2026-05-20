/**
 * Prints batched UPSERT statements (writes to cwd .chunk-*.sql) OR stdout with markers.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import type { MasterMappingXlsxSeedRow } from '../lib/invoices/excel-master-mapping'
import { parseMasterMappingXlsxFromFile } from '../lib/invoices/excel-master-mapping'

const XLSX =
  process.env.MASTER_MAPPING_XLSX ?? 'Invoices skills/Master_Mapping_Consolidated_Updated.xlsx'
const BATCH = Math.max(1, Number(process.env.SEED_CHUNK_SIZE ?? '45'))

function buildUpsert(rows: MasterMappingXlsxSeedRow[]): string {
  const payload = rows.map((r) => ({
    charge_description: r.charge_description,
    transportation_mode: r.transportation_mode,
    category_1: r.category_1,
    category_2: r.category_2,
    category_3: r.category_3,
    category_4: r.category_4,
    category_5: r.category_5,
    carrier: r.carrier,
    standardized_charge: r.standardized_charge,
  }))
  const j = JSON.stringify(payload)
  let tagBase = 'mseed'
  while (j.includes(`$${tagBase}$`)) tagBase += 'x'
  const delim = `$${tagBase}$`

  return `
INSERT INTO public.master_mapping (
  charge_description, transportation_mode, category_1, category_2, category_3,
  category_4, category_5, carrier, standardized_charge
)
SELECT
  b.charge_description, b.transportation_mode, b.category_1, b.category_2, b.category_3,
  b.category_4, b.category_5, b.carrier,
  CASE WHEN trim(COALESCE(b.standardized_charge, '')) = '' THEN NULL ELSE b.standardized_charge END
FROM jsonb_to_recordset(${delim}${j}${delim}::jsonb) AS b(
  charge_description text,
  transportation_mode text,
  category_1 text,
  category_2 text,
  category_3 text,
  category_4 text,
  category_5 text,
  carrier text,
  standardized_charge text
)
ON CONFLICT (carrier, charge_description) DO UPDATE SET
  transportation_mode = EXCLUDED.transportation_mode,
  category_1 = EXCLUDED.category_1,
  category_2 = EXCLUDED.category_2,
  category_3 = EXCLUDED.category_3,
  category_4 = EXCLUDED.category_4,
  category_5 = EXCLUDED.category_5,
  standardized_charge = EXCLUDED.standardized_charge;`.trim()
}

;(async () => {
  console.error(`Workbook: ${path.resolve(XLSX)}`)
  const mapped = await parseMasterMappingXlsxFromFile(XLSX)
  if (!mapped.length) {
    console.error('No rows')
    process.exit(1)
  }
  console.error(`Parsed ${mapped.length} rows, batch=${BATCH}`)

  const outDir = path.join(process.cwd(), 'scripts')
  let idx = 0
  for (let i = 0; i < mapped.length; i += BATCH) {
    const slice = mapped.slice(i, i + BATCH)
    const mm = buildUpsert(slice)
    const file = path.join(outDir, `.seed-chunk-${String(idx).padStart(2, '0')}.sql`)
    fs.writeFileSync(`${file}`, `-- chunk ${idx} rows ${slice.length}\n${mm}\n`)
    idx++
  }
  console.error(`Wrote ${idx} chunk files under scripts/.seed-chunk-*.sql`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
