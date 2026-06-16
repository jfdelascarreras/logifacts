import type { FedExService } from './fedex-types'
import ratesJson from './data/fedex-rates.json'
import fuelHistory from './data/fedex-fuel-surcharge-history.json'

const DIM_DIVISOR = 139

const EXPRESS_SERVICES = new Set<FedExService>([
  'express_saver',
  '2day',
  'standard_overnight',
  'priority_overnight',
])

type RateIndex = Record<string, Record<string, number>>
type AllRatesIndex = Record<string, RateIndex>
const RATES = ratesJson as unknown as AllRatesIndex

export function calcDimWeight(
  dims: { length: number; width: number; height: number },
): number {
  return Math.ceil((dims.length * dims.width * dims.height) / DIM_DIVISOR)
}

export function calcBillableWeight(
  actualWeightLbs: number,
  dimWeightLbs: number,
): { billableWeightLbs: number; billableWeightSource: 'actual' | 'dimensional' } {
  const actual = Math.ceil(actualWeightLbs)
  if (dimWeightLbs > actual) {
    return { billableWeightLbs: dimWeightLbs, billableWeightSource: 'dimensional' }
  }
  return { billableWeightLbs: actual, billableWeightSource: 'actual' }
}

export function getFuelSurchargeRate(service: FedExService): number {
  const latest = fuelHistory[0]!
  return EXPRESS_SERVICES.has(service) ? latest.express : latest.ground
}

export function isExpressService(service: FedExService): boolean {
  return EXPRESS_SERVICES.has(service)
}

export function getPublishedRate(
  service: FedExService,
  billableWeightLbs: number,
  zone: number,
): number | null {
  const svcRates = RATES[service]
  if (!svcRates) return null
  return svcRates[String(billableWeightLbs)]?.[String(zone)] ?? null
}

export function maxAvailableWeight(service: FedExService): number {
  const svcRates = RATES[service]
  if (!svcRates) return 0
  return Math.max(...Object.keys(svcRates).map(Number))
}
