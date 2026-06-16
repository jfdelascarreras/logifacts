import { fedexBaseZone } from '@/lib/pricing/fedex-accessorials'
import { getPublishedRate, isExpressService } from '@/lib/pricing/fedex-rates'
import type { FedExService } from '@/lib/pricing/fedex-types'

export function fedExServiceFromDescription(service: string): FedExService | null {
  const s = service.toLowerCase()
  if (/priority\s*overnight/i.test(s)) return 'priority_overnight'
  if (/standard\s*overnight/i.test(s)) return 'standard_overnight'
  if (/2\s*day|2day/i.test(s)) return '2day'
  if (/express\s*saver/i.test(s)) return 'express_saver'
  if (/home\s*delivery/i.test(s)) return 'home_delivery'
  if (/ground/i.test(s)) return 'ground'
  return null
}

/**
 * Avoidable premium = expedited net minus equivalent Ground list delta, scaled to net paid.
 * Returns null when pricing lookup cannot run (caller falls back to base freight net).
 */
export function marginalAvoidablePremium(args: {
  carrier: string
  service: string
  zone: number
  weightLbs: number
  baseFreightNet: number
  residential?: boolean
}): number | null {
  if (!/fedex/i.test(args.carrier)) return null
  if (args.baseFreightNet <= 0 || args.zone <= 0) return null

  const expedited = fedExServiceFromDescription(args.service)
  if (!expedited || !isExpressService(expedited)) return null

  const zone = fedexBaseZone(args.zone)
  const weight = Math.max(1, Math.ceil(args.weightLbs))
  const groundSvc: FedExService = args.residential ? 'home_delivery' : 'ground'

  const groundPublished = getPublishedRate(groundSvc, weight, zone)
  const expeditedPublished = getPublishedRate(expedited, weight, zone)
  if (groundPublished == null || expeditedPublished == null) return null

  const marginalList = Math.max(0, expeditedPublished - groundPublished)
  if (marginalList <= 0) return 0

  const scale = expeditedPublished > 0 ? args.baseFreightNet / expeditedPublished : 1
  return Math.min(args.baseFreightNet, marginalList * scale)
}
