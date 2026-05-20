/**
 * Prints consolidated master-mapping workbook rows as JSON (stdout).
 * Used with Supabase MCP `execute_sql` when running seed without local service-role keys.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseMasterMappingXlsxFromFile } from '../lib/invoices/excel-master-mapping'

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const xlsxPath = path.join(root, 'Invoices skills/Master_Mapping_Consolidated_Updated.xlsx')

  const rows = await parseMasterMappingXlsxFromFile(xlsxPath)
  process.stdout.write(JSON.stringify(rows))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
