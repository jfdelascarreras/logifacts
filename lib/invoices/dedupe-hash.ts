/**
 * Normalize CSV bytes so logically identical exports hash the same (BOM, line endings).
 */
export function normalizeCsvForDedupe(raw: string): string {
  const withoutBom = raw.replace(/^\uFEFF/, '')
  const lf = withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return lf.replace(/\u00a0/g, ' ').trimEnd()
}

/** SHA-256 hex digest of UTF-8 encoded string (Web Crypto). */
export async function sha256HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
