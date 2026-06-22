import { resolveFedExFuelSurchargeRates } from '@/lib/cache/fedex-fuel-surcharge-cache'
import { resolveFuelSurchargeRates } from '@/lib/cache/ups-fuel-surcharge-cache'
import { estimateFedEx } from '@/lib/pricing/fedex-estimate'
import type { FedExRateBreakdown, FedExService } from '@/lib/pricing/fedex-types'
import { loadFedExZoneChart, resolveFedExZoneChartPrefix } from '@/lib/pricing/fedex-zone-chart-loader'
import { RATES_VERSION } from '@/lib/pricing/rates-version'
import type { ContractDiscounts, UPSRateBreakdown, UPSService } from '@/lib/pricing/types'
import { estimateUPS } from '@/lib/pricing/ups-estimate'
import { loadZoneChart, resolveZoneChartPrefix } from '@/lib/pricing/zone-chart-loader'

export type Dimensions = { length: number; width: number; height: number }

export type CarrierRate = {
  service_type: string
  billed_weight_lbs: number
  billed_weight_source: 'actual' | 'dimensional'
  base_rate: number
  fuel_surcharge: number
  accessorial_charges: number
  contract_discount_applied: number
  markup_applied: number
  final_rate: number
  rates_version: string
}

export type CarrierResult = CarrierRate | { error: string }

export type CalcParams = {
  weightLbs: number
  dimensionsIn: Dimensions
  originZip: string
  destZip: string
  residential: boolean
  nonStandard: boolean
  addressCorrection: boolean
  contractDiscounts: ContractDiscounts
  markupPct: number
}

function round2(n: number): number {
  return parseFloat(n.toFixed(2))
}

function upsAccessorialTotal(b: UPSRateBreakdown): number {
  return (
    b.residentialSurcharge +
    b.largePackageSurcharge +
    b.additionalHandlingSurcharge +
    b.dasSurcharge +
    b.remoteAreaSurcharge +
    b.declaredValueCharge +
    b.addressCorrectionCharge
  )
}

function fedexAccessorialTotal(b: FedExRateBreakdown): number {
  return (
    b.homeDeliverySurcharge +
    b.residentialSurcharge +
    b.dasSurcharge +
    b.oversizeSurcharge +
    b.additionalHandlingSurcharge +
    b.declaredValueCharge +
    b.addressCorrectionCharge
  )
}

export async function calcUPS(params: CalcParams & { service: UPSService }): Promise<CarrierResult> {
  const zoneChart = loadZoneChart(params.originZip)
  if (!zoneChart) {
    const prefix = resolveZoneChartPrefix(params.originZip)
    return {
      error: prefix
        ? `Zone chart unavailable for origin prefix ${prefix}.`
        : 'Zone chart unavailable for this origin ZIP.',
    }
  }

  const fuelResolved = await resolveFuelSurchargeRates({ warmCache: false })
  const fuelSurchargeRates = fuelResolved
    ? { ground: fuelResolved.ground, air: fuelResolved.air }
    : undefined

  const result = estimateUPS({
    weightLbs: params.weightLbs,
    dimensionsIn: params.dimensionsIn,
    destinationZip: params.destZip,
    service: params.service,
    rateType: 'daily',
    residential: params.residential,
    nonStandardPackaging: params.nonStandard,
    addressCorrection: params.addressCorrection,
    zoneChart,
    contractDiscounts: params.contractDiscounts,
    fuelSurchargeRates,
  })

  if (!result.ok) return { error: result.error }

  const b = result.breakdown
  const markupApplied = round2(b.totalEstimatedCharge * (params.markupPct / 100))

  return {
    service_type: params.service,
    billed_weight_lbs: b.billableWeightLbs,
    billed_weight_source: b.billableWeightSource,
    base_rate: round2(b.publishedRate),
    fuel_surcharge: round2(b.fuelSurcharge),
    accessorial_charges: round2(upsAccessorialTotal(b)),
    contract_discount_applied: round2(b.publishedRate - b.netTransportationCharge),
    markup_applied: markupApplied,
    final_rate: round2(b.totalEstimatedCharge + markupApplied),
    rates_version: RATES_VERSION.ups.effectiveDate,
  }
}

export async function calcFedEx(params: CalcParams & { service: FedExService }): Promise<CarrierResult> {
  const zoneChart = loadFedExZoneChart(params.originZip)
  if (!zoneChart) {
    const prefix = resolveFedExZoneChartPrefix(params.originZip)
    return {
      error: prefix
        ? `FedEx zone chart unavailable for origin prefix ${prefix}.`
        : 'FedEx zone chart unavailable for this origin ZIP.',
    }
  }

  const fuelResolved = await resolveFedExFuelSurchargeRates({ warmCache: false })
  const fuelSurchargeRates = fuelResolved
    ? { ground: fuelResolved.ground, express: fuelResolved.express }
    : undefined

  const result = estimateFedEx({
    weightLbs: params.weightLbs,
    dimensionsIn: params.dimensionsIn,
    destinationZip: params.destZip,
    service: params.service,
    residential: params.residential,
    nonStandardPackaging: params.nonStandard,
    addressCorrection: params.addressCorrection,
    zoneChart,
    contractDiscounts: params.contractDiscounts,
    fuelSurchargeRates,
  })

  if (!result.ok) return { error: result.error }

  const b = result.breakdown
  const markupApplied = round2(b.totalEstimatedCharge * (params.markupPct / 100))

  return {
    service_type: b.service,
    billed_weight_lbs: b.billableWeightLbs,
    billed_weight_source: b.billableWeightSource,
    base_rate: round2(b.publishedRate),
    fuel_surcharge: round2(b.fuelSurcharge),
    accessorial_charges: round2(fedexAccessorialTotal(b)),
    contract_discount_applied: round2(b.publishedRate - b.netTransportationCharge),
    markup_applied: markupApplied,
    final_rate: round2(b.totalEstimatedCharge + markupApplied),
    rates_version: RATES_VERSION.fedex.effectiveDate,
  }
}
