import { modeFromZone, shipmentPackageDedupeKey } from '@/lib/premium-analysis/analysis-summary'
import type { CarrierMixRow } from '@/lib/premium-analysis/agents-types'
import { toNumber, type InvoiceRecord } from '@/lib/invoices/csv'

export function buildCarrierMix(records: InvoiceRecord[]): CarrierMixRow[] {
  type Agg = { shipments: Set<string>; totalCost: number }
  const byKey = new Map<string, Agg & { carrier: string; service: string; zoneMode: string; zone: number | null }>()

  for (const rec of records) {
    const carrier = (rec['Carrier Name'] ?? '').trim() || 'Unknown'
    const service =
      (rec['Original Service Description'] ?? '').trim() ||
      (rec['Charge Category Code'] ?? '').trim() ||
      'Unknown'
    const zone = toNumber(rec['Zone'])
    const zoneMode = modeFromZone(zone)
    const key = `${carrier}\t${service}\t${zoneMode}`
    const net = toNumber(rec['Net Amount'])

    let agg = byKey.get(key)
    if (!agg) {
      agg = { carrier, service, zoneMode, zone: Number.isFinite(zone) ? zone : null, shipments: new Set(), totalCost: 0 }
      byKey.set(key, agg)
    }
    agg.totalCost += net
    const shipKey = shipmentPackageDedupeKey(rec)
    if (shipKey) agg.shipments.add(shipKey)
  }

  return Array.from(byKey.values())
    .map((a) => {
      const shipmentCount = a.shipments.size
      return {
        carrier: a.carrier,
        service: a.service,
        zoneMode: a.zoneMode,
        zone: a.zone,
        shipmentCount,
        totalCost: a.totalCost,
        avgCostPerShipment: shipmentCount > 0 ? a.totalCost / shipmentCount : 0,
      }
    })
    .sort((x, y) => y.totalCost - x.totalCost)
}
