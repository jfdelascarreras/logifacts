import type { UPSEstimateInput, UPSEstimateResult } from './types'
import {
  calcDimWeight,
  calcBillableWeight,
  calcDiscounts,
  getPublishedRate,
  maxAvailableWeight,
  FUEL_SURCHARGE_RATE,
  RES_SURCHARGE_NET,
} from './ups-rates'
import { lookupZone } from './ups-zone-lookup'

export function estimateUPS(input: UPSEstimateInput): UPSEstimateResult {
  const { weightLbs, dimensionsIn, destinationZip, service, residential, zoneChart } = input

  if (weightLbs <= 0) {
    return { ok: false, error: 'Weight must be greater than 0.' }
  }

  const dimWeightLbs = dimensionsIn ? calcDimWeight(dimensionsIn, service) : null

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

  const zone = lookupZone(zoneChart, destinationZip, service)
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

  const { svcPct, tierPct, pldPct, totalPct } = calcDiscounts(service, billableWeightLbs)
  const netTransportationCharge = publishedRate * (1 - totalPct)
  const fuelSurcharge = netTransportationCharge * FUEL_SURCHARGE_RATE
  const residentialSurcharge = residential ? RES_SURCHARGE_NET : 0
  const totalEstimatedCharge = netTransportationCharge + fuelSurcharge + residentialSurcharge

  return {
    ok: true,
    breakdown: {
      service,
      actualWeightLbs: weightLbs,
      dimWeightLbs,
      billableWeightLbs,
      billableWeightSource,
      zone,
      publishedRate,
      serviceIncentivePct: svcPct,
      tierIncentivePct: tierPct,
      pldBonusPct: pldPct,
      totalDiscountPct: totalPct,
      netTransportationCharge,
      fuelSurcharge,
      residentialSurcharge,
      totalEstimatedCharge,
      estimatedContractTerms: service === 'nda_saver',
    },
  }
}
