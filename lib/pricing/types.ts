export type UPSService = 'ground' | '3day' | '2day' | 'nda_saver' | 'nda'

export const UPS_SERVICE_LABELS: Record<UPSService, string> = {
  ground: 'UPS Ground',
  '3day': 'UPS 3 Day Select',
  '2day': 'UPS 2nd Day Air',
  nda_saver: 'UPS Next Day Air Saver',
  nda: 'UPS Next Day Air',
}

export type ZoneEntry = {
  ground: number | null
  '3day': number | null
  '2day': number | null
  nda_saver: number | null
  nda: number | null
}

export type ZoneChart = Record<string, ZoneEntry>

export type UPSEstimateInput = {
  weightLbs: number
  dimensionsIn?: { length: number; width: number; height: number }
  destinationZip: string
  service: UPSService
  residential: boolean
  zoneChart: ZoneChart
}

export type UPSRateBreakdown = {
  service: UPSService
  actualWeightLbs: number
  dimWeightLbs: number | null
  billableWeightLbs: number
  billableWeightSource: 'actual' | 'dimensional'
  zone: number
  publishedRate: number
  serviceIncentivePct: number
  tierIncentivePct: number
  pldBonusPct: number
  totalDiscountPct: number
  netTransportationCharge: number
  fuelSurcharge: number
  residentialSurcharge: number
  totalEstimatedCharge: number
  estimatedContractTerms: boolean
}

export type UPSEstimateResult =
  | { ok: true; breakdown: UPSRateBreakdown }
  | { ok: false; error: string }
