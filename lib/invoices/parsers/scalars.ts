/** Shared scalar parsing — mirror UPS ingest behavior for Excel parsers. */

export function toNum(v: string | null | undefined): number {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return isNaN(n) ? 0 : n
}

/** Strip null bytes and other control characters Postgres rejects in text columns. */
export function cleanText(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/\u0000/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
}
