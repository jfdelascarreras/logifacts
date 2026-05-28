export type LiveFuelRates = { ground: number; air: number }

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parsePct(raw: string): number | null {
  const m = raw.match(/(\d{1,3}(?:\.\d+)?)\s*%/)
  if (!m) return null
  const v = parseFloat(m[1]) / 100
  return v > 0 && v < 1 ? v : null
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = []
  // Match both <th> and <td>, using backreference so closing tag matches
  const re = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(rowHtml)) !== null) {
    cells.push(stripTags(m[2]))
  }
  return cells
}

function parseFromTable(html: string): LiveFuelRates | null {
  // Find each <table>...</table> block
  const tableRe = /<table[\s\S]*?<\/table>/gi
  let tm: RegExpExecArray | null

  while ((tm = tableRe.exec(html)) !== null) {
    const table = tm[0]

    // Collect all <tr> row contents
    const rows: string[] = []
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rm: RegExpExecArray | null
    while ((rm = rowRe.exec(table)) !== null) {
      rows.push(rm[1])
    }

    if (rows.length < 2) continue

    // Use first row as headers (handles both <th> and <td>-based headers)
    const headers = extractCells(rows[0]).map(h => h.toLowerCase())
    if (headers.length < 2) continue

    // Domestic Ground — exclude "international/intl"
    const groundIdx = headers.findIndex(
      h => h.includes('ground') && !h.includes('international') && !h.includes('intl')
    )
    // Domestic Air — exclude international, export, import
    const airIdx = headers.findIndex(
      h =>
        h.includes('air') &&
        !h.includes('international') &&
        !h.includes('intl') &&
        !h.includes('export') &&
        !h.includes('import')
    )

    if (groundIdx === -1 || airIdx === -1) continue

    // Walk remaining rows looking for a row that has percentage values at those columns
    for (let ri = 1; ri < rows.length; ri++) {
      const cells = extractCells(rows[ri])
      const ground = parsePct(cells[groundIdx] ?? '')
      const air = parsePct(cells[airIdx] ?? '')
      if (ground !== null && air !== null) return { ground, air }
    }
  }

  return null
}

function parseFromRegex(html: string): LiveFuelRates | null {
  const plain = stripTags(html)

  // Look for "Domestic ... Ground ... XX%" — must precede international variants
  const groundM = plain.match(
    /[Dd]omestic[^%\d]{0,40}?[Gg]round[^%\d]{0,30}?(\d{1,3}(?:\.\d+)?)\s*%/
  ) ?? plain.match(/\b[Gg]round\b[^%\d]{0,30}?(\d{1,3}(?:\.\d+)?)\s*%/)

  // Look for "Domestic ... Air ... XX%" (before any Export/Import/International)
  const airM = plain.match(
    /[Dd]omestic[^%\d]{0,40}?[Aa]ir[^%\d]{0,30}?(\d{1,3}(?:\.\d+)?)\s*%/
  )

  if (!groundM || !airM) return null

  const ground = parseFloat(groundM[1]) / 100
  const air = parseFloat(airM[1]) / 100
  if (ground <= 0 || ground >= 1 || air <= 0 || air >= 1) return null

  return { ground, air }
}

/**
 * Extracts domestic ground and air fuel surcharge rates from the
 * UPS fuel surcharges page HTML.  Returns null if the expected
 * table structure cannot be found.
 *
 * Pure function — no I/O.  Pass any HTML string; the live fetch
 * belongs in the API route.
 */
export function parseFuelSurchargeFromHtml(html: string): LiveFuelRates | null {
  return parseFromTable(html) ?? parseFromRegex(html)
}
