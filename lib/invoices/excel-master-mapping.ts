/**
 * Loads consolidated master mapping worksheets (Charge Description … Category 5, Carrier,
 * Standardized Charge) produced from `Master_Mapping_Consolidated_Updated*.xlsx`.
 */
import ExcelJS from 'exceljs'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { Carrier } from '@/types/invoice'
import { excelCellStr } from '@/lib/invoices/parsers/excel-row'

import { cleanText } from '@/lib/invoices/parsers/scalars'

export type MasterMappingXlsxSeedRow = {
  carrier: Carrier
  charge_description: string
  transportation_mode: string
  category_1: string
  category_2: string
  category_3: string
  category_4: string
  category_5: string
  standardized_charge: string | null
}

const HEADER_VARIANTS = {
  chargeDescription: ['charge description'],
  transportationMode: ['transportation_mode', 'transportation mode'],
  carrier: ['carrier'],
  standardizedCharge: ['standardized charge', 'standardised charge'],
}

export function normalizeCarrierRaw(raw: string | null | undefined): Carrier {
  const canon = cleanText(raw)
    .toUpperCase()
    .replace(/\s+/g, ' ')
  if (!canon || canon === '-') return 'UPS'
  if (canon.includes('FED') || canon === 'FX' || canon === 'FDX') return 'FedEx'
  if (canon.includes('WORLD') || canon.includes('WWE') || canon === 'WORLDWIDE') return 'WWE'
  if (canon.includes('UPS')) return 'UPS'
  return 'UPS'
}

function canonHeaderLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Scan enough columns even when worksheets are sparse-trimmed near the edges. */
function headerCell(row: ExcelJS.Row, colZeroBased: number): string {
  return excelCellStr(row, colZeroBased)
}

function findColumnBindings(
  row: ExcelJS.Row,
  scanCols: number
): Record<string, number> | null {
  const reverse = new Map<string, number>()
  for (let c = 0; c < scanCols; c++) {
    const label = canonHeaderLabel(headerCell(row, c))
    if (label.length > 0) reverse.set(label, c)
  }

  const pickFirst = (keys: readonly string[]): number | undefined => {
    for (const k of keys) {
      const ix = reverse.get(k)
      if (ix !== undefined) return ix
    }
    return undefined
  }

  const chargeDescIdx = pickFirst(HEADER_VARIANTS.chargeDescription)
  if (chargeDescIdx === undefined) return null

  const out: Record<string, number> = { charge_description: chargeDescIdx }

  const tm = pickFirst(HEADER_VARIANTS.transportationMode)
  if (tm !== undefined) out.transportation_mode = tm

  for (let n = 1; n <= 5; n++) {
    const k = canonHeaderLabel(`category ${n}`)
    const ix = reverse.get(k)
    if (ix !== undefined) out[`category_${n}`] = ix
  }

  const cx = pickFirst(HEADER_VARIANTS.carrier)
  if (cx !== undefined) out.carrier = cx

  const sx = pickFirst(HEADER_VARIANTS.standardizedCharge)
  if (sx !== undefined) out.standardized_charge = sx

  /** Title rows occasionally repeat a sheet name everywhere — exclude them. */
  const hasStructural =
    out.transportation_mode !== undefined ||
    out.category_1 !== undefined ||
    out.carrier !== undefined ||
    out.standardized_charge !== undefined
  if (!hasStructural) return null

  return out
}

function grab(row: ExcelJS.Row, col: number | undefined, scanCols: number): string {
  if (col === undefined || col >= scanCols || col < 0) return ''
  return excelCellStr(row, col)
}

/** First row that declares mapping columns plus at least one taxonomy column. */
function findHeaderBindings(
  ws: ExcelJS.Worksheet,
  scanCols: number
): { bind: Record<string, number>; headerRowNum: number } | null {
  const maxProbe = Math.min(ws.rowCount ?? 0, 40)
  for (let rn = 1; rn <= maxProbe; rn++) {
    const row = ws.getRow(rn)
    const b = findColumnBindings(row, scanCols)
    if (b) return { bind: b, headerRowNum: rn }
  }
  return null
}

function toNodeBuffer(blob: Uint8Array | ArrayBufferLike): Buffer {
  return Buffer.isBuffer(blob) ? blob : Buffer.from(blob as Uint8Array)
}

/** Dedupe (carrier × charge_description); last workbook row wins. */
export async function parseMasterMappingXlsx(
  blob: Uint8Array | ArrayBufferLike
): Promise<MasterMappingXlsxSeedRow[]> {
  const wb = new ExcelJS.Workbook()
  // exceljs pins an older `Buffer` declaration than Node's generic `Buffer<ArrayBufferLike>`.
  // @ts-expect-error — runtime buffer is valid
  await wb.xlsx.load(toNodeBuffer(blob))

  const ws = wb.worksheets[0]
  if (!ws) return []

  const scanCols = 30
  const header = findHeaderBindings(ws, scanCols)
  if (!header) {
    throw new Error(
      'Master mapping workbook: header row not found (expected Charge Description, taxonomy columns, optional Carrier / Standardized Charge).'
    )
  }

  const { bind, headerRowNum } = header
  const dup = new Map<string, MasterMappingXlsxSeedRow>()

  for (let rn = headerRowNum + 1; rn <= (ws.rowCount ?? 0); rn++) {
    const row = ws.getRow(rn)
    const chargeDescRaw = grab(row, bind.charge_description, scanCols)
    if (!chargeDescRaw || /^charge\s*description$/i.test(chargeDescRaw)) continue

    const carrier = normalizeCarrierRaw(
      bind.carrier !== undefined ? grab(row, bind.carrier, scanCols) : 'UPS'
    )

    const stdRaw = grab(row, bind.standardized_charge, scanCols)
    const standardized_charge =
      cleanText(stdRaw).length > 0 ? cleanText(stdRaw) : null

    const tm = grab(row, bind.transportation_mode, scanCols)
    const c1 = grab(row, bind.category_1, scanCols)
    const c2 = grab(row, bind.category_2, scanCols)
    const c3 = grab(row, bind.category_3, scanCols)
    const c4 = grab(row, bind.category_4, scanCols)
    const c5 = grab(row, bind.category_5, scanCols)

    const payload: MasterMappingXlsxSeedRow = {
      carrier,
      charge_description: chargeDescRaw,
      transportation_mode: cleanText(tm),
      category_1: cleanText(c1),
      category_2: cleanText(c2),
      category_3: cleanText(c3),
      category_4: cleanText(c4),
      category_5: cleanText(c5),
      standardized_charge,
    }

    dup.set(`${carrier}\t${chargeDescRaw}`, payload)
  }

  return [...dup.values()]
}

/** Resolve workbook path(s); first readable path wins for seeding scripts. */
export async function resolveDefaultMasterMappingXlsxPaths(cwd?: string): Promise<string[]> {
  const root = cwd ?? process.cwd()
  const envPath = process.env.MASTER_MAPPING_XLSX
  const candidates = [
    envPath?.trim(),
    path.join(root, 'Invoices skills/Master_Mapping_Consolidated_Updated_3.xlsx'),
    path.join(root, 'Invoices skills/Master_Mapping_Consolidated_Updated.xlsx'),
  ].filter((p): p is string => Boolean(p?.length))

  const seen = new Set<string>()
  const out: string[] = []
  for (const p of candidates) {
    const resolved = path.resolve(p)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    try {
      await fs.stat(resolved)
      out.push(resolved)
    } catch {
      /* missing */
    }
  }
  return out
}

export async function parseMasterMappingXlsxFromFile(filePath: string): Promise<MasterMappingXlsxSeedRow[]> {
  const buf = await fs.readFile(filePath)
  return parseMasterMappingXlsx(buf)
}
