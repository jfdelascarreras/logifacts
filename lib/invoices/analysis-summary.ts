/**
 * Pure invoice aggregation — same logic as POST /api/invoices/analyze (minus I/O).
 * Kept deterministic for accuracy tests / golden proofs.
 */
import type { InvoiceRecord } from './csv'
import { toNumber } from './csv'

export type ChargeDescriptionMappingRow = {
  charge_description: string
  transportation_mode: string
  category_1: string
  category_2: string
  category_3: string
  category_4: string
  category_5: string
}

export type InvoiceAnalysisSummary = {
  totalRows: number
  byCarrier: Record<
    string,
    { shipmentCount: number; totalNetAmount: number; totalInvoiceAmount: number }
  >
  byService: Record<
    string,
    { shipmentCount: number; totalNetAmount: number; totalInvoiceAmount: number }
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

export function buildChargeDescriptionLookup(
  rows: ChargeDescriptionMappingRow[] | null | undefined
): Map<
  string,
  {
    transportation_mode: string
    category_1: string
    category_2: string
    category_3: string
    category_4: string
    category_5: string
  }
> {
  const mappingByDescription = new Map<
    string,
    {
      transportation_mode: string
      category_1: string
      category_2: string
      category_3: string
      category_4: string
      category_5: string
    }
  >()
  for (const m of rows ?? []) {
    mappingByDescription.set(normalizeMappingText(m.charge_description), {
      transportation_mode: String(m.transportation_mode ?? '').trim(),
      category_1: String(m.category_1 ?? '').trim(),
      category_2: String(m.category_2 ?? '').trim(),
      category_3: String(m.category_3 ?? '').trim(),
      category_4: String(m.category_4 ?? '').trim(),
      category_5: String(m.category_5 ?? '').trim(),
    })
  }
  return mappingByDescription
}

type MappingLookup = Map<
  string,
  {
    transportation_mode: string
    category_1: string
    category_2: string
    category_3: string
    category_4: string
    category_5: string
  }
>

export function computeInvoiceAnalysisSummary(
  records: InvoiceRecord[],
  mappingByDescription: MappingLookup
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
    category2VolumeCpp: [],
    modeVolumeCpp: [],
    weightBucketVolume: [],
  }

  let sumBilledWeight = 0
  let sumEnteredWeight = 0
  const dailySpend = new Map<
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
    const mapping = mappingByDescription.get(normalizeMappingText(chargeDescription))
    const category1 = normalizeMappingText(mapping?.category_1)
    const category2 = normalizeMappingText(mapping?.category_2)
    const category2Label = category2 || 'UNMAPPED'
    const modeLabel = modeFromZone(zone)
    const weightBucket = weightBucketFromLbs(billedWeight)

    summary.totals.netAmount += netAmount
    summary.totals.invoiceAmount += invoiceAmount
    summary.totals.dutyAmount += dutyAmount

    summary.measures.totalCost += netAmount

    sumBilledWeight += billedWeight
    sumEnteredWeight += enteredWeight

    const isFuelRow = category2 === 'FUEL SURCHARGE'

    if (isFuelRow) {
      summary.measures.fuelCost += netAmount
    }

    if (category1 === 'FUEL SURCHARGE' || category1 === 'ACCESSORIAL SURCHARGE') {
      summary.measures.costSurcharges += netAmount
    }

    const isExcludedAccCat = chargeCategoryCode === 'INF' || chargeCategoryCode === 'ICC'
    if (chargeClassification === 'ACC' && !isExcludedAccCat) {
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
        shipmentCount: 0,
        totalNetAmount: 0,
        totalInvoiceAmount: 0,
      }
    }
    summary.byCarrier[carrier].shipmentCount += 1
    summary.byCarrier[carrier].totalNetAmount += netAmount
    summary.byCarrier[carrier].totalInvoiceAmount += invoiceAmount

    if (!summary.byService[service]) {
      summary.byService[service] = {
        shipmentCount: 0,
        totalNetAmount: 0,
        totalInvoiceAmount: 0,
      }
    }
    summary.byService[service].shipmentCount += 1
    summary.byService[service].totalNetAmount += netAmount
    summary.byService[service].totalInvoiceAmount += invoiceAmount

    const dateKey = parseInvoiceDateKey(rec['Invoice Date'])
    if (dateKey) {
      const daily = dailySpend.get(dateKey) ?? {
        totalCost: 0,
        costFuel: 0,
        costAccessorials: 0,
        costSurcharges: 0,
      }
      daily.totalCost += netAmount
      if (isFuelRow) daily.costFuel += netAmount
      if (chargeClassification === 'ACC' && !isExcludedAccCat) daily.costAccessorials += netAmount
      if (category1 === 'FUEL SURCHARGE' || category1 === 'ACCESSORIAL SURCHARGE') {
        daily.costSurcharges += netAmount
      }
      dailySpend.set(dateKey, daily)

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
      if (chargeClassification === 'ACC' && !isExcludedAccCat) monthAgg.costAccessorials += netAmount
      if (category1 === 'FUEL SURCHARGE' || category1 === 'ACCESSORIAL SURCHARGE') {
        monthAgg.costSurcharges += netAmount
      }
      monthSpend.set(monthLabel, monthAgg)
    }
  }

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
