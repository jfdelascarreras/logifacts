import { describe, expect, it } from 'vitest'

import {
  LEGACY_INGEST_DEPRECATION,
  resolvePremiumIngestSource,
} from '@/lib/premium-analysis/ingest-adapters/index'
import {
  contentSha256Hex,
  rawInvoiceFilesRetainEnabled,
} from '@/lib/invoices/raw-invoice-files'

describe('resolvePremiumIngestSource — S6 default', () => {
  it('defaults to invoice_rows', () => {
    const prev = process.env.PREMIUM_INGEST_SOURCE
    delete process.env.PREMIUM_INGEST_SOURCE
    expect(resolvePremiumIngestSource()).toBe('invoice_rows')
    if (prev !== undefined) process.env.PREMIUM_INGEST_SOURCE = prev
  })

  it('still accepts legacy and auto for rollback', () => {
    const prev = process.env.PREMIUM_INGEST_SOURCE
    process.env.PREMIUM_INGEST_SOURCE = 'legacy'
    expect(resolvePremiumIngestSource()).toBe('legacy')
    process.env.PREMIUM_INGEST_SOURCE = 'auto'
    expect(resolvePremiumIngestSource()).toBe('auto')
    if (prev !== undefined) process.env.PREMIUM_INGEST_SOURCE = prev
    else delete process.env.PREMIUM_INGEST_SOURCE
  })
})

describe('legacy ingest deprecation', () => {
  it('documents rollback message', () => {
    expect(LEGACY_INGEST_DEPRECATION).toMatch(/invoice_rows/)
    expect(LEGACY_INGEST_DEPRECATION).toMatch(/legacy/)
  })
})

describe('raw invoice file retention', () => {
  it('is off unless RAW_INVOICE_FILES_RETAIN=1', () => {
    const prev = process.env.RAW_INVOICE_FILES_RETAIN
    delete process.env.RAW_INVOICE_FILES_RETAIN
    expect(rawInvoiceFilesRetainEnabled()).toBe(false)
    process.env.RAW_INVOICE_FILES_RETAIN = '1'
    expect(rawInvoiceFilesRetainEnabled()).toBe(true)
    if (prev !== undefined) process.env.RAW_INVOICE_FILES_RETAIN = prev
    else delete process.env.RAW_INVOICE_FILES_RETAIN
  })

  it('hashes buffer deterministically', () => {
    const a = contentSha256Hex(Buffer.from('fedex-invoice'))
    const b = contentSha256Hex(Buffer.from('fedex-invoice'))
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })
})
