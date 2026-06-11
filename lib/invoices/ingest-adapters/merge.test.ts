import { describe, expect, it } from 'vitest'

import { mergeCarrierIngestResults } from './merge'
import type { CarrierIngestResult } from './types'
import { ZERO_INGEST_DIAGNOSTICS } from './types'
import type { InvoiceRecord } from '@/lib/invoices/csv'

function row(net: string, carrier = 'FedEx'): InvoiceRecord {
  return {
    'Net Amount': net,
    'Invoice Amount': net,
    'Charge Description': 'Test',
    'Carrier Name': carrier,
    'Invoice Date': '2025-01-01',
    'Invoice Number': 'INV1',
  } as InvoiceRecord
}

function part(
  carrier: CarrierIngestResult['carrier'],
  records: InvoiceRecord[],
  sourceCount: number
): CarrierIngestResult {
  return {
    carrier,
    records,
    sourceCount,
    diagnostics: { ...ZERO_INGEST_DIAGNOSTICS },
  }
}

describe('mergeCarrierIngestResults', () => {
  it('concatenates records and sums source counts across carriers', () => {
    const merged = mergeCarrierIngestResults([
      part('UPS', [row('10', 'UPS')], 2),
      part('FedEx', [row('20')], 1),
      null,
      part('WWE', [row('5', 'WWE')], 3),
    ])
    expect(merged.records).toHaveLength(3)
    expect(merged.sourceCount).toBe(6)
    expect(merged.diagnostics).toEqual(ZERO_INGEST_DIAGNOSTICS)
  })

  it('accumulates ingest diagnostics from UPS CSV adapter', () => {
    const merged = mergeCarrierIngestResults([
      {
        carrier: 'UPS',
        records: [row('1', 'UPS')],
        sourceCount: 1,
        diagnostics: {
          duplicateUploadRowsSkipped: 2,
          duplicateChargeRowsDropped: 3,
          rowsDroppedCriticalSciCorruption: 1,
        },
        upsSyncTagged: [{ record: row('1', 'UPS'), invoiceUploadId: 'u1' }],
      },
    ])
    expect(merged.diagnostics.duplicateUploadRowsSkipped).toBe(2)
    expect(merged.diagnostics.duplicateChargeRowsDropped).toBe(3)
    expect(merged.upsSyncTagged).toHaveLength(1)
  })
})
