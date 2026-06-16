import {
  buildChargeDescriptionLookup,
  modeFromZone,
  parseInvoiceDateKey,
  shipmentPackageDedupeKey,
  type ChargeDescriptionMappingRow,
} from '@/lib/premium-analysis/analysis-summary'
import { primaryRollupDateRaw, toNumber, type InvoiceRecord } from '@/lib/invoices/csv'
import { resolveAgentsCategory, type AgentsChargeCategory } from '@/lib/premium-analysis/spec-categories'

export type ShipmentFact = {
  shipmentKey: string
  invoiceNumber: string | null
  tracking: string | null
  carrier: string
  service: string
  zone: number | null
  zoneMode: string
  shipDate: string | null
  packageQty: number
  shipmentNet: number
  baseFreightNet: number
  fuelNet: number
  accessorialNet: number
  billedWeight: number
  enteredWeight: number
  addressCorrectionNet: number
  addHandlingNet: number
  largePackageLineMax: number
  declaredValueNet: number
  lineCount: number
}

function trackingFromRecord(rec: InvoiceRecord): string | null {
  const t = (rec['Tracking Number'] ?? '').trim()
  if (t) return t
  const ref = (rec['Shipment Reference Number 1'] ?? '').trim()
  if (ref) return ref
  return (rec['Lead Shipment Number'] ?? '').trim() || null
}

function serviceFromRecord(rec: InvoiceRecord): string {
  return (
    (rec['Original Service Description'] ?? '').trim() ||
    (rec['Charge Category Code'] ?? '').trim() ||
    'Unknown'
  )
}

function emptyFact(shipmentKey: string): ShipmentFact {
  return {
    shipmentKey,
    invoiceNumber: null,
    tracking: null,
    carrier: 'Unknown',
    service: 'Unknown',
    zone: null,
    zoneMode: 'Unknown',
    shipDate: null,
    packageQty: 0,
    shipmentNet: 0,
    baseFreightNet: 0,
    fuelNet: 0,
    accessorialNet: 0,
    billedWeight: 0,
    enteredWeight: 0,
    addressCorrectionNet: 0,
    addHandlingNet: 0,
    largePackageLineMax: 0,
    declaredValueNet: 0,
    lineCount: 0,
  }
}

const ACCESSORIAL_CATEGORIES = new Set<AgentsChargeCategory>([
  'RESIDENTIAL',
  'DELIVERY_AREA',
  'PEAK',
  'ADD_HANDLING',
  'ADDRESS_CORRECTION',
  'LARGE_PACKAGE',
  'DECLARED_VALUE',
])

/** Roll charge lines up to one row per shipment (tracking dedupe key). */
export function buildShipmentFacts(
  records: InvoiceRecord[],
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>,
  mappingRows: ChargeDescriptionMappingRow[] | null | undefined
): ShipmentFact[] {
  const stdLookup = new Map<string, string | null>()
  const byKey = new Map<string, ShipmentFact>()

  for (const rec of records) {
    const shipKey = shipmentPackageDedupeKey(rec)
    if (!shipKey) continue

    const cat = resolveAgentsCategory(rec, mappingLookup, stdLookup, mappingRows)
    const net = toNumber(rec['Net Amount'])
    const zone = toNumber(rec['Zone'])
    const billed = toNumber(rec['Billed Weight'])
    const entered = toNumber(rec['Entered Weight'])
    const pq = toNumber(rec['Package Quantity'])

    let fact = byKey.get(shipKey)
    if (!fact) {
      fact = emptyFact(shipKey)
      byKey.set(shipKey, fact)
    }

    fact.lineCount += 1
    fact.shipmentNet += net

    if (cat === 'BASE_FREIGHT') fact.baseFreightNet += net
    if (cat === 'FUEL') fact.fuelNet += net
    if (ACCESSORIAL_CATEGORIES.has(cat)) fact.accessorialNet += net
    if (cat === 'ADDRESS_CORRECTION' && net > 0) fact.addressCorrectionNet += net
    if (cat === 'ADD_HANDLING' && net > 0) fact.addHandlingNet += net
    if (cat === 'LARGE_PACKAGE' && net > 0) {
      fact.largePackageLineMax = Math.max(fact.largePackageLineMax, net)
    }
    if (cat === 'DECLARED_VALUE' && net > 0) fact.declaredValueNet += net

    if (zone > 0 && fact.zone == null) fact.zone = zone
    if (billed > fact.billedWeight) fact.billedWeight = billed
    if (entered > fact.enteredWeight) fact.enteredWeight = entered
    if (pq > fact.packageQty) fact.packageQty = pq

    const carrier = (rec['Carrier Name'] ?? '').trim() || 'Unknown'
    const service = serviceFromRecord(rec)
    const tracking = trackingFromRecord(rec)
    const invoiceNumber = (rec['Invoice Number'] ?? '').trim() || null
    const shipDate = parseInvoiceDateKey(primaryRollupDateRaw(rec))

    if (!fact.carrier || fact.carrier === 'Unknown') fact.carrier = carrier
    if (!fact.service || fact.service === 'Unknown') fact.service = service
    if (!fact.tracking && tracking) fact.tracking = tracking
    if (!fact.invoiceNumber && invoiceNumber) fact.invoiceNumber = invoiceNumber
    if (!fact.shipDate && shipDate) fact.shipDate = shipDate
  }

  for (const fact of byKey.values()) {
    fact.zoneMode = modeFromZone(fact.zone ?? -1)
    if (fact.packageQty <= 0) fact.packageQty = 1
  }

  return [...byKey.values()]
}

/** Sum of max(billed) − max(entered) per shipment — avoids multi-line weight double-count. */
export function shipmentWeightGapLbs(facts: ShipmentFact[]): number {
  return facts.reduce((sum, f) => sum + Math.max(0, f.billedWeight - f.enteredWeight), 0)
}

export function totalShipmentNet(facts: ShipmentFact[]): number {
  return facts.reduce((sum, f) => sum + f.shipmentNet, 0)
}

export function totalPackageCount(facts: ShipmentFact[]): number {
  return facts.reduce((sum, f) => sum + f.packageQty, 0)
}
