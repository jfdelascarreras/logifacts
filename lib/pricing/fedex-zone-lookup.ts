import type { FedExService, FedExZoneChart } from './fedex-types'

export function lookupFedExZone(
  chart: FedExZoneChart,
  destZip: string,
  service: FedExService,
): number | null {
  const prefix = destZip.replace(/\D/g, '').padStart(5, '0').substring(0, 3)
  const entry = chart[prefix]
  if (!entry) return null
  return entry[service] ?? null
}
