import type { UPSService } from './types'
import ratesJson from './data/ups-rates.json'

const DIM_DIVISORS: Record<UPSService, number> = {
  ground: 220,
  '3day': 194,
  '2day': 194,
  nda_saver: 194,
  nda: 194,
}

export function calcDimWeight(
  dims: { length: number; width: number; height: number },
  service: UPSService
): number {
  return Math.ceil((dims.length * dims.width * dims.height) / DIM_DIVISORS[service])
}

export function calcBillableWeight(
  actualWeightLbs: number,
  dimWeightLbs: number
): { billableWeightLbs: number; billableWeightSource: 'actual' | 'dimensional' } {
  const actual = Math.ceil(actualWeightLbs)
  if (dimWeightLbs > actual) {
    return { billableWeightLbs: dimWeightLbs, billableWeightSource: 'dimensional' }
  }
  return { billableWeightLbs: actual, billableWeightSource: 'actual' }
}

// Contract D001207201 Addendum B — service incentive (weight-tiered for Ground)
function serviceIncentive(service: UPSService, billableWeightLbs: number): number {
  if (service === 'ground') {
    if (billableWeightLbs <= 5) return 0.35
    if (billableWeightLbs <= 10) return 0.38
    if (billableWeightLbs <= 20) return 0.41
    if (billableWeightLbs <= 30) return 0.43
    return 0.45
  }
  return 0
}

// Contract tier incentive (~$19–24K avg weekly spend band)
const TIER_INCENTIVE: Record<UPSService, number> = {
  ground: 0.16,
  '3day': 0.48,
  '2day': 0.56,
  nda_saver: 0.57, // estimated — NDA Saver not in original contract spec
  nda: 0.614,
}

const PLD_BONUS: Record<UPSService, number> = {
  ground: 0.05,
  '3day': 0.10,
  '2day': 0.10,
  nda_saver: 0.10,
  nda: 0.10,
}

export const FUEL_SURCHARGE_RATE = 0.172 // ~17.2% of net TC, est. 30% off list
export const RES_SURCHARGE_NET = 2.52    // $6.30 list × 40% net (60% off list)

export function calcDiscounts(service: UPSService, billableWeightLbs: number) {
  const svcPct = serviceIncentive(service, billableWeightLbs)
  const tierPct = TIER_INCENTIVE[service]
  const pldPct = PLD_BONUS[service]
  const totalPct = Math.min(svcPct + tierPct + pldPct, 0.95)
  return { svcPct, tierPct, pldPct, totalPct }
}

type RateIndex = Record<string, Record<string, number>>
type AllRatesIndex = Record<string, RateIndex>
const RATES = ratesJson as unknown as AllRatesIndex

export function getPublishedRate(
  service: UPSService,
  billableWeightLbs: number,
  zone: number
): number | null {
  const svcRates = RATES[service]
  if (!svcRates) return null
  return svcRates[String(billableWeightLbs)]?.[String(zone)] ?? null
}

export function maxAvailableWeight(service: UPSService): number {
  const svcRates = RATES[service]
  if (!svcRates) return 0
  return Math.max(...Object.keys(svcRates).map(Number))
}

export const ACCESSORIAL_REFERENCE = [
  { name: 'Address Correction', net: '~$7.88', detail: '~50% off list' },
  { name: 'Residential Surcharge', net: '$2.52', detail: '60% off $6.30 list' },
  { name: 'Delivery Area Surcharge', net: '$3.80–$7.60', detail: '~50% off list' },
  { name: 'Fuel Surcharge', net: '~17.2% of net TC', detail: '30% off list rate' },
  { name: 'Third Party Billing', net: '75% off list', detail: '' },
  { name: 'Declared Value', net: '41.18% off list', detail: '' },
] as const
