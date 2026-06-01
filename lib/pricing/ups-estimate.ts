import type { ContractDiscounts, UPSEstimateInput, UPSEstimateResult, UPSRateType } from './types'
import {
  calcDimWeight,
  calcDimWeightSB,
  calcBillableWeight,
  getPublishedRate,
  getPublishedRateSB,
  hasSBRates,
  maxAvailableWeight,
  maxAvailableWeightSB,
  getFuelSurchargeRate,
} from './ups-rates'
import { lookupZone } from './ups-zone-lookup'
import {
  baseZone,
  tieredRate,
  isLargePackage,
  additionalHandlingTrigger,
  remoteAreaType,
  dasType,
  declaredValueCharge as calcDeclaredValue,
} from './ups-accessorials'
import accessorials from './data/accessorials.json'

const AIR_SERVICES = new Set(['3day', '2day', '2day_am', 'nda_saver', 'nda'])

function clamp(v?: number): number {
  return Math.min(Math.max(v ?? 0, 0), 0.95)
}

function resolveDiscounts(d?: ContractDiscounts): Required<ContractDiscounts> {
  return {
    transportation:    clamp(d?.transportation),
    fuelSurcharge:     clamp(d?.fuelSurcharge),
    residential:       clamp(d?.residential),
    das:               clamp(d?.das),
    additionalHandling: clamp(d?.additionalHandling),
    largePackage:      clamp(d?.largePackage),
    addressCorrection: clamp(d?.addressCorrection),
    declaredValue:     clamp(d?.declaredValue),
  }
}

export function estimateUPS(input: UPSEstimateInput): UPSEstimateResult {
  const { weightLbs, dimensionsIn, destinationZip, service, residential, zoneChart } = input
  const rateType: UPSRateType = input.rateType ?? 'daily'
  const isSB = rateType === 'smallBusiness'

  if (weightLbs <= 0) {
    return { ok: false, error: 'Weight must be greater than 0.' }
  }

  if (isSB && !hasSBRates()) {
    return { ok: false, error: 'Small Business rate tables are not yet available. Please contact support.' }
  }

  const dimWeightLbs = dimensionsIn
    ? (isSB ? calcDimWeightSB(dimensionsIn) : calcDimWeight(dimensionsIn, service))
    : null

  const { billableWeightLbs, billableWeightSource } = dimWeightLbs !== null
    ? calcBillableWeight(weightLbs, dimWeightLbs)
    : { billableWeightLbs: Math.ceil(weightLbs), billableWeightSource: 'actual' as const }

  const maxWt = isSB ? maxAvailableWeightSB(service) : maxAvailableWeight(service)
  if (billableWeightLbs > maxWt) {
    return {
      ok: false,
      error: `Billable weight ${billableWeightLbs} lbs exceeds maximum available rate (${maxWt} lbs) for this service.`,
    }
  }

  const zone = lookupZone(zoneChart, destinationZip, service)
  if (zone === null) {
    return {
      ok: false,
      error: `Service not available or zone not found for destination ZIP ${destinationZip}.`,
    }
  }

  const publishedRate = isSB
    ? getPublishedRateSB(service, billableWeightLbs, zone)
    : getPublishedRate(service, billableWeightLbs, zone)
  if (publishedRate === null) {
    return {
      ok: false,
      error: `No published rate found for zone ${zone} at ${billableWeightLbs} lbs.`,
    }
  }

  // SB rates are pre-negotiated — no additional contract discounts
  const contractDiscounts = isSB ? resolveDiscounts({}) : resolveDiscounts(input.contractDiscounts)

  // Transportation
  const netTransportationCharge = publishedRate * (1 - contractDiscounts.transportation)

  // Fuel surcharge — waived for SB; use injected live rates when provided, else history JSON
  const fuelSurchargeRate = isSB ? 0 : (() => {
    const lr = input.fuelSurchargeRates
    if (lr) return AIR_SERVICES.has(service) ? lr.air : lr.ground
    return getFuelSurchargeRate(service)
  })()
  const fuelSurcharge = isSB ? 0 : netTransportationCharge * fuelSurchargeRate * (1 - contractDiscounts.fuelSurcharge)

  // Residential surcharge — SB has lower flat rates ($3.55 ground / $4.00 air)
  const sbRes = accessorials.smallBusiness.residentialSurcharge
  const resListRate = isSB
    ? (AIR_SERVICES.has(service) ? sbRes.air : sbRes.ground)
    : (AIR_SERVICES.has(service) ? accessorials.residentialSurcharge.air : accessorials.residentialSurcharge.ground)
  const residentialSurcharge = residential
    ? resListRate * (isSB ? 1 : (1 - contractDiscounts.residential))
    : 0

  // Zone-tiered accessorials
  const bz = baseZone(zone, service)

  // Large Package Surcharge — waived for SB
  const lpTriggered = !isSB && (dimensionsIn ? isLargePackage(dimensionsIn) : false)
  const lpListRate = lpTriggered
    ? tieredRate(
        residential
          ? accessorials.largePackageSurcharge.residential
          : accessorials.largePackageSurcharge.commercial,
        bz,
      )
    : 0
  const largePackageSurcharge = lpListRate * (1 - contractDiscounts.largePackage)

  // Additional Handling — waived for SB; also skipped when large package applies
  const ahTrigger = (!isSB && !lpTriggered)
    ? additionalHandlingTrigger(weightLbs, dimensionsIn, input.nonStandardPackaging ?? false)
    : null
  const ahListRate = ahTrigger
    ? tieredRate(accessorials.additionalHandling[ahTrigger], bz)
    : 0
  const additionalHandlingSurcharge = ahListRate * (1 - contractDiscounts.additionalHandling)

  // DAS — waived for SB
  const dasT = isSB ? null : dasType(destinationZip)
  let dasSurcharge = 0
  if (!isSB && dasT) {
    const svcGroup = AIR_SERVICES.has(service) ? 'air' : 'ground'
    const custGroup = residential ? 'Residential' : 'Commercial'
    const extSuffix = dasT === 'extended' ? 'Extended' : ''
    const dasKey = `${svcGroup}${custGroup}${extSuffix}` as keyof typeof accessorials.deliveryAreaSurcharge
    const dasListRate = accessorials.deliveryAreaSurcharge[dasKey] as number
    dasSurcharge = dasListRate * (1 - contractDiscounts.das)
  }

  // Remote area surcharge — US-48 waived for SB; Alaska/Hawaii still apply
  const raType = remoteAreaType(destinationZip)
  let remoteAreaSurcharge = 0
  if (raType) {
    const waived = isSB && raType === 'us48'
    if (!waived) {
      const raListRate = accessorials.remoteAreaSurcharge[raType]
      remoteAreaSurcharge = raListRate * (isSB ? 1 : (1 - contractDiscounts.das))
    }
  }

  // Declared value charge — same for both rate types
  const dvRaw = calcDeclaredValue(
    input.declaredValueDollars ?? 0,
    accessorials.declaredValue.ratePerHundred,
    accessorials.declaredValue.minimum,
  )
  const declaredValueCharge = dvRaw * (1 - contractDiscounts.declaredValue)

  // Address correction — waived for SB
  const acListRate = (!isSB && input.addressCorrection) ? accessorials.addressCorrection.ground : 0
  const addressCorrectionCharge = acListRate * (1 - contractDiscounts.addressCorrection)

  const totalEstimatedCharge =
    netTransportationCharge +
    fuelSurcharge +
    residentialSurcharge +
    dasSurcharge +
    largePackageSurcharge +
    additionalHandlingSurcharge +
    remoteAreaSurcharge +
    declaredValueCharge +
    addressCorrectionCharge

  return {
    ok: true,
    breakdown: {
      rateType,
      service,
      actualWeightLbs: weightLbs,
      dimWeightLbs,
      billableWeightLbs,
      billableWeightSource,
      zone,
      publishedRate,
      contractDiscounts,
      netTransportationCharge,
      fuelSurchargeRate,
      fuelSurcharge,
      residentialSurcharge,
      dasSurchargeType: dasT,
      dasSurcharge,
      largePackageSurcharge,
      additionalHandlingTrigger: ahTrigger,
      additionalHandlingSurcharge,
      remoteAreaType: raType,
      remoteAreaSurcharge,
      declaredValueCharge,
      addressCorrectionCharge,
      totalEstimatedCharge,
    },
  }
}
