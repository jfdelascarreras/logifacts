import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { enrichSummaryWithAgentsOutputs } from '@/lib/premium-analysis/agents-outputs'
import { computeInvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'
import { FEDEX_PARSE_VERSION } from '@/lib/invoices/charge-line-contract'
import { legacyXlsBufferToXlsxBuffer } from '@/lib/invoices/fixtures/legacy-xls-as-xlsx-buffer'
import { parseFedExWorksheet } from '@/lib/invoices/parsers/fedex'
import { invoiceLinesToRecords } from '@/lib/premium-analysis/ingest-adapters/shared'
import { estimateSavings } from '@/lib/premium-analysis/savings-estimator'
import { sumDollarFlagAmounts } from '@/lib/premium-analysis/anomaly-detection'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEDEX_FIXTURE = path.join(
  __dirname,
  '../../Invoices skills/FedEx Invoice Example/FedEx_invoice_8-694-83570.XLS'
)

describe('golden ingest — FedEx fixture', () => {
  it('parses tracking, weights, accounts, and respects savings spend cap', async () => {
    const raw = fs.readFileSync(FEDEX_FIXTURE)
    const xlsxBuf = legacyXlsBufferToXlsxBuffer(raw)
    const workbook = new ExcelJS.Workbook()
    // @ts-expect-error exceljs Buffer typing
    await workbook.xlsx.load(xlsxBuf)
    const parsed = parseFedExWorksheet(workbook.worksheets[0])

    expect(parsed.length).toBeGreaterThan(100)
    const withTracking = parsed.filter((l) => l.tracking_id?.trim())
    expect(withTracking.length).toBeGreaterThan(50)
    expect(withTracking.every((l) => l.parse_version === FEDEX_PARSE_VERSION)).toBe(true)

    const withAccount = parsed.filter((l) => l.account_number?.trim())
    expect(withAccount.length).toBeGreaterThan(50)

    const withWeights = parsed.filter(
      (l) => (l.billed_weight ?? 0) > 0 || (l.entered_weight ?? 0) > 0
    )
    expect(withWeights.length).toBeGreaterThan(50)

    const invoiceId = 'golden-invoice'
    const rawLines = parsed.map((line) => ({
      invoice_id: invoiceId,
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
        id: invoiceId,
        invoice_number: parsed[0]?.invoice_number ?? 'INV-TEST',
        invoice_date: parsed[0]?.invoice_date ?? '2025-01-01',
        carrier: 'FedEx',
      },
    ])

    const lookup = new Map()
    const summary = computeInvoiceAnalysisSummary(records, lookup)
    expect(summary.measures.packageDedupeShipmentCount).toBeGreaterThan(100)
    expect(summary.measures.weightGap).toBeGreaterThan(0)

    const enriched = enrichSummaryWithAgentsOutputs(summary, records, [], null)
    const flags = enriched.anomalyFlags
    const flagTotal = sumDollarFlagAmounts(flags)
    expect(flagTotal).toBeLessThanOrEqual(summary.measures.totalCost + 0.01)
    const savings = estimateSavings(flags, summary.monthlySpend, summary.measures.totalCost)
    const annualizedCap = (summary.measures.totalCost / Math.max(1, savings.annualizedBasisMonths)) * 12
    expect(savings.high).toBeLessThanOrEqual(annualizedCap + 0.01)
  }, 15_000)
})
