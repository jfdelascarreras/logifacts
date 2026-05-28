import type { UPSService } from './types'
import ratesJson from './data/ups-rates.json'
import sbRatesJson from './data/ups-sb-rates.json'
import fuelHistory from './data/ups-fuel-surcharge-history.json'

const DIM_DIVISORS: Record<UPSService, number> = {
  ground: 220,
  '3day': 194,
  '2day': 194,
  '2day_am': 194,
  nda_saver: 194,
  nda: 194,
}

export function calcDimWeight(
  dims: { length: number; width: number; height: number },
  service: UPSService
): number {
  return Math.ceil((dims.length * dims.width * dims.height) / DIM_DIVISORS[service])
}

// SB: divisor 166 for all services, only applied when volume > 864 cu in
const SB_DIM_DIVISOR = 166
const SB_DIM_THRESHOLD = 864

export function calcDimWeightSB(
  dims: { length: number; width: number; height: number }
): number | null {
  const volume = dims.length * dims.width * dims.height
  if (volume <= SB_DIM_THRESHOLD) return null
  return Math.ceil(volume / SB_DIM_DIVISOR)
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

const AIR_SERVICES = new Set<UPSService>(['3day', '2day', '2day_am', 'nda_saver', 'nda'])

export function getFuelSurchargeRate(service: UPSService): number {
  const latest = fuelHistory[0]
  return AIR_SERVICES.has(service) ? latest.domesticAir : latest.domesticGround
}


type RateIndex = Record<string, Record<string, number>>
type AllRatesIndex = Record<string, RateIndex>
const RATES = ratesJson as unknown as AllRatesIndex
const SB_RATES = sbRatesJson as unknown as AllRatesIndex

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

export function hasSBRates(): boolean {
  return Object.entries(SB_RATES).some(
    ([key, val]) => !key.startsWith('_') && typeof val === 'object' && val !== null && Object.keys(val).length > 0
  )
}

export function getPublishedRateSB(
  service: UPSService,
  billableWeightLbs: number,
  zone: number
): number | null {
  const svcRates = SB_RATES[service]
  if (!svcRates || Object.keys(svcRates).length === 0) return null
  return svcRates[String(billableWeightLbs)]?.[String(zone)] ?? null
}

export function maxAvailableWeightSB(service: UPSService): number {
  const svcRates = SB_RATES[service]
  if (!svcRates || Object.keys(svcRates).length === 0) return 0
  return Math.max(...Object.keys(svcRates).map(Number))
}

export const ACCESSORIAL_REFERENCE = [
  { name: 'Address Correction', net: '~$7.88', detail: '~50% off list' },
  { name: 'Residential Surcharge', net: '$2.52', detail: '60% off $6.30 list' },
  { name: 'Delivery Area Surcharge', net: '$3.80–$7.60', detail: '~50% off list' },
  { name: 'Fuel Surcharge', net: 'varies weekly', detail: 'see breakdown above' },
  { name: 'Third Party Billing', net: '75% off list', detail: '' },
  { name: 'Declared Value', net: '41.18% off list', detail: '' },
] as const
