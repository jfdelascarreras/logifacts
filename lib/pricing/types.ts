export type UPSService = 'ground' | '3day' | '2day' | '2day_am' | 'nda_saver' | 'nda'
export type UPSRateType = 'daily' | 'smallBusiness'

export type ContractDiscounts = {
  transportation?: number    // applied to published base rate; 0–0.95
  fuelSurcharge?: number     // applied to fuel surcharge amount; 0–0.95
  residential?: number       // applied to residential surcharge; 0–0.95
  das?: number               // applied to DAS charge; 0–0.95
  additionalHandling?: number
  largePackage?: number
  addressCorrection?: number
  declaredValue?: number
}

export const UPS_SERVICE_LABELS: Record<UPSService, string> = {
  ground: 'UPS Ground',
  '3day': 'UPS 3 Day Select',
  '2day': 'UPS 2nd Day Air',
  '2day_am': 'UPS 2nd Day Air A.M.',
  nda_saver: 'UPS Next Day Air Saver',
  nda: 'UPS Next Day Air',
}

export type ZoneEntry = {
  ground: number | null
  '3day': number | null
  '2day': number | null
  '2day_am': number | null
  nda_saver: number | null
  nda: number | null
}

export type ZoneChart = Record<string, ZoneEntry>

export type AdditionalHandlingType = 'weight' | 'dimensions' | 'packaging'
export type RemoteAreaType = 'alaska' | 'hawaii' | 'us48'

export type UPSEstimateInput = {
  weightLbs: number
  dimensionsIn?: { length: number; width: number; height: number }
  destinationZip: string
  service: UPSService
  rateType?: UPSRateType           // defaults to 'daily'
  residential: boolean
  nonStandardPackaging?: boolean   // triggers packaging-type additional handling
  declaredValueDollars?: number    // 0 = no declared value coverage
  addressCorrection?: boolean      // post-shipment address correction flag
  zoneChart: ZoneChart
  contractDiscounts?: ContractDiscounts
  /** Live fuel surcharge rates from Redis/UPS. Falls back to history JSON when absent. */
  fuelSurchargeRates?: { ground: number; air: number }
}

export type UPSRateBreakdown = {
  service: UPSService
  rateType: UPSRateType
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
  residentialSurcharge: number
  largePackageSurcharge: number
  additionalHandlingTrigger: AdditionalHandlingType | null
  additionalHandlingSurcharge: number
  dasSurchargeType: 'standard' | 'extended' | null
  dasSurcharge: number
  remoteAreaType: RemoteAreaType | null
  remoteAreaSurcharge: number
  declaredValueCharge: number
  addressCorrectionCharge: number
  totalEstimatedCharge: number
}

export type UPSEstimateResult =
  | { ok: true; breakdown: UPSRateBreakdown }
  | { ok: false; error: string }
