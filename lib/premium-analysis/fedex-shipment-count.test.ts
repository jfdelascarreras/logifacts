import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { legacyXlsBufferToXlsxBuffer } from '@/lib/invoices/fixtures/legacy-xls-as-xlsx-buffer'
import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'
import { parseFedExWorksheet } from '@/lib/invoices/parsers/fedex'
import { invoiceLinesToRecords } from '@/lib/premium-analysis/ingest-adapters/shared'
import { computeInvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEDEX_FIXTURE = path.join(
  __dirname,
  '../../Invoices skills/FedEx Invoice Example/FedEx_invoice_8-694-83570.XLS'
)

describe('FedEx shipment volume', () => {
  it('counts distinct tracking IDs after multipart ingest mapping', async () => {
    const raw = fs.readFileSync(FEDEX_FIXTURE)
    const xlsxBuf = legacyXlsBufferToXlsxBuffer(raw)
    const workbook = new ExcelJS.Workbook()
    // @ts-expect-error exceljs Buffer typing
    await workbook.xlsx.load(xlsxBuf)
    const lines = parseFedExWorksheet(workbook.worksheets[0])

    const invoiceId = 'test-invoice'
    const rawLines = lines.map((line) => ({
      invoice_id: invoiceId,
      charge_description: line.charge_description,
      charge_amount: line.charge_amount,
      zone: line.zone ?? null,
      destination_state: line.destination_state ?? null,
      shipment_date: line.shipment_date ?? null,
      reference_1: line.tracking_id ?? null,
      service_level: line.service_level ?? null,
      charge_classification_code: line.charge_classification_code ?? null,
      charge_category_code: line.charge_category_code ?? null,
      package_quantity: line.package_quantity ?? 1,
    }))

    const records = invoiceLinesToRecords(rawLines, [
      {
        id: invoiceId,
        invoice_number: lines[0]?.invoice_number ?? 'INV-TEST',
        invoice_date: lines[0]?.invoice_date ?? '2025-01-01',
        carrier: 'FedEx',
      },
    ])

    const summary = computeInvoiceAnalysisSummary(records, new Map())
    expect(summary.measures.packageDedupeShipmentCount).toBeGreaterThan(100)
    expect(summary.measures.totalPackages).toBeGreaterThan(100)

    const sample = records.find((r) => (r['Tracking Number'] ?? '').trim()) as InvoiceRecord
    expect(sample['Tracking Number']?.trim().length).toBeGreaterThan(5)
    expect(sample['Carrier Name']).toBe('FedEx')
    expect(INVOICE_HEADERS.includes('Tracking Number')).toBe(true)
  }, 15_000)
})
