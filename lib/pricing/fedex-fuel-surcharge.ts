/**
 * FedEx fuel surcharge HTML parser.
 *
 * FedEx publishes surcharges at:
 *   https://www.fedex.com/en-us/shipping/fuel-surcharge.html
 *
 * NOTE: the URL used in the original spec (/current-rates/fuel-surcharges.html) returns
 * a 404. The correct URL is /shipping/fuel-surcharge.html (verified June 2026).
 *
 * Table column structure (verified June 2026):
 *   0: Ground effective date range  e.g. "June 1, 2026–June 7, 2026"
 *   1: FedEx Ground / HD rate       e.g. "26.75%"
 *   2: Express effective date       e.g. "May 25, 2026"
 *   3: Express domestic package     e.g. "30.75%"   ← header says "package services", not "express"
 *   4: Express freight              e.g. "$0.688 per lb."
 *   5: Export %
 *   6: Import %
 *
 * FedEx Ground tracks DOE diesel (~5-week lag, same index as UPS).
 * FedEx Express tracks DOE kerosene-jet fuel (separate index, currently higher than diesel).
 */

export type FedExLiveFuelRates = {
  ground: number   // FedEx Ground / HD (fraction, e.g. 0.2675)
  express: number  // FedEx Express domestic package (fraction, e.g. 0.3075)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parsePct(raw: string): number | null {
  const m = raw.match(/(\d{1,2}(?:\.\d+)?)\s*%/)
  if (!m) return null
  const v = parseFloat(m[1]!) / 100
  return v > 0.01 && v < 1 ? v : null
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = []
  const re = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(rowHtml)) !== null) cells.push(stripTags(m[2]!))
  return cells
}

// ---------------------------------------------------------------------------
// Strategy 1 — positional table parsing (matches verified FedEx structure)
// ---------------------------------------------------------------------------

function parseFromTable(html: string): FedExLiveFuelRates | null {
  // Walk every <tr> and find the first data row: first cell has a year, second
  // cell is the Ground % (col 1), fourth cell is the Express % (col 3).
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rm: RegExpExecArray | null

  while ((rm = rowRe.exec(html)) !== null) {
    const cells = extractCells(rm[1]!)
    if (cells.length < 4) continue

    // First cell must look like a date range: contains a 4-digit year
    if (!/\b20\d{2}\b/.test(cells[0]!)) continue

    const ground = parsePct(cells[1] ?? '')   // col 1 = Ground rate
    const express = parsePct(cells[3] ?? '')  // col 3 = Express domestic package rate

    if (ground !== null && express !== null) return { ground, express }
  }
  return null
}

// ---------------------------------------------------------------------------
// Strategy 2 — header-indexed table (fallback if column positions shift)
// ---------------------------------------------------------------------------

function parseFromTableByHeader(html: string): FedExLiveFuelRates | null {
  const tableRe = /<table[\s\S]*?<\/table>/gi
  let tm: RegExpExecArray | null

  while ((tm = tableRe.exec(html)) !== null) {
    const table = tm[0]
    const rows: string[] = []
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rm: RegExpExecArray | null
    while ((rm = rowRe.exec(table)) !== null) rows.push(rm[1]!)
    if (rows.length < 2) continue

    const headers = extractCells(rows[0]!).map((h) => h.toLowerCase())

    // Ground column: contains "ground" but not "international"/"intl"
    const groundIdx = headers.findIndex(
      (h) => h.includes('ground') && !h.includes('international') && !h.includes('intl')
    )

    // Express column: FedEx labels it "package services" for domestic Express —
    // match that OR fallback to any express/air column
    const expressIdx =
      headers.findIndex((h) => h.includes('package') && h.includes('domestic')) !== -1
        ? headers.findIndex((h) => h.includes('package') && h.includes('domestic'))
        : headers.findIndex(
            (h) =>
              (h.includes('express') || h.includes('air')) &&
              !h.includes('freight') &&
              !h.includes('export') &&
              !h.includes('import')
          )

    if (groundIdx === -1 || expressIdx === -1) continue

    for (let ri = 1; ri < rows.length; ri++) {
      const cells = extractCells(rows[ri]!)
      const ground = parsePct(cells[groundIdx] ?? '')
      const express = parsePct(cells[expressIdx] ?? '')
      if (ground !== null && express !== null) return { ground, express }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Public entry point (pure — no I/O)
// ---------------------------------------------------------------------------

export function parseFedExFuelSurchargeFromHtml(html: string): FedExLiveFuelRates | null {
  return parseFromTable(html) ?? parseFromTableByHeader(html)
}
