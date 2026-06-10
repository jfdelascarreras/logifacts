/**
 * Converts FedEx source documents into JSON data files consumed by lib/pricing/.
 *
 * Usage:
 *   pnpm dlx tsx scripts/convert-fedex-data.ts
 *
 * Delegates PDF parsing and zone bootstrap to scripts/convert_fedex_data.py
 * (requires `pdftotext` on PATH — brew install poppler).
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PY = path.join(__dirname, 'convert_fedex_data.py')

const result = spawnSync('python3', [PY], { stdio: 'inherit' })
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
