import type { UPSService, ZoneChart } from './types'

export function lookupZone(
  chart: ZoneChart,
  destZip: string,
  service: UPSService
): number | null {
  const prefix = destZip.replace(/\D/g, '').padStart(5, '0').substring(0, 3)
  const entry = chart[prefix]
  if (!entry) return null
  return entry[service] ?? null
}
