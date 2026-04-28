import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { InvoiceRecord } from '@/lib/invoice-csv'
import {
  filterRowsLikeClubColorsPowerQuery,
  parseInvoiceCsvText,
  toNumber,
} from '@/lib/invoice-csv'

/**
 * One UPS invoice has many charge lines (FRT, fuel, accessorials). Package Quantity is repeated on
 * each line — summing across all rows over-counts. We take max(Package Quantity) per logical shipment.
 */
function shipmentPackageDedupeKey(rec: InvoiceRecord): string | null {
  const invoice = (rec['Invoice Number'] ?? '').trim()
  const tracking = (rec['Tracking Number'] ?? '').trim()
  const ref1 = (rec['Shipment Reference Number 1'] ?? '').trim()
  const lead = (rec['Lead Shipment Number'] ?? '').trim()
  const shipId = tracking || ref1 || lead
  if (!shipId) return null
  return `${invoice}::${shipId}`
}

function parseInvoiceDateKey(raw: string | null): string | null {
  const value = (raw ?? '').replace(/^"|"$/g, '').trim()
  if (!value) return null

  // Keep only date component for values like "2025-06-30T00:00:00" or "06/30/2025 12:00:00 AM".
  const dateOnly = value.split(/[T\s]/)[0]

  let year = 0
  let month = 0
  let day = 0

  // MM/DD/YYYY or MM-DD-YYYY
  const usStyle = dateOnly.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  // YYYY-MM-DD or YYYY/MM/DD
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

function normalizeMappingText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

/** Allow long runs when recomputing many large CSVs (hosting plan must support it, e.g. Vercel Pro). */
export const maxDuration = 120

export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get uploads for this user (aggregate analysis across all uploads)
  const { data: uploads, error: uploadError } = await supabase
    .from('invoice_uploads')
    .select('id, csv_text, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  if (!uploads || uploads.length === 0) {
    return NextResponse.json({ error: 'No invoice uploads found' }, { status: 404 })
  }

  const records = filterRowsLikeClubColorsPowerQuery(
    uploads.flatMap((upload) => parseInvoiceCsvText(String(upload.csv_text ?? '')))
  )

  const { data: mappings, error: mappingsError } = await supabase
    .from('charge_description_mappings')
    .select(
      'charge_description, transportation_mode, category_1, category_2, category_3, category_4, category_5'
    )

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 400 })
  }

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
  for (const m of mappings ?? []) {
    mappingByDescription.set(normalizeMappingText(m.charge_description), {
      transportation_mode: String(m.transportation_mode ?? '').trim(),
      category_1: String(m.category_1 ?? '').trim(),
      category_2: String(m.category_2 ?? '').trim(),
      category_3: String(m.category_3 ?? '').trim(),
      category_4: String(m.category_4 ?? '').trim(),
      category_5: String(m.category_5 ?? '').trim(),
    })
  }

  // Basic metrics + DAX-style measures
  type Summary = {
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
      /** Distinct shipment keys used for package dedupe (for sanity checks vs Power BI). */
      packageDedupeShipmentCount: number
      fuelCost: number
      costSurcharges: number
      /** CALCULATE([Total Cost], ACC, not INF/ICC) — Power BI "Cost – Accessorials". */
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
  }

  const summary: Summary = {
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
  }

  let sumBilledWeight = 0
  let sumEnteredWeight = 0
  const dailySpend = new Map<string, { totalCost: number; netSpend: number }>()
  const monthSpend = new Map<
    string,
    { totalCost: number; costFuel: number; costAccessorials: number; costSurcharges: number }
  >()

  for (const rec of records) {
    const carrier = rec['Carrier Name'] || 'Unknown'
    const service =
      (rec['Original Service Description'] ?? '').trim() ||
      (rec['Charge Category Code'] ?? '').trim() ||
      'Unknown'

    // Power BI Total Cost = SUM('Club Colors Data'[Net Amount]) — same base for all CALCULATE measures.
    const netAmount = toNumber(rec['Net Amount'])
    const invoiceAmount = toNumber(rec['Invoice Amount'])
    const dutyAmount = toNumber(rec['Duty Amount'])
    const billedWeight = toNumber(rec['Billed Weight'])
    const enteredWeight = toNumber(rec['Entered Weight'])
    const chargeCategoryCode = (rec['Charge Category Code'] ?? '').trim().toUpperCase()
    const chargeClassification = (rec['Charge Classification Code'] ?? '').trim().toUpperCase()
    const chargeDescription = (rec['Charge Description'] ?? '').trim()
    const mapping = mappingByDescription.get(normalizeMappingText(chargeDescription))
    const category1 = normalizeMappingText(mapping?.category_1)
    const category2 = normalizeMappingText(mapping?.category_2)

    summary.totals.netAmount += netAmount
    summary.totals.invoiceAmount += invoiceAmount
    summary.totals.dutyAmount += dutyAmount

    summary.measures.totalCost += netAmount

    sumBilledWeight += billedWeight
    sumEnteredWeight += enteredWeight

    // Cost - Fuel: CALCULATE([Total Cost], '1.Mapping'[Category2] = "Fuel Surcharge")
    const isFuelRow = category2 === 'FUEL SURCHARGE'

    if (isFuelRow) {
      summary.measures.fuelCost += netAmount
    }

    if (category1 === 'FUEL SURCHARGE' || category1 === 'ACCESSORIAL SURCHARGE') {
      summary.measures.costSurcharges += netAmount
    }

    // Cost – Accessorials: ACC and not INF/ICC
    const isExcludedAccCat = chargeCategoryCode === 'INF' || chargeCategoryCode === 'ICC'
    if (chargeClassification === 'ACC' && !isExcludedAccCat) {
      summary.measures.costAccessorials += netAmount
    }

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
      const daily = dailySpend.get(dateKey) ?? { totalCost: 0, netSpend: 0 }
      daily.totalCost += invoiceAmount
      daily.netSpend += netAmount
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

  // Packages: sum Package Quantity once per shipment (not once per charge line).
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

  // Weight gap = Σ Billed Weight – Σ Entered Weight
  summary.measures.weightGap = sumBilledWeight - sumEnteredWeight

  const dimDateRows: Array<{
    date_key: string
    year_num: number
    month_num: number
    month_name: string
    month_label: string
    quarter_num: number
  }> = []
  const spendRows: Array<{
    user_id: string
    invoice_date: string
    total_cost: number
    net_spend: number
  }> = []

  for (const [dateKey, daily] of dailySpend.entries()) {
    const [yearText, monthText] = dateKey.split('-')
    const yearNum = Number(yearText)
    const monthNum = Number(monthText)
    const monthDate = new Date(Date.UTC(yearNum, monthNum - 1, 1))
    const monthName = monthDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
    const monthLabel = `${monthName} ${yearNum}`
    const quarterNum = Math.floor((monthNum - 1) / 3) + 1

    dimDateRows.push({
      date_key: dateKey,
      year_num: yearNum,
      month_num: monthNum,
      month_name: monthName,
      month_label: monthLabel,
      quarter_num: quarterNum,
    })

    spendRows.push({
      user_id: user.id,
      invoice_date: dateKey,
      total_cost: daily.totalCost,
      net_spend: daily.netSpend,
    })

  }

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

  if (dimDateRows.length) {
    const { error: dimDateError } = await supabase.from('dim_date').upsert(dimDateRows, {
      onConflict: 'date_key',
    })
    if (dimDateError) {
      return NextResponse.json({ error: dimDateError.message }, { status: 400 })
    }
  }

  const { error: clearSpendError } = await supabase
    .from('invoice_spend_by_date')
    .delete()
    .eq('user_id', user.id)
  if (clearSpendError) {
    return NextResponse.json({ error: clearSpendError.message }, { status: 400 })
  }

  if (spendRows.length) {
    const { error: spendUpsertError } = await supabase
      .from('invoice_spend_by_date')
      .upsert(spendRows, { onConflict: 'user_id,invoice_date' })
    if (spendUpsertError) {
      return NextResponse.json({ error: spendUpsertError.message }, { status: 400 })
    }
  }

  // Upsert into analysis table against the most recent upload ID.
  // We still keep this as a cache row while summary itself is aggregated across all uploads.
  const latestUploadId = uploads[0].id
  const { error: upsertError } = await supabase
    .from('invoice_upload_analyses')
    .upsert(
      {
        user_id: user.id,
        invoice_upload_id: latestUploadId,
        summary,
      },
      { onConflict: 'invoice_upload_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 })
  }

  return NextResponse.json({
    uploadId: latestUploadId,
    uploadsAnalyzed: uploads.length,
    summary,
  })
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('invoice_upload_analyses')
    .select('id, invoice_upload_id, created_at, updated_at, summary')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ analyses: data ?? [] })
}

