import type { ContractDiscounts } from './types'

export type FedExService =
  | 'ground'
  | 'home_delivery'
  | 'express_saver'
  | '2day'
  | 'standard_overnight'
  | 'priority_overnight'

export type PricingCarrier = 'ups' | 'fedex'

export type FedExZoneEntry = {
  ground: number | null
  home_delivery: number | null
  express_saver: number | null
  '2day': number | null
  standard_overnight: number | null
  priority_overnight: number | null
}

export type FedExZoneChart = Record<string, FedExZoneEntry>

export type FedExAdditionalHandlingType = 'weight' | 'dimensions' | 'packaging'

export type FedExDasType = 'standard' | 'extended' | 'remote'

export const FEDEX_SERVICE_LABELS: Record<FedExService, string> = {
  ground: 'FedEx Ground',
  home_delivery: 'FedEx Home Delivery',
  express_saver: 'FedEx Express Saver',
  '2day': 'FedEx 2Day',
  standard_overnight: 'FedEx Standard Overnight',
  priority_overnight: 'FedEx Priority Overnight',
}

export type FedExEstimateInput = {
  weightLbs: number
  dimensionsIn?: { length: number; width: number; height: number }
  destinationZip: string
  service: FedExService
  residential: boolean
  nonStandardPackaging?: boolean
  declaredValueDollars?: number
  addressCorrection?: boolean
  zoneChart: FedExZoneChart
  contractDiscounts?: ContractDiscounts
  fuelSurchargeRates?: { ground: number; express: number }
}

export type FedExRateBreakdown = {
  carrier: 'fedex'
  service: FedExService
  actualWeightLbs: number
  dimWeightLbs: number | null
  billableWeightLbs: number
  billableWeightSource: 'actual' | 'dimensional'
  zone: number
  publishedRate: number
  contractDiscounts: Required<ContractDiscounts>
  netTransportationCharge: number
  fuelSurchargeRate: number
  fuelSurcharge: number
  homeDeliverySurcharge: number
  residentialSurcharge: number
  dasSurchargeType: FedExDasType | null
  dasSurcharge: number
  oversizeSurcharge: number
  additionalHandlingTrigger: FedExAdditionalHandlingType | null
  additionalHandlingSurcharge: number
  declaredValueCharge: number
  addressCorrectionCharge: number
  totalEstimatedCharge: number
}

export type FedExEstimateResult =
  | { ok: true; breakdown: FedExRateBreakdown }
  | { ok: false; error: string }
