/**
 * Pure invoice aggregation — same logic as POST /api/invoices/analyze (minus I/O).
 * Kept deterministic for accuracy tests / golden proofs.
 */
import {
  normalizeAccountNumberString,
  primaryRollupDateRaw,
  toNumber,
  type InvoiceRecord,
} from './csv'
import type { SpendShipmentPeriodMatrix } from './period-averages-matrix'

export type { SpendShipmentPeriodMatrix } from './period-averages-matrix'

/** Shape of taxonomy rows loaded from `master_mapping` for Premium Analysis lookups. */
export type ChargeDescriptionMappingRow = {
  charge_description: string
  transportation_mode: string
  category_1: string
  category_2: string
  category_3: string
  category_4: string
  category_5: string
  /** Canonical carrier dimension for multi-carrier workbooks (`UPS`, `FedEx`, `WWE`). */
  carrier?: string | null
  standardized_charge?: string | null
}

type ChargeTaxonomyValue = {
  transportation_mode: string
  category_1: string
  category_2: string
  category_3: string
  category_4: string
  category_5: string
}

// category_3 is always passed through normalizeMappingText (trim+uppercase) before comparison,
// so DB casing is irrelevant — these uppercase literals are the canonical normalized forms.
export const SURCHARGE_CATEGORY_3 = new Set(['FUEL SURCHARGE', 'ACCESSORIAL SURCHARGE', 'SURCHARGE'])
const SURCHARGE_CATS = SURCHARGE_CATEGORY_3

/**
 * Accessorial spend for KPI rollups.
 * UPS CSV rows use Charge Classification Code ACC; FedEx/WWE Excel rows use taxonomy when ACC is absent.
 */
export function isAccessorialCostRow(params: {
  chargeClassification: string
  chargeCategoryCode: string
  category1: string
  category3: string
}): boolean {
  const chargeClassification = params.chargeClassification.trim().toUpperCase()
  const chargeCategoryCode = params.chargeCategoryCode.trim().toUpperCase()
  const isExcludedAccCat = chargeCategoryCode === 'INF' || chargeCategoryCode === 'ICC'
  if (chargeClassification === 'ACC' && !isExcludedAccCat) return true

  const cat1 = normalizeMappingText(params.category1)
  const cat3 = normalizeMappingText(params.category3)
  if (cat1 === 'ACCESSORIAL SURCHARGE' && !SURCHARGE_CATS.has(cat3)) return true
  return false
}

/** Premium analysis mapping lookup (`UPS`, `FedEx`, `UPS\t${desc}`, etc.). */
type InvoiceTaxonomyLookup = Map<string, ChargeTaxonomyValue>

export type InvoiceAnalysisSummary = {
  totalRows: number
  byCarrier: Record<
    string,
    { chargeLineCount: number; totalNetAmount: number; totalInvoiceAmount: number }
  >
  byService: Record<
    string,
    { chargeLineCount: number; totalNetAmount: number; totalInvoiceAmount: number }
  >
  totals: {
    netAmount: number
    invoiceAmount: number
    dutyAmount: number
  }
  measures: {
    totalCost: number
    totalPackages: number
    packageDedupeShipmentCount: number
    fuelCost: number
    costSurcharges: number
    costAccessorials: number
    weightGap: number
  }
  monthlySpend: Array<{
    month: string
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  dailySpend: Array<{
    date: string
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  /** Daily spend split by UPS account number (same cost rules as `dailySpend`). */
  dailySpendByAccount: Array<{
    date: string
    accountNumber: string
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  category2VolumeCpp: Array<{
    category2: string
    totalVolume: number
    totalCpp: number
    totalCost: number
  }>
  modeVolumeCpp: Array<{
    mode: string
    totalVolume: number
    totalCpp: number
    totalCost: number
  }>
  weightBucketVolume: Array<{
    weightBucket: string
    sort: number
    totalVolume: number
    totalCost: number
    totalCpp: number
  }>
  /** Per invoice number only (Club Colors / Python dashboard); account is display + may list multiple if data disagrees. */
  spendByInvoice: Array<{
    accountNumber: string
    invoiceNumber: string
    invoiceDate: string | null
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  /** Present when analysis was run via POST (full unfiltered dimensions for filter UI). */
  filterMeta?: InvoiceAnalysisFilterMeta
  /** Echo of server-side filters used for this summary (subset view when any filter is active). */
  appliedFilters?: InvoiceAnalysisFilters
  /** Populated after ingest sanitization / dedupe (Premium Analysis CSV pipeline). */
  ingestDiagnostics?: {
    duplicateUploadRowsSkipped: number
    duplicateChargeRowsDropped: number
    rowsDroppedCriticalSciCorruption: number
  }
  /** Average spend & shipments by year, month, and ISO week-of-year. */
  periodMatrix?: SpendShipmentPeriodMatrix
}

export type InvoiceAnalysisFilters = {
  year?: number | null
  /** One or more calendar months (1–12) present in invoice data; combined with `year` when set. */
  months?: number[] | null
  /** Single invoice month as YYYY-MM (legacy; prefer `months` + `year`). */
  yearMonth?: string | null
  accountNumber?: string | null
}

export type InvoiceAnalysisFilterMeta = {
  years: number[]
  /** Distinct YYYY-MM from parsed invoice dates, newest first. */
  yearMonths: string[]
  accountNumbers: string[]
}

export function isInvoiceYearMonthKey(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false
  return /^\d{4}-\d{2}$/.test(value.trim())
}

export function normalizedMonthNumbers(months: unknown): number[] {
  if (!Array.isArray(months)) return []
  const out: number[] = []
  for (const x of months) {
    const n = Number(x)
    if (!Number.isFinite(n)) continue
    const m = Math.trunc(n)
    if (m >= 1 && m <= 12) out.push(m)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

export function hasActiveInvoiceFilters(f: InvoiceAnalysisFilters | null | undefined): boolean {
  if (!f) return false
  if (normalizedMonthNumbers(f.months).length > 0) return true
  if (String(f.yearMonth ?? '').trim() && isInvoiceYearMonthKey(f.yearMonth)) return true
  if (f.year != null && Number.isFinite(Number(f.year))) return true
  if (String(f.accountNumber ?? '').trim()) return true
  return false
}

/** Parse `filters` from POST JSON; ignores unknown keys. */
export function normalizeInvoiceAnalysisFilters(raw: unknown): InvoiceAnalysisFilters {
  if (raw == null || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: InvoiceAnalysisFilters = {}
  const ymRaw = o.yearMonth ?? o.year_month
  if (ymRaw != null && String(ymRaw).trim() !== '') {
    const ym = String(ymRaw).trim()
    if (isInvoiceYearMonthKey(ym)) out.yearMonth = ym
  }
  if (o.year != null && String(o.year).trim() !== '') {
    const n = Number(o.year)
    if (Number.isFinite(n)) out.year = n
  }
  const monthsFromArray = normalizedMonthNumbers(o.months)
  if (monthsFromArray.length) {
    out.months = monthsFromArray
  }
  if (!out.months?.length && !out.yearMonth && o.month != null && String(o.month).trim() !== '') {
    const m = Number(o.month)
    if (Number.isFinite(m)) {
      const mo = Math.trunc(m)
      if (mo >= 1 && mo <= 12) out.months = [mo]
    }
  }
  if (o.accountNumber != null && String(o.accountNumber).trim() !== '') {
    out.accountNumber = String(o.accountNumber).trim()
  }
  return out
}

/** Distinct filter dimensions from the full (unfiltered) record set. */
export function buildInvoiceAnalysisFilterMeta(records: InvoiceRecord[]): InvoiceAnalysisFilterMeta {
  const years = new Set<number>()
  const yearMonths = new Set<string>()
  const accounts = new Set<string>()
  for (const rec of records) {
    const dk = parseInvoiceDateKey(primaryRollupDateRaw(rec))
    if (dk) {
      years.add(Number(dk.slice(0, 4)))
      yearMonths.add(dk.slice(0, 7))
    }
    const acc = normalizeAccountNumberString(rec['Account Number'])
    if (acc) accounts.add(acc)
  }
  return {
    years: Array.from(years).sort((a, b) => b - a),
    yearMonths: Array.from(yearMonths).sort((a, b) => b.localeCompare(a)),
    accountNumbers: Array.from(accounts).sort((a, b) => a.localeCompare(b)),
  }
}

/** Parse `monthLabel` like "March 2025" from `computeInvoiceAnalysisSummary` monthlySpend keys. */
export function yearMonthKeyFromEngineMonthLabel(monthLabel: string): string | null {
  const m = String(monthLabel ?? '')
    .trim()
    .match(/^(.+?)\s+(\d{4})$/)
  if (!m) return null
  const monthName = m[1].trim()
  const yearNum = Number(m[2])
  if (!Number.isFinite(yearNum)) return null
  const d = new Date(`${monthName} 1, ${yearNum}`)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const mo = d.getMonth() + 1
  return `${y}-${String(mo).padStart(2, '0')}`
}

/**
 * Builds complete filter dropdown dimensions: prefers `fromRecords` (full CSV scan) when present,
 * and fills gaps from saved summary slices so cached GET rows still populate years / YYYY-MM / accounts.
 */
export function mergeInvoiceAnalysisFilterMeta(
  fromRecords: InvoiceAnalysisFilterMeta | null | undefined,
  summarySlice: {
    dailySpend?: ReadonlyArray<{ date?: string }>
    monthlySpend?: ReadonlyArray<{ month?: string }>
    spendByInvoice?: ReadonlyArray<{ accountNumber?: string }>
    dailySpendByAccount?: ReadonlyArray<{ accountNumber?: string }>
  }
): InvoiceAnalysisFilterMeta {
  const years = new Set<number>()
  const yearMonths = new Set<string>()
  const accountNumbers = new Set<string>()

  for (const y of fromRecords?.years ?? []) {
    if (typeof y === 'number' && Number.isFinite(y)) years.add(y)
  }
  for (const ym of fromRecords?.yearMonths ?? []) {
    if (typeof ym === 'string' && isInvoiceYearMonthKey(ym)) yearMonths.add(ym.slice(0, 7))
  }
  for (const a of fromRecords?.accountNumbers ?? []) {
    if (typeof a === 'string' && a.trim()) accountNumbers.add(a.trim())
  }

  for (const d of summarySlice.dailySpend ?? []) {
    const date = typeof d.date === 'string' ? d.date : ''
    if (date.length >= 7) {
      yearMonths.add(date.slice(0, 7))
      const y = Number(date.slice(0, 4))
      if (Number.isFinite(y)) years.add(y)
    }
  }

  for (const row of summarySlice.monthlySpend ?? []) {
    const label = typeof row.month === 'string' ? row.month : ''
    const ym = yearMonthKeyFromEngineMonthLabel(label)
    if (ym) {
      yearMonths.add(ym)
      const y = Number(ym.slice(0, 4))
      if (Number.isFinite(y)) years.add(y)
    }
  }

  for (const r of summarySlice.spendByInvoice ?? []) {
    const a = typeof r.accountNumber === 'string' ? r.accountNumber.trim() : ''
    if (!a || a === '(no account)') continue
    // spendByInvoice may join multiple distinct account numbers with ", " when one invoice appears under both.
    for (const part of a.split(',')) {
      const p = part.trim()
      if (p && p !== '(no account)') accountNumbers.add(p)
    }
  }

  for (const r of summarySlice.dailySpendByAccount ?? []) {
    const a = typeof r.accountNumber === 'string' ? r.accountNumber.trim() : ''
    if (a) accountNumbers.add(a)
  }

  return {
    years: Array.from(years).sort((a, b) => b - a),
    yearMonths: Array.from(yearMonths).sort((a, b) => b.localeCompare(a)),
    accountNumbers: Array.from(accountNumbers).sort((a, b) => a.localeCompare(b)),
  }
}

export function filterInvoiceRecords(
  records: InvoiceRecord[],
  filters: InvoiceAnalysisFilters
): InvoiceRecord[] {
  if (!hasActiveInvoiceFilters(filters)) return records
  const wantYm = String(filters.yearMonth ?? '').trim()
  const wantYear =
    filters.year != null && Number.isFinite(Number(filters.year)) ? Number(filters.year) : null
  const wantMonths = new Set(normalizedMonthNumbers(filters.months))
  const wantAcc = String(filters.accountNumber ?? '').trim().toLowerCase()

  return records.filter((rec) => {
    const dk = parseInvoiceDateKey(primaryRollupDateRaw(rec))
    if (wantYm && isInvoiceYearMonthKey(wantYm)) {
      if (!dk || dk.slice(0, 7) !== wantYm) return false
    } else {
      if (wantYear != null) {
        if (!dk || !dk.startsWith(`${wantYear}-`)) return false
      }
      if (wantMonths.size > 0) {
        if (!dk) return false
        const monthNum = Number(dk.slice(5, 7))
        if (!wantMonths.has(monthNum)) return false
      }
    }
    if (wantAcc) {
      const acc = normalizeAccountNumberString(rec['Account Number']).toLowerCase()
      if (acc !== wantAcc) return false
    }
    return true
  })
}

/** One UPS invoice has many charge lines — max Package Quantity per logical shipment. */
export function shipmentPackageDedupeKey(rec: InvoiceRecord): string | null {
  const invoice = (rec['Invoice Number'] ?? '').trim()
  const tracking = (rec['Tracking Number'] ?? '').trim()
  const ref1 = (rec['Shipment Reference Number 1'] ?? '').trim()
  const lead = (rec['Lead Shipment Number'] ?? '').trim()
  const shipId = tracking || ref1 || lead
  if (!shipId) return null
  return `${invoice}::${shipId}`
}

export function parseInvoiceDateKey(raw: string | null): string | null {
  const value = (raw ?? '').replace(/^"|"$/g, '').trim()
  if (!value) return null

  const dateOnly = value.split(/[T\s]/)[0]

  let year = 0
  let month = 0
  let day = 0

  const usStyle = dateOnly.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  const isoStyle = dateOnly.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)

  if (isoStyle) {
    year = Number(isoStyle[1])
    month = Number(isoStyle[2])
    day = Number(isoStyle[3])
  } else if (usStyle) {
    month = Number(usStyle[1])
    day = Number(usStyle[2])
    year = Number(usStyle[3])
  } else {
    return null
  }

  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`
}

export function normalizeMappingText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

/** Align CSV + workbook carriers to `{UPS,FEDEX,WWE}` keys stored in taxonomy maps. */
function canonicalPremiumMappingCarrier(norm: string): string {
  if (norm === '' || norm === 'UPS') return 'UPS'
  if (norm.includes('FED')) return 'FEDEX'
  if (norm.includes('WORLD') || norm === 'WWE' || norm.includes('WWE')) return 'WWE'
  return norm
}

function invoiceCarrierPremiumKey(csvCarrier: string | null | undefined): string {
  const k = normalizeMappingText(csvCarrier)
  return canonicalPremiumMappingCarrier(k === '' ? 'UPS' : k)
}

function lookupChargeTaxonomy(
  lookup: InvoiceTaxonomyLookup,
  invoiceCarrierRaw: string | null | undefined,
  chargeDescriptionRaw: string | null | undefined
): ChargeTaxonomyValue | undefined {
  const descNorm = normalizeMappingText(chargeDescriptionRaw)
  if (!descNorm) return undefined

  const carrierLookup = invoiceCarrierPremiumKey(invoiceCarrierRaw)

  let mapped = lookup.get(`${carrierLookup}\t${descNorm}`)
  if (!mapped && carrierLookup !== 'UPS') {
    mapped = lookup.get(`UPS\t${descNorm}`)
  }
  if (!mapped) {
    mapped = lookup.get(descNorm)
  }
  return mapped
}

export function modeFromZone(zone: number): string {
  if (zone >= 400 && zone < 500) return 'Express/Special'
  if (zone >= 300 && zone < 400) return 'Air'
  if (zone >= 200 && zone < 300) return 'International Export'
  if (zone >= 100 && zone < 200) return 'International Import'
  if (zone >= 0 && zone < 100) return 'Ground'
  return 'Unknown'
}

export function weightBucketFromLbs(weightLbs: number): { bucket: string; sort: number } {
  if (weightLbs <= 1) return { bucket: '0-1 lbs', sort: 1 }
  if (weightLbs <= 5) return { bucket: '2-5 lbs', sort: 2 }
  if (weightLbs <= 10) return { bucket: '6-10 lbs', sort: 3 }
  if (weightLbs <= 20) return { bucket: '11-20 lbs', sort: 4 }
  if (weightLbs <= 50) return { bucket: '21-50 lbs', sort: 5 }
  if (weightLbs <= 100) return { bucket: '51-100 lbs', sort: 6 }
  return { bucket: '100+ lbs', sort: 7 }
}

/**
 * TODO (`standardized_charge` — cross-carrier normalized reporting)
 *
 * **`standardized_charge`** is the Master Mapping column that gives a carrier-agnostic label for invoice
 * `Charge Description` rows (FedEx/WWE vs UPS wording converges on shared buckets for apples-to-apples KPIs).
 * It is persisted on **`master_mapping`** and is already **selected** in `computePremiumInvoiceAnalysis`
 * (`premium-analysis-compute.ts`), but the lookup/value used here (**`ChargeTaxonomyValue`** / **`buildChargeDescriptionLookup`**)
 * forwards only **`transportation_mode`** + **`category_1–5`** into **`computeInvoiceAnalysisSummary`**. None of the
 * current rollups or filter metadata group by **`standardized_charge`**.
 *
 * Next steps toward a **first-class** dashboard dimension:
 * carry **`standardized_charge`** on the taxonomy payload keyed by **`(carrier, charge_description)`**,
 * classify each scanned line with that field, aggregate new summary arrays (distinct values, spend by standardized label,
 * time splits, etc.), extend **`InvoiceAnalysisFilters` / filterMeta** and **`POST`/query** contracts for optional
 * `standardized_charge` filtering, update dashboard widgets to pivot/filter on it alongside carriers and categories.
 */
export function buildChargeDescriptionLookup(
  rows: ChargeDescriptionMappingRow[] | null | undefined
): InvoiceTaxonomyLookup {
  const mappingByDescription: InvoiceTaxonomyLookup = new Map()
  const payloadFrom = (m: ChargeDescriptionMappingRow): ChargeTaxonomyValue => ({
    transportation_mode: String(m.transportation_mode ?? '').trim(),
    category_1: String(m.category_1 ?? '').trim(),
    category_2: String(m.category_2 ?? '').trim(),
    category_3: String(m.category_3 ?? '').trim(),
    category_4: String(m.category_4 ?? '').trim(),
    category_5: String(m.category_5 ?? '').trim(),
  })

  for (const m of rows ?? []) {
    const descNorm = normalizeMappingText(m.charge_description)
    if (!descNorm) continue

    const rawCarrier = normalizeMappingText((m.carrier ?? '') || '')
    const carrierLookup = canonicalPremiumMappingCarrier(rawCarrier === '' ? 'UPS' : rawCarrier)

    const payload = payloadFrom(m)

    mappingByDescription.set(`${carrierLookup}\t${descNorm}`, payload)

    /** Legacy uploads only keyed UPS charge descriptions alone. */
    if (carrierLookup === 'UPS') {
      mappingByDescription.set(descNorm, payload)
    }
  }

  return mappingByDescription
}

export function computeInvoiceAnalysisSummary(
  records: InvoiceRecord[],
  mappingByDescription: InvoiceTaxonomyLookup
): InvoiceAnalysisSummary {
  const summary: InvoiceAnalysisSummary = {
    totalRows: records.length,
    byCarrier: {},
    byService: {},
    totals: {
      netAmount: 0,
      invoiceAmount: 0,
      dutyAmount: 0,
    },
    measures: {
      totalCost: 0,
      totalPackages: 0,
      packageDedupeShipmentCount: 0,
      fuelCost: 0,
      costSurcharges: 0,
      costAccessorials: 0,
      weightGap: 0,
    },
    monthlySpend: [],
    dailySpend: [],
    dailySpendByAccount: [],
    category2VolumeCpp: [],
    modeVolumeCpp: [],
    weightBucketVolume: [],
    spendByInvoice: [],
  }

  let sumBilledWeight = 0
  let sumEnteredWeight = 0
  const invoiceSpend = new Map<
    string,
    {
      totalCost: number
      costFuel: number
      costAccessorials: number
      costSurcharges: number
      minDate: string | null
      accountNumbers: Set<string>
    }
  >()
  const dailySpend = new Map<
    string,
    {
      totalCost: number
      costFuel: number
      costAccessorials: number
      costSurcharges: number
    }
  >()
  const dailySpendByAccount = new Map<
    string,
    {
      totalCost: number
      costFuel: number
      costAccessorials: number
      costSurcharges: number
    }
  >()
  const monthSpend = new Map<
    string,
    { totalCost: number; costFuel: number; costAccessorials: number; costSurcharges: number }
  >()
  const category2Agg = new Map<string, { totalCost: number; totalVolume: number }>()
  const modeAgg = new Map<string, { totalCost: number; totalVolume: number }>()
  const weightBucketAgg = new Map<string, { sort: number; totalCost: number; totalVolume: number }>()

  for (const rec of records) {
    const carrier = rec['Carrier Name'] || 'Unknown'
    const service =
      (rec['Original Service Description'] ?? '').trim() ||
      (rec['Charge Category Code'] ?? '').trim() ||
      'Unknown'

    const netAmount = toNumber(rec['Net Amount'])
    const invoiceAmount = toNumber(rec['Invoice Amount'])
    const dutyAmount = toNumber(rec['Duty Amount'])
    const billedWeight = toNumber(rec['Billed Weight'])
    const enteredWeight = toNumber(rec['Entered Weight'])
    const volumeUnits = Math.max(1, toNumber(rec['Package Quantity']))
    const zone = toNumber(rec['Zone'])
    const chargeCategoryCode = (rec['Charge Category Code'] ?? '').trim().toUpperCase()
    const chargeClassification = (rec['Charge Classification Code'] ?? '').trim().toUpperCase()
    const chargeDescription = (rec['Charge Description'] ?? '').trim()
    const mapping = lookupChargeTaxonomy(
      mappingByDescription,
      rec['Carrier Name'] ?? '',
      chargeDescription
    )
    const category1 = normalizeMappingText(mapping?.category_1)
    const category2 = normalizeMappingText(mapping?.category_2)
    const category3 = normalizeMappingText(mapping?.category_3)
    const category2Label = category2 || 'UNMAPPED'
    const isAccessorialRow = isAccessorialCostRow({
      chargeClassification,
      chargeCategoryCode,
      category1,
      category3,
    })
    const modeLabel = modeFromZone(zone)
    const weightBucket = weightBucketFromLbs(billedWeight)

    summary.totals.netAmount += netAmount
    summary.totals.invoiceAmount += invoiceAmount
    summary.totals.dutyAmount += dutyAmount

    summary.measures.totalCost += netAmount

    sumBilledWeight += billedWeight
    sumEnteredWeight += enteredWeight

    // Python: df["isFuel"] = df["Category 3"] == "FUEL SURCHARGE"
    const isFuelRow = category3 === 'FUEL SURCHARGE'

    if (isFuelRow) {
      summary.measures.fuelCost += netAmount
    }

    // Python: df["isSurcharge"] = df["Category 3"].isin(["FUEL SURCHARGE","ACCESSORIAL SURCHARGE","SURCHARGE"])
    if (SURCHARGE_CATS.has(category3)) {
      summary.measures.costSurcharges += netAmount
    }

    if (isAccessorialRow) {
      summary.measures.costAccessorials += netAmount
    }

    const catAgg = category2Agg.get(category2Label) ?? { totalCost: 0, totalVolume: 0 }
    catAgg.totalCost += netAmount
    catAgg.totalVolume += volumeUnits
    category2Agg.set(category2Label, catAgg)

    const mode = modeAgg.get(modeLabel) ?? { totalCost: 0, totalVolume: 0 }
    mode.totalCost += netAmount
    mode.totalVolume += volumeUnits
    modeAgg.set(modeLabel, mode)

    const bucket = weightBucketAgg.get(weightBucket.bucket) ?? {
      sort: weightBucket.sort,
      totalCost: 0,
      totalVolume: 0,
    }
    bucket.totalCost += netAmount
    bucket.totalVolume += volumeUnits
    weightBucketAgg.set(weightBucket.bucket, bucket)

    if (!summary.byCarrier[carrier]) {
      summary.byCarrier[carrier] = {
        chargeLineCount: 0,
        totalNetAmount: 0,
        totalInvoiceAmount: 0,
      }
    }
    summary.byCarrier[carrier].chargeLineCount += 1
    summary.byCarrier[carrier].totalNetAmount += netAmount
    summary.byCarrier[carrier].totalInvoiceAmount += invoiceAmount

    if (!summary.byService[service]) {
      summary.byService[service] = {
        chargeLineCount: 0,
        totalNetAmount: 0,
        totalInvoiceAmount: 0,
      }
    }
    summary.byService[service].chargeLineCount += 1
    summary.byService[service].totalNetAmount += netAmount
    summary.byService[service].totalInvoiceAmount += invoiceAmount

    const dateKey = parseInvoiceDateKey(primaryRollupDateRaw(rec))
    const accountDim = normalizeAccountNumberString(rec['Account Number']) || '(no account)'
    if (dateKey) {
      const daily = dailySpend.get(dateKey) ?? {
        totalCost: 0,
        costFuel: 0,
        costAccessorials: 0,
        costSurcharges: 0,
      }
      daily.totalCost += netAmount
      if (isFuelRow) daily.costFuel += netAmount
      if (isAccessorialRow) daily.costAccessorials += netAmount
      if (SURCHARGE_CATS.has(category3)) daily.costSurcharges += netAmount
      dailySpend.set(dateKey, daily)

      const daKey = `${dateKey}\t${accountDim}`
      const dAcc = dailySpendByAccount.get(daKey) ?? {
        totalCost: 0,
        costFuel: 0,
        costAccessorials: 0,
        costSurcharges: 0,
      }
      dAcc.totalCost += netAmount
      if (isFuelRow) dAcc.costFuel += netAmount
      if (isAccessorialRow) dAcc.costAccessorials += netAmount
      if (SURCHARGE_CATS.has(category3)) dAcc.costSurcharges += netAmount
      dailySpendByAccount.set(daKey, dAcc)

      const [yearText, monthText] = dateKey.split('-')
      const yearNum = Number(yearText)
      const monthNum = Number(monthText)
      const monthDate = new Date(Date.UTC(yearNum, monthNum - 1, 1))
      const monthName = monthDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
      const monthLabel = `${monthName} ${yearNum}`

      const monthAgg = monthSpend.get(monthLabel) ?? {
        totalCost: 0,
        costFuel: 0,
        costAccessorials: 0,
        costSurcharges: 0,
      }
      monthAgg.totalCost += netAmount
      if (isFuelRow) monthAgg.costFuel += netAmount
      if (isAccessorialRow) monthAgg.costAccessorials += netAmount
      if (SURCHARGE_CATS.has(category3)) monthAgg.costSurcharges += netAmount
      monthSpend.set(monthLabel, monthAgg)
    }

    const invLabel = String(rec['Invoice Number'] ?? '').trim() || '(no invoice)'
    let invAgg = invoiceSpend.get(invLabel)
    if (!invAgg) {
      invAgg = {
        totalCost: 0,
        costFuel: 0,
        costAccessorials: 0,
        costSurcharges: 0,
        minDate: null,
        accountNumbers: new Set<string>(),
      }
      invoiceSpend.set(invLabel, invAgg)
    }
    invAgg.totalCost += netAmount
    if (isFuelRow) invAgg.costFuel += netAmount
    if (isAccessorialRow) invAgg.costAccessorials += netAmount
    if (SURCHARGE_CATS.has(category3)) invAgg.costSurcharges += netAmount
    if (dateKey) {
      invAgg.minDate =
        invAgg.minDate === null || dateKey < invAgg.minDate ? dateKey : invAgg.minDate
    }
    const accForInvoice = String(rec['Account Number'] ?? '').trim()
    if (accForInvoice) invAgg.accountNumbers.add(accForInvoice)
  }

  summary.spendByInvoice = Array.from(invoiceSpend.entries())
    .map(([invoiceNumber, v]) => {
      const sortedAcc = Array.from(v.accountNumbers).sort((x, y) => x.localeCompare(y))
      const accountNumber =
        sortedAcc.length === 0 ? '(no account)' : sortedAcc.length === 1 ? sortedAcc[0]! : sortedAcc.join(', ')
      return {
        accountNumber,
        invoiceNumber,
        invoiceDate: v.minDate,
        totalCost: v.totalCost,
        costFuel: v.costFuel,
        costAccessorials: v.costAccessorials,
        costSurcharges: v.costSurcharges,
      }
    })
    .sort((a, b) => {
      const da = a.invoiceDate ?? ''
      const db = b.invoiceDate ?? ''
      if (da !== db) return db.localeCompare(da)
      return a.invoiceNumber.localeCompare(b.invoiceNumber)
    })

  const packageQtyByShipment = new Map<string, number>()
  for (const rec of records) {
    const key = shipmentPackageDedupeKey(rec)
    if (!key) continue
    const pq = toNumber(rec['Package Quantity'])
    const prev = packageQtyByShipment.get(key) ?? 0
    packageQtyByShipment.set(key, Math.max(prev, pq))
  }
  summary.measures.totalPackages = Array.from(packageQtyByShipment.values()).reduce((a, b) => a + b, 0)
  summary.measures.packageDedupeShipmentCount = packageQtyByShipment.size

  summary.measures.weightGap = sumBilledWeight - sumEnteredWeight

  summary.monthlySpend = Array.from(monthSpend.entries())
    .map(([month, values]) => {
      const [monthName, yearText] = month.split(' ')
      const monthIndex = new Date(`${monthName} 1, ${yearText}`).getMonth() + 1
      const sortKey = `${yearText}-${monthIndex.toString().padStart(2, '0')}`
      return {
        month,
        totalCost: values.totalCost,
        costFuel: values.costFuel,
        costAccessorials: values.costAccessorials,
        costSurcharges: values.costSurcharges,
        sortKey,
      }
    })
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map((row) => ({
      month: row.month,
      totalCost: row.totalCost,
      costFuel: row.costFuel,
      costAccessorials: row.costAccessorials,
      costSurcharges: row.costSurcharges,
    }))

  summary.dailySpend = Array.from(dailySpend.entries())
    .map(([date, values]) => ({
      date,
      totalCost: values.totalCost,
      costFuel: values.costFuel,
      costAccessorials: values.costAccessorials,
      costSurcharges: values.costSurcharges,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  summary.dailySpendByAccount = Array.from(dailySpendByAccount.entries())
    .map(([key, values]) => {
      const tab = key.indexOf('\t')
      const date = tab >= 0 ? key.slice(0, tab) : key
      const accountNumber = tab >= 0 ? key.slice(tab + 1) : '(no account)'
      return {
        date,
        accountNumber,
        totalCost: values.totalCost,
        costFuel: values.costFuel,
        costAccessorials: values.costAccessorials,
        costSurcharges: values.costSurcharges,
      }
    })
    .sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.accountNumber.localeCompare(b.accountNumber)
    )

  summary.category2VolumeCpp = Array.from(category2Agg.entries())
    .map(([category2, values]) => ({
      category2,
      totalVolume: values.totalVolume,
      totalCost: values.totalCost,
      totalCpp: values.totalVolume > 0 ? values.totalCost / values.totalVolume : 0,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)

  summary.modeVolumeCpp = Array.from(modeAgg.entries())
    .map(([mode, values]) => ({
      mode,
      totalVolume: values.totalVolume,
      totalCost: values.totalCost,
      totalCpp: values.totalVolume > 0 ? values.totalCost / values.totalVolume : 0,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume)

  summary.weightBucketVolume = Array.from(weightBucketAgg.entries())
    .map(([weightBucket, values]) => ({
      weightBucket,
      sort: values.sort,
      totalVolume: values.totalVolume,
      totalCost: values.totalCost,
      totalCpp: values.totalVolume > 0 ? values.totalCost / values.totalVolume : 0,
    }))
    .sort((a, b) => a.sort - b.sort)

  return summary
}
