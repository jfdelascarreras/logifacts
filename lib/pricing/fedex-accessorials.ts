import type { FedExAdditionalHandlingType, FedExDasType, FedExService } from './fedex-types'
import rawZipSurcharges from './data/fedex-zip-surcharges.json'
import { isExpressService } from './fedex-rates'

type Dims = { length: number; width: number; height: number }
type ZoneTier = { zoneMin: number; zoneMax: number; rate: number }
type ZipSurchargeKind = 'das_standard' | 'das_extended' | 'das_remote'

/** Base zone 2–8 for tiered accessorials; territory zones (44/45/46) use tier 8. */
export function fedexBaseZone(zone: number): number {
  if (zone >= 2 && zone <= 8) return zone
  return 8
}

export function tieredRate(tiers: ZoneTier[], bz: number): number {
  return tiers.find(t => bz >= t.zoneMin && bz <= t.zoneMax)?.rate ?? 0
}

const ZIP_SURCHARGES = rawZipSurcharges as Record<string, ZipSurchargeKind>

export function isOversize(dims: Dims, weightLbs: number): boolean {
  const [longest, second, third] = [dims.length, dims.width, dims.height].sort((a, b) => b - a) as [
    number,
    number,
    number,
  ]
  const girth = 2 * (second + third)
  return weightLbs > 150 || longest > 96 || longest + girth > 130
}

export function dasType(destinationZip: string): FedExDasType | null {
  const kind = ZIP_SURCHARGES[destinationZip]
  if (kind === 'das_standard') return 'standard'
  if (kind === 'das_extended') return 'extended'
  if (kind === 'das_remote') return 'remote'
  return null
}

export function declaredValueCharge(
  declaredValueDollars: number,
  minimumBandMax: number,
  minimumCharge: number,
  ratePerHundred: number,
): number {
  if (declaredValueDollars <= 0) return 0
  if (declaredValueDollars <= minimumBandMax) return minimumCharge
  return (declaredValueDollars / 100) * ratePerHundred
}

export function additionalHandlingTrigger(
  weightLbs: number,
  dims: Dims | undefined,
  nonStandardPackaging: boolean,
): FedExAdditionalHandlingType | null {
  if (weightLbs > 50) return 'weight'
  if (dims) {
    const [longest, second] = [dims.length, dims.width, dims.height].sort((a, b) => b - a) as [number, number]
    if (longest > 48 || second > 30) return 'dimensions'
  }
  if (nonStandardPackaging) return 'packaging'
  return null
}

export function dasRateKey(
  service: FedExService,
  residential: boolean,
  dasT: FedExDasType,
): keyof typeof import('./data/fedex-accessorials.json')['deliveryAreaSurcharge'] {
  const svcGroup = isExpressService(service) ? 'express' : 'ground'
  const custGroup = residential ? 'Residential' : 'Commercial'
  if (dasT === 'remote') {
    return `remote${custGroup}` as 'remoteCommercial' | 'remoteResidential'
  }
  const extSuffix = dasT === 'extended' ? 'Extended' : ''
  return `${svcGroup}${custGroup}${extSuffix}` as
    | 'groundCommercial'
    | 'groundCommercialExtended'
    | 'groundResidential'
    | 'groundResidentialExtended'
    | 'expressCommercial'
    | 'expressCommercialExtended'
    | 'expressResidential'
    | 'expressResidentialExtended'
}
