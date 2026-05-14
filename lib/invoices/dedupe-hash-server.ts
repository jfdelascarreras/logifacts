import { createHash } from 'node:crypto'

import type { InvoiceRecord } from './csv'
import { normalizeCsvForDedupe } from './dedupe-hash'

/** Same fingerprint as the upload UI (UTF-8 SHA-256 hex). */
export function sha256HexUtf8Sync(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function contentSha256FromStoredCsv(csvText: string): string {
  return sha256HexUtf8Sync(normalizeCsvForDedupe(csvText))
}

/**
 * Stable dedup key for one invoice charge line.
 *
 * Per UPS invoice spec, a unique charge is identified by the combination of:
 *   Invoice Number + Tracking Number + Charge Category Code +
 *   Charge Category Detail Code + Net Amount
 *
 * Two rows sharing all five values are considered the same charge and should
 * be counted only once, even when they appear in multiple overlapping CSV exports.
 */
export function invoiceRowHash(rec: InvoiceRecord): string {
  const key = [
    (rec['Invoice Number'] ?? '').trim(),
    (rec['Tracking Number'] ?? '').trim(),
    (rec['Charge Category Code'] ?? '').trim(),
    (rec['Charge Category Detail Code'] ?? '').trim(),
    (rec['Net Amount'] ?? '').trim(),
  ].join('\0')
  return sha256HexUtf8Sync(key)
}
