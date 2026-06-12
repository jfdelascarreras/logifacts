import type { SpecCategoriesSummary } from '@/lib/premium-analysis/spec-categories'

export type AnomalyFlagType =
  | 'fuel_over_eia'
  | 'accessorial_rate_high'
  | 'address_correction'
  | 'avoidable_expedited'
  | 'weight_gap_high'
  | 'additional_handling'
  | 'large_package'
  | 'declared_value'
  | 'contract_discount_shortfall'
  | 'monthly_spend_spike'

export type AnomalyFlag = {
  type: AnomalyFlagType
  trackingNumber: string | null
  invoiceNumber: string | null
  amount: number
  description: string
  severity: 'high' | 'medium' | 'low'
}

export type CarrierMixRow = {
  carrier: string
  service: string
  zoneMode: string
  zone: number | null
  shipmentCount: number
  totalCost: number
  avgCostPerShipment: number
}

export type DatasetFlags = {
  weightGapExceeds500Lbs: boolean
  accessorialRateHigh: boolean
  accessorialRate: number
  monthlySpikeMonths: string[]
  wweFuelEmbedded: boolean
  wwePresent: boolean
}

export type SavingsOpportunity = {
  type: string
  periodAmount: number
  annualizedLow: number
  annualizedHigh: number
}

export type SavingsEstimate = {
  low: number
  high: number
  annualizedBasisMonths: number
  opportunities: SavingsOpportunity[]
}

export type ActionItem = {
  rank: number
  category: string
  annualSavingsLow: number
  annualSavingsHigh: number
  effort: 'low' | 'medium' | 'high'
  instructions: string
  executable: boolean
}

export type AgentsAnalysisExtensions = {
  specCategories?: SpecCategoriesSummary
  carrierMix?: CarrierMixRow[]
  anomalyFlags?: AnomalyFlag[]
  savingsEstimate?: SavingsEstimate
  actionItems?: ActionItem[]
  datasetFlags?: DatasetFlags
}
