import { parseInvoiceDateKey, shipmentPackageDedupeKey } from '@/lib/premium-analysis/analysis-summary'
import { primaryRollupDateRaw, toNumber, type InvoiceRecord } from '@/lib/invoices/csv'

export type PeriodAverageCell = {
  totalSpend: number
  totalShipments: number
  /** Total spend ÷ active days in the period. */
  avgSpend: number
  /** Distinct shipments ÷ active days in the period. */
  avgShipments: number
  activeDays: number
}

export type YearPeriodRow = PeriodAverageCell & {
  year: number
  weeksWithData: number
  avgSpendPerWeek: number
  avgShipmentsPerWeek: number
}

export type YearMonthPeriodRow = PeriodAverageCell & {
  year: number
  month: number
  monthLabel: string
}

export type YearWeekPeriodRow = PeriodAverageCell & {
  year: number
  weekOfYear: number
  weekLabel: string
}

export type SpendShipmentPeriodMatrix = {
  years: number[]
  byYear: YearPeriodRow[]
  byYearMonth: YearMonthPeriodRow[]
  byYearWeek: YearWeekPeriodRow[]
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

type PeriodBucket = {
  totalSpend: number
  shipmentKeys: Set<string>
  activeDays: Set<string>
}

function emptyBucket(): PeriodBucket {
  return { totalSpend: 0, shipmentKeys: new Set(), activeDays: new Set() }
}

/** Shipment identity — tracking-based when present, else invoice + reference. */
export function shipmentIdentityKey(rec: InvoiceRecord): string | null {
  const dedupe = shipmentPackageDedupeKey(rec)
  if (dedupe) return dedupe
  const invoice = (rec['Invoice Number'] ?? '').trim()
  const ref = (rec['Shipment Reference Number 1'] ?? '').trim()
  if (invoice && ref) return `${invoice}::${ref}`
  if (invoice) return `${invoice}::no-ship-id`
  return null
}

/** ISO week (1–53) and ISO week-year for a `YYYY-MM-DD` key (UTC). */
export function isoWeekYearFromDateKey(dateKey: string): { isoYear: number; weekOfYear: number } {
  const d = new Date(`${dateKey}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const isoYear = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const weekOfYear = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { isoYear, weekOfYear }
}

function finalizeCell(bucket: PeriodBucket): PeriodAverageCell {
  const activeDays = bucket.activeDays.size
  const totalShipments = bucket.shipmentKeys.size
  const totalSpend = bucket.totalSpend
  return {
    totalSpend,
    totalShipments,
    activeDays,
    avgSpend: activeDays > 0 ? totalSpend / activeDays : 0,
    avgShipments: activeDays > 0 ? totalShipments / activeDays : 0,
  }
}

function bucketKey(parts: (string | number)[]): string {
  return parts.join('\t')
}

/**
 * Builds year / month / ISO-week matrices of average spend and shipments.
 * Spend rolls up by invoice date (same as `dailySpend`). Shipments dedupe by tracking/reference per period.
 */
export function buildSpendShipmentPeriodMatrix(records: InvoiceRecord[]): SpendShipmentPeriodMatrix {
  const dailySpend = new Map<string, number>()
  const shipmentToDate = new Map<string, string>()

  for (const rec of records) {
    const dateKey = parseInvoiceDateKey(primaryRollupDateRaw(rec))
    if (dateKey) {
      dailySpend.set(dateKey, (dailySpend.get(dateKey) ?? 0) + toNumber(rec['Net Amount']))
    }

    const shipKey = shipmentIdentityKey(rec)
    if (shipKey && dateKey) {
      const prev = shipmentToDate.get(shipKey)
      if (!prev || dateKey < prev) shipmentToDate.set(shipKey, dateKey)
    }
  }

  const yearBuckets = new Map<string, PeriodBucket>()
  const monthBuckets = new Map<string, PeriodBucket>()
  const weekBuckets = new Map<string, PeriodBucket>()
  const yearWeekDays = new Map<number, Set<string>>()

  for (const [dateKey, spend] of dailySpend) {
    const [yearText, monthText] = dateKey.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue

    const yKey = bucketKey([year])
    const ymKey = bucketKey([year, month])
    const yb = yearBuckets.get(yKey) ?? emptyBucket()
    yb.totalSpend += spend
    yb.activeDays.add(dateKey)
    yearBuckets.set(yKey, yb)

    const mb = monthBuckets.get(ymKey) ?? emptyBucket()
    mb.totalSpend += spend
    mb.activeDays.add(dateKey)
    monthBuckets.set(ymKey, mb)

    const { isoYear, weekOfYear } = isoWeekYearFromDateKey(dateKey)
    const wkKey = bucketKey([isoYear, weekOfYear])
    const wb = weekBuckets.get(wkKey) ?? emptyBucket()
    wb.totalSpend += spend
    wb.activeDays.add(dateKey)
    weekBuckets.set(wkKey, wb)

    const weekDaySet = yearWeekDays.get(isoYear) ?? new Set<string>()
    weekDaySet.add(`${weekOfYear}\t${dateKey}`)
    yearWeekDays.set(isoYear, weekDaySet)
  }

  for (const [shipKey, dateKey] of shipmentToDate) {
    const [yearText, monthText] = dateKey.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue

    const yKey = bucketKey([year])
    yearBuckets.get(yKey)?.shipmentKeys.add(shipKey)

    const ymKey = bucketKey([year, month])
    monthBuckets.get(ymKey)?.shipmentKeys.add(shipKey)

    const { isoYear, weekOfYear } = isoWeekYearFromDateKey(dateKey)
    const wkKey = bucketKey([isoYear, weekOfYear])
    weekBuckets.get(wkKey)?.shipmentKeys.add(shipKey)
  }

  const years = [...new Set([...yearBuckets.keys()].map((k) => Number(k)))].sort((a, b) => a - b)

  const byYear: YearPeriodRow[] = years.map((year) => {
    const bucket = yearBuckets.get(bucketKey([year])) ?? emptyBucket()
    const cell = finalizeCell(bucket)
    const weeksWithData = new Set(
      [...(yearWeekDays.get(year) ?? [])].map((s) => s.split('\t')[0])
    ).size
    return {
      year,
      ...cell,
      weeksWithData,
      avgSpendPerWeek: weeksWithData > 0 ? cell.totalSpend / weeksWithData : 0,
      avgShipmentsPerWeek: weeksWithData > 0 ? cell.totalShipments / weeksWithData : 0,
    }
  })

  const byYearMonth: YearMonthPeriodRow[] = []
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      const bucket = monthBuckets.get(bucketKey([year, month]))
      if (!bucket || bucket.activeDays.size === 0) continue
      byYearMonth.push({
        year,
        month,
        monthLabel: MONTH_NAMES[month - 1]!,
        ...finalizeCell(bucket),
      })
    }
  }

  const byYearWeek: YearWeekPeriodRow[] = []
  const weekKeys = [...weekBuckets.keys()].sort((a, b) => {
    const [ay, aw] = a.split('\t').map(Number)
    const [by, bw] = b.split('\t').map(Number)
    return ay !== by ? ay - by : aw - bw
  })
  for (const wkKey of weekKeys) {
    const [yearText, weekText] = wkKey.split('\t')
    const year = Number(yearText)
    const weekOfYear = Number(weekText)
    const bucket = weekBuckets.get(wkKey)!
    if (bucket.activeDays.size === 0) continue
    byYearWeek.push({
      year,
      weekOfYear,
      weekLabel: `W${String(weekOfYear).padStart(2, '0')}`,
      ...finalizeCell(bucket),
    })
  }

  return { years, byYear, byYearMonth, byYearWeek }
}
