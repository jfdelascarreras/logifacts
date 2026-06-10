import type { ContractDiscounts } from './types'
import type { FedExEstimateInput, FedExEstimateResult } from './fedex-types'
import accessorials from './data/fedex-accessorials.json'
import {
  calcBillableWeight,
  calcDimWeight,
  getFuelSurchargeRate,
  getPublishedRate,
  isExpressService,
  maxAvailableWeight,
} from './fedex-rates'
import { lookupFedExZone } from './fedex-zone-lookup'
import {
  additionalHandlingTrigger,
  dasRateKey,
  dasType,
  declaredValueCharge as calcDeclaredValue,
  fedexBaseZone,
  isOversize,
  tieredRate,
} from './fedex-accessorials'

function clamp(v?: number): number {
  return Math.min(Math.max(v ?? 0, 0), 0.95)
}

function resolveDiscounts(d?: ContractDiscounts): Required<ContractDiscounts> {
  return {
    transportation: clamp(d?.transportation),
    fuelSurcharge: clamp(d?.fuelSurcharge),
    residential: clamp(d?.residential),
    das: clamp(d?.das),
    additionalHandling: clamp(d?.additionalHandling),
    largePackage: clamp(d?.largePackage),
    addressCorrection: clamp(d?.addressCorrection),
    declaredValue: clamp(d?.declaredValue),
  }
}

function resolveService(input: FedExEstimateInput): FedExEstimateInput['service'] {
  if (input.service === 'ground' && input.residential) {
    return 'home_delivery'
  }
  return input.service
}

export function estimateFedEx(input: FedExEstimateInput): FedExEstimateResult {
  const service = resolveService(input)
  const { weightLbs, dimensionsIn, destinationZip, residential, zoneChart } = input

  if (weightLbs <= 0) {
    return { ok: false, error: 'Weight must be greater than 0.' }
  }

  const dimWeightLbs = dimensionsIn ? calcDimWeight(dimensionsIn) : null
  const { billableWeightLbs, billableWeightSource } = dimWeightLbs !== null
    ? calcBillableWeight(weightLbs, dimWeightLbs)
    : { billableWeightLbs: Math.ceil(weightLbs), billableWeightSource: 'actual' as const }

  const maxWt = maxAvailableWeight(service)
  if (billableWeightLbs > maxWt) {
    return {
      ok: false,
      error: `Billable weight ${billableWeightLbs} lbs exceeds maximum available rate (${maxWt} lbs) for this service.`,
    }
  }

  const zone = lookupFedExZone(zoneChart, destinationZip, service)
  if (zone === null) {
    return {
      ok: false,
      error: `Service not available or zone not found for destination ZIP ${destinationZip}.`,
    }
  }

  const publishedRate = getPublishedRate(service, billableWeightLbs, zone)
  if (publishedRate === null) {
    return {
      ok: false,
      error: `No published rate found for zone ${zone} at ${billableWeightLbs} lbs.`,
    }
  }

  const contractDiscounts = resolveDiscounts(input.contractDiscounts)
  const netTransportationCharge = publishedRate * (1 - contractDiscounts.transportation)

  const fuelSurchargeRate = (() => {
    const lr = input.fuelSurchargeRates
    if (lr) return isExpressService(service) ? lr.express : lr.ground
    return getFuelSurchargeRate(service)
  })()
  const fuelSurcharge = netTransportationCharge * fuelSurchargeRate * (1 - contractDiscounts.fuelSurcharge)

  const homeDeliverySurcharge =
    service === 'home_delivery'
      ? accessorials.homeDeliveryResidentialSurcharge * (1 - contractDiscounts.residential)
      : 0

  const residentialSurcharge =
    service !== 'home_delivery' && residential && isExpressService(service)
      ? accessorials.residentialSurcharge.express * (1 - contractDiscounts.residential)
      : 0

  const bz = fedexBaseZone(zone)

  const oversizeTriggered = dimensionsIn ? isOversize(dimensionsIn, weightLbs) : false
  const oversizeSurcharge = oversizeTriggered
    ? tieredRate(accessorials.oversizeCharge, bz) * (1 - contractDiscounts.largePackage)
    : 0

  const ahTrigger = !oversizeTriggered
    ? additionalHandlingTrigger(weightLbs, dimensionsIn, input.nonStandardPackaging ?? false)
    : null
  const ahListRate = ahTrigger
    ? tieredRate(accessorials.additionalHandling[ahTrigger], bz)
    : 0
  const additionalHandlingSurcharge = ahListRate * (1 - contractDiscounts.additionalHandling)

  const dasT = dasType(destinationZip)
  let dasSurcharge = 0
  if (dasT) {
    const key = dasRateKey(service, residential || service === 'home_delivery', dasT)
    const dasListRate = accessorials.deliveryAreaSurcharge[key] as number
    dasSurcharge = dasListRate * (1 - contractDiscounts.das)
  }

  const dvRaw = calcDeclaredValue(
    input.declaredValueDollars ?? 0,
    accessorials.declaredValue.minimumBandMax,
    accessorials.declaredValue.minimumCharge,
    accessorials.declaredValue.ratePerHundred,
  )
  const declaredValueCharge = dvRaw * (1 - contractDiscounts.declaredValue)

  const addressCorrectionCharge = input.addressCorrection
    ? accessorials.addressCorrection * (1 - contractDiscounts.addressCorrection)
    : 0

  const totalEstimatedCharge =
    netTransportationCharge +
    fuelSurcharge +
    homeDeliverySurcharge +
    residentialSurcharge +
    dasSurcharge +
    oversizeSurcharge +
    additionalHandlingSurcharge +
    declaredValueCharge +
    addressCorrectionCharge

  return {
    ok: true,
    breakdown: {
      carrier: 'fedex',
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
      homeDeliverySurcharge,
      residentialSurcharge,
      dasSurchargeType: dasT,
      dasSurcharge,
      oversizeSurcharge,
      additionalHandlingTrigger: ahTrigger,
      additionalHandlingSurcharge,
      declaredValueCharge,
      addressCorrectionCharge,
      totalEstimatedCharge,
    },
  }
}
