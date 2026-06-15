import { fedexGroundTransitDays } from '@/lib/premium-analysis/fedex-transit-table'

/** Ground business-day transit by UPS zone (simplified stub per AGENTS Invoices.md). */
export function upsGroundTransitDays(zone: number): number | null {
  if (!Number.isFinite(zone) || zone <= 0 || zone >= 100) return null
  if (zone <= 2) return 1
  if (zone <= 4) return 2
  if (zone <= 6) return 3
  if (zone <= 8) return 4
  return 5
}

export function groundTransitDaysForZone(zone: number, carrier?: string): number | null {
  if (/fedex/i.test(carrier ?? '')) return fedexGroundTransitDays(zone)
  return upsGroundTransitDays(zone)
}

export function isExpeditedService(service: string): boolean {
  return /next.?day|nda|2\s*day|3\s*day|express|priority|air|overnight/i.test(service)
}

export function isAvoidableExpedited(zone: number, service: string, carrier?: string): boolean {
  if (!isExpeditedService(service)) return false
  const groundDays = groundTransitDaysForZone(zone, carrier)
  return groundDays != null && groundDays <= 3
}
