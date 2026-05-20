/**
 * One-off: emit SQL to upsert public.master_mapping from the workbook.
 */
import { parseMasterMappingXlsxFromFile } from '../lib/invoices/excel-master-mapping'

const XLSX =
  process.env.MASTER_MAPPING_XLSX ?? 'Invoices skills/Master_Mapping_Consolidated_Updated.xlsx'

type RowJson = {
  charge_description: string
  transportation_mode: string
  category_1: string
  category_2: string
  category_3: string
  category_4: string
  category_5: string
  carrier: string
  standardized_charge: string | null
}

;(async () => {
  console.error(`Parsing workbook: ${XLSX}`)
  const mapped = await parseMasterMappingXlsxFromFile(XLSX)
  if (!mapped.length) {
    console.error('Zero rows.')
    process.exit(1)
  }

  const rows: RowJson[] = mapped.map((r) => ({
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

  const j = JSON.stringify(rows)
  let tag = 'mapseed'
  while (j.includes(`$${tag}$`)) tag = `${tag}x`
  const delim = `$${tag}$`

  const sql = `
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

  console.log('-- UPSERT master_mapping')
  console.log(sql)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
