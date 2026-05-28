import { describe, it, expect } from 'vitest'
import { parseFuelSurchargeFromHtml } from './ups-fuel-surcharge'

// Minimal fixture matching UPS fuel surcharges page table structure
const STANDARD_TABLE = `
<html><body>
<table>
  <thead>
    <tr>
      <th>Effective Date</th>
      <th>Domestic Package — Air</th>
      <th>Domestic Package — Ground</th>
      <th>Export (Air)</th>
      <th>Import (Air)</th>
      <th>International Ground</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>May 26, 2025</td>
      <td>31.25%</td>
      <td>27.50%</td>
      <td>41.50%</td>
      <td>45.25%</td>
      <td>27.75%</td>
    </tr>
    <tr>
      <td>May 19, 2025</td>
      <td>30.75%</td>
      <td>27.75%</td>
      <td>40.75%</td>
      <td>44.50%</td>
      <td>27.75%</td>
    </tr>
  </tbody>
</table>
</body></html>
`

// Table with <td> headers (some UPS pages render this way)
const TD_HEADER_TABLE = `
<table>
  <tbody>
    <tr>
      <td><b>Effective Date</b></td>
      <td><b>Domestic Air (%)</b></td>
      <td><b>Domestic Ground (%)</b></td>
      <td><b>International Ground (%)</b></td>
    </tr>
    <tr>
      <td>May 26, 2025</td>
      <td>31.25%</td>
      <td>27.50%</td>
      <td>27.75%</td>
    </tr>
  </tbody>
</table>
`

// Reversed column order (Ground before Air)
const REVERSED_COLUMNS = `
<table>
  <thead>
    <tr>
      <th>Effective Date</th>
      <th>Domestic Ground</th>
      <th>Domestic Air</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>May 26, 2025</td>
      <td>27.50%</td>
      <td>31.25%</td>
    </tr>
  </tbody>
</table>
`

// No fuel surcharge table — irrelevant table only
const NO_RELEVANT_TABLE = `
<table>
  <tr><th>Name</th><th>Price</th></tr>
  <tr><td>Widget</td><td>$9.99</td></tr>
</table>
`

// Plain text with percentages (tests regex fallback path)
const PLAIN_TEXT_HTML = `
<div>
  <p>Domestic Package Air: 31.25%</p>
  <p>Domestic Package Ground: 27.50%</p>
  <p>International Ground: 27.75%</p>
</div>
`

describe('parseFuelSurchargeFromHtml', () => {
  it('parses standard UPS table (th headers, air before ground)', () => {
    const result = parseFuelSurchargeFromHtml(STANDARD_TABLE)
    expect(result).not.toBeNull()
    expect(result!.air).toBeCloseTo(0.3125)
    expect(result!.ground).toBeCloseTo(0.275)
  })

  it('returns first (most recent) data row only', () => {
    const result = parseFuelSurchargeFromHtml(STANDARD_TABLE)
    // Should be the first row (May 26), not the second (May 19)
    expect(result!.air).toBeCloseTo(0.3125)
    expect(result!.ground).toBeCloseTo(0.275)
  })

  it('parses table with td-based headers', () => {
    const result = parseFuelSurchargeFromHtml(TD_HEADER_TABLE)
    expect(result).not.toBeNull()
    expect(result!.air).toBeCloseTo(0.3125)
    expect(result!.ground).toBeCloseTo(0.275)
  })

  it('handles reversed column order (ground before air)', () => {
    const result = parseFuelSurchargeFromHtml(REVERSED_COLUMNS)
    expect(result).not.toBeNull()
    expect(result!.ground).toBeCloseTo(0.275)
    expect(result!.air).toBeCloseTo(0.3125)
  })

  it('returns null for html with no relevant table', () => {
    const result = parseFuelSurchargeFromHtml(NO_RELEVANT_TABLE)
    expect(result).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseFuelSurchargeFromHtml('')).toBeNull()
  })

  it('falls back to regex parsing for plain text percentages', () => {
    const result = parseFuelSurchargeFromHtml(PLAIN_TEXT_HTML)
    expect(result).not.toBeNull()
    expect(result!.air).toBeCloseTo(0.3125)
    expect(result!.ground).toBeCloseTo(0.275)
  })

  it('does not confuse international ground for domestic ground', () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Domestic Air</th><th>International Ground</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>May 26</td><td>31.25%</td><td>27.75%</td></tr>
        </tbody>
      </table>`
    // Only Domestic Air found — Domestic Ground column missing → null
    expect(parseFuelSurchargeFromHtml(html)).toBeNull()
  })
})
