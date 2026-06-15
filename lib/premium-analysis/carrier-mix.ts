import type { ShipmentFact } from '@/lib/premium-analysis/shipment-fact'
import type { CarrierMixRow } from '@/lib/premium-analysis/agents-types'

/** Carrier × service × zone mode from shipment facts (net counted once per shipment). */
export function buildCarrierMix(facts: ShipmentFact[]): CarrierMixRow[] {
  type Agg = {
    carrier: string
    service: string
    zoneMode: string
    zone: number | null
    shipmentCount: number
    totalCost: number
  }
  const byKey = new Map<string, Agg>()

  for (const fact of facts) {
    const key = `${fact.carrier}\t${fact.service}\t${fact.zoneMode}`
    let agg = byKey.get(key)
    if (!agg) {
      agg = {
        carrier: fact.carrier,
        service: fact.service,
        zoneMode: fact.zoneMode,
        zone: fact.zone,
        shipmentCount: 0,
        totalCost: 0,
      }
      byKey.set(key, agg)
    }
    agg.shipmentCount += 1
    agg.totalCost += fact.shipmentNet
    if (agg.zone == null && fact.zone != null) agg.zone = fact.zone
  }

  return Array.from(byKey.values())
    .map((a) => ({
      carrier: a.carrier,
      service: a.service,
      zoneMode: a.zoneMode,
      zone: a.zone,
      shipmentCount: a.shipmentCount,
      totalCost: a.totalCost,
      avgCostPerShipment: a.shipmentCount > 0 ? a.totalCost / a.shipmentCount : 0,
    }))
    .sort((x, y) => y.totalCost - x.totalCost)
}
