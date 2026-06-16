/**
 * Sprint 1 smoke tests — run before S2:
 *   pnpm exec vitest run lib/premium-analysis/s1-smoke.test.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { FEDEX_PARSE_VERSION } from '@/lib/invoices/charge-line-contract'
import { legacyXlsBufferToXlsxBuffer } from '@/lib/invoices/fixtures/legacy-xls-as-xlsx-buffer'
import { mapInvoiceLines } from '@/lib/invoices/mapping'
import { mappedMultipartLineToRow } from '@/lib/invoices/invoice-rows'
import { parseFedExWorksheet } from '@/lib/invoices/parsers/fedex'
import { buildIngestDiagnostics } from '@/lib/premium-analysis/ingest-diagnostics'
import { invoiceLinesToRecords } from '@/lib/premium-analysis/ingest-adapters/shared'
import { computeInvoiceAnalysisSummary, buildChargeDescriptionLookup } from '@/lib/premium-analysis/analysis-summary'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEDEX_FIXTURE = path.join(
  __dirname,
  '../../Invoices skills/FedEx Invoice Example/FedEx_invoice_8-694-83570.XLS'
)

const FUEL_MAPPING = [
  {
    carrier: 'FedEx',
    charge_description: 'Fuel Surcharge',
    standardized_charge: 'Fuel Surcharge',
    transportation_mode: 'Express',
    category_1: 'Fuel',
    category_2: 'Fuel',
    category_3: 'FUEL SURCHARGE',
    category_4: '',
    category_5: '',
  },
]

describe('S1 smoke — FedEx ingest pipeline', () => {
  it('end-to-end: parse → map → invoice_rows → analyze projection', async () => {
    const raw = fs.readFileSync(FEDEX_FIXTURE)
    const xlsxBuf = legacyXlsBufferToXlsxBuffer(raw)
    const workbook = new ExcelJS.Workbook()
    // @ts-expect-error exceljs Buffer typing
    await workbook.xlsx.load(xlsxBuf)
    const parsed = parseFedExWorksheet(workbook.worksheets[0])

    expect(parsed.length).toBeGreaterThan(500)

    const withAccount = parsed.filter((l) => l.account_number?.trim()).length
    const withWeights = parsed.filter(
      (l) => (l.billed_weight ?? 0) > 0 && (l.entered_weight ?? 0) > 0
    ).length
    const withTracking = parsed.filter((l) => l.tracking_id?.trim()).length

    expect(withAccount / parsed.length).toBeGreaterThan(0.9)
    expect(withWeights / parsed.length).toBeGreaterThan(0.5)
    expect(withTracking / parsed.length).toBeGreaterThan(0.5)
    expect(parsed.every((l) => l.parse_version === FEDEX_PARSE_VERSION)).toBe(true)

    // Simulate mapInvoiceLines output shape (no Supabase)
    const mapped = await mapInvoiceLines(parsed.slice(0, 50), 'inv-id', 'FedEx', {
      from: () => ({
        select: () => ({
          eq: () => ({
            data: FUEL_MAPPING,
            error: null,
          }),
        }),
      }),
    } as never)

    const fuelMapped = mapped.find((l) => l.charge_description === 'Fuel Surcharge')
    expect(fuelMapped?.mapped).toBe(true)
    expect(fuelMapped?.category_3).toBe('FUEL SURCHARGE')
    expect(fuelMapped?.account_number).toBeTruthy()
    expect(fuelMapped?.billed_weight).toBeGreaterThan(0)

    const factRow = mappedMultipartLineToRow(
      { ...fuelMapped!, invoice_id: 'inv-id' },
      'user-id',
      'source-inv-id',
      '8-694-83570',
      '01/22/2025'
    )
    expect(factRow.mapped).toBe(true)
    expect(factRow.standardized_charge).toBe('Fuel Surcharge')
    expect(factRow.category_3).toBe('FUEL SURCHARGE')
    expect(factRow.account_number).toBeTruthy()
    expect(factRow.billed_weight).toBeGreaterThan(0)
    expect(factRow.parse_version).toBe(FEDEX_PARSE_VERSION)

    const rawLines = parsed.map((line) => ({
      invoice_id: 'inv-id',
      charge_description: line.charge_description,
      charge_amount: line.charge_amount,
      zone: line.zone ?? null,
      destination_state: line.destination_state ?? null,
      shipment_date: line.shipment_date ?? null,
      transaction_date: line.transaction_date ?? null,
      reference_1: line.tracking_id ?? null,
      service_level: line.service_level ?? null,
      charge_classification_code: line.charge_classification_code ?? null,
      charge_category_code: line.charge_category_code ?? null,
      package_quantity: line.package_quantity ?? 1,
      account_number: line.account_number ?? null,
      billed_weight: line.billed_weight ?? null,
      entered_weight: line.entered_weight ?? null,
      parse_version: line.parse_version ?? null,
    }))

    const records = invoiceLinesToRecords(rawLines, [
      {
        id: 'inv-id',
        invoice_number: '8-694-83570',
        invoice_date: '01/22/2025',
        carrier: 'FedEx',
      },
    ])

    const lookup = buildChargeDescriptionLookup(FUEL_MAPPING)
    const summary = computeInvoiceAnalysisSummary(records, lookup)

    expect(summary.measures.packageDedupeShipmentCount).toBeGreaterThan(100)
    expect(summary.measures.weightGap).toBeGreaterThan(0)
    expect(records.some((r) => (r['Account Number'] ?? '').trim().length > 0)).toBe(true)
    expect(records.some((r) => toNumber(r['Billed Weight']) > 0)).toBe(true)

    const diagnostics = buildIngestDiagnostics(
      records,
      {
        duplicateUploadRowsSkipped: 0,
        duplicateChargeRowsDropped: 0,
        rowsDroppedCriticalSciCorruption: 0,
      },
      lookup,
      [FEDEX_PARSE_VERSION]
    )

    expect(diagnostics.linesTotal).toBe(records.length)
    expect(diagnostics.shipmentsTotal).toBeGreaterThan(100)
    expect(diagnostics.shipmentsWithoutTracking).toBe(0)
    expect(diagnostics.parseVersions).toEqual([FEDEX_PARSE_VERSION])

    // eslint-disable-next-line no-console
    console.log('\n[S1 smoke summary]')
    // eslint-disable-next-line no-console
    console.log({
      lines: parsed.length,
      withAccountPct: `${((withAccount / parsed.length) * 100).toFixed(1)}%`,
      withWeightsPct: `${((withWeights / parsed.length) * 100).toFixed(1)}%`,
      withTrackingPct: `${((withTracking / parsed.length) * 100).toFixed(1)}%`,
      shipments: summary.measures.packageDedupeShipmentCount,
      totalCost: summary.measures.totalCost,
      weightGap: summary.measures.weightGap,
      diagnostics,
    })
  }, 15_000)
})

function toNumber(value: string | null): number {
  if (!value) return 0
  const n = parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
