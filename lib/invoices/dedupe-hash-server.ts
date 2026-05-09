import { createHash } from 'node:crypto'

import { normalizeCsvForDedupe } from './dedupe-hash'

/** Same fingerprint as the upload UI (UTF-8 SHA-256 hex). */
export function sha256HexUtf8Sync(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function contentSha256FromStoredCsv(csvText: string): string {
  return sha256HexUtf8Sync(normalizeCsvForDedupe(csvText))
}
