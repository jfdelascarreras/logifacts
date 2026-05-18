/**
 * Read Excel cells as humans see them — avoids Identifier cells stored as doubles
 * being turned into exponential strings (`1.23e+21`) when cast with String(number).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function excelCellAsDisplayString(cell: any): string {
  if (cell === null || cell === undefined) return ''

  const textRaw = typeof cell.text === 'string' ? cell.text.trim() : ''
  if (textRaw.length > 0) return textRaw.replace(/\u00a0/g, ' ').trim()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()

  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'

  if (typeof v === 'number' && Number.isFinite(v)) {
    // Prefer fixed decimal-ish rendering over `String(n)` exponential form.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const nf = typeof cell.numFmt === 'string' ? cell.numFmt : ''
    if (/0{3,}|@/.test(nf)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const s = typeof cell.result === 'string' ? cell.result : ''
        const t = String(s).trim()
        if (t) return t
      } catch {
        // ignore
      }
    }

    let s = v.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 21 })
    if (/[eE]/.test(s)) {
      s = Number.isInteger(v) && Math.abs(v) < Number.MAX_SAFE_INTEGER ? String(Math.trunc(v)) : String(v)
    }
    return s.trim()
  }

  if (typeof v === 'object') {
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      return String((v as { text: string }).text).trim()
    }
    if ('hyperlink' in v && typeof (v as { hyperlink: unknown }).hyperlink === 'string') {
      const h = String((v as { hyperlink: string }).hyperlink).trim()
      if (h) return h
    }
    const rich = v as { richText?: Array<{ text: string }> }
    if (Array.isArray(rich.richText)) {
      const joined = rich.richText.map((t) => t.text).join('')
      if (joined.trim()) return joined.trim()
    }
  }

  return String(v).trim()
}
