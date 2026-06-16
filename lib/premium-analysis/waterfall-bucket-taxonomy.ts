/**
 * Mapping taxonomy copy for MoM waterfall buckets — aligned with docs/MAPPING_TAXONOMY_TREE.md.
 */

export type WaterfallBucketKey =
  | 'Base Freight'
  | 'Fuel'
  | 'Other surcharges'
  | 'Accessorials'

export type WaterfallBucketTaxonomy = {
  /** One-line definition for the bucket. */
  summary: string
  /** How the app computes this waterfall step (mutually exclusive partition). */
  formula: string
  /** Category 1 families from master_mapping that typically land here. */
  category1: string[]
  /** Category 2 charge types (CPP chart groups) commonly in this bucket. */
  category2: string[]
  /** Category 3 rule that drives KPI classification. */
  category3Rule: string
  /** Example charge descriptions / mapping paths. */
  examples: string[]
  /** Relationship to dashboard KPI cards, if any. */
  kpiNote?: string
}

export const WATERFALL_BUCKET_TAXONOMY: Record<WaterfallBucketKey, WaterfallBucketTaxonomy> = {
  'Base Freight': {
    summary: 'Core transport and linehaul — service freight not classified as surcharge or accessorial.',
    formula: 'totalCost − costSurcharges − costAccessorials',
    category1: ['Base Freight', 'Other / Penalties (returns base lines)'],
    category2: ['Base Freight', 'International', 'LTL / Hundredweight', 'Other Admin (corrections on base)'],
    category3Rule: 'category_3 = Base Freight or LTL Freight',
    examples: [
      'Ground Commercial / Residential',
      'Next Day Air · 2nd Day Air · 3 Day Select',
      'International / Worldwide',
      'Hundredweight / LTL',
    ],
    kpiNote: 'Not included in Fuel, Surcharges, or Accessorials KPI cards.',
  },
  Fuel: {
    summary: 'Fuel surcharge lines — Category 1 Fuel Surcharge in master_mapping.',
    formula: 'costFuel (category_3 = FUEL SURCHARGE)',
    category1: ['Fuel Surcharge'],
    category2: ['Fuel Surcharge', 'Other Admin (fuel on corrections)'],
    category3Rule: 'category_3 = Fuel Surcharge',
    examples: ['Fuel Surcharge', 'Fuel Surcharge Adjustment', 'Returns Fuel Surcharge'],
    kpiNote: 'Counted in both Fuel and Surcharges KPIs; waterfall shows fuel once — other surcharges excludes it.',
  },
  'Other surcharges': {
    summary: 'Non-fuel surcharges — peak/demand and other category_3 = Surcharge spend.',
    formula: 'max(0, costSurcharges − costFuel)',
    category1: ['Accessorial Surcharge (Peak/Demand branch)'],
    category2: ['Peak/Demand'],
    category3Rule: 'category_3 = Surcharge (not Fuel Surcharge)',
    examples: [
      'Peak Season Surcharge',
      'Demand — Additional Handling',
      'Demand surcharge commercial / residential',
    ],
    kpiNote: 'Part of costSurcharges KPI, excluding fuel.',
  },
  Accessorials: {
    summary:
      'Delivery-area, residential, handling, and other accessorial-style charges — not base freight or surcharge KPI family.',
    formula: 'costAccessorials',
    category1: ['Accessorial Surcharge'],
    category2: [
      'Area Surcharge',
      'Residential Surcharge',
      'Handling',
      'Express Premium',
      'Signature',
      'Miscellaneous',
    ],
    category3Rule:
      'category_3 = Accessorials, or UPS Charge Classification = ACC (excl. INF/ICC)',
    examples: [
      'Delivery Area / DAS / Remote',
      'Residential Delivery',
      'Additional Handling',
      'Address Correction',
      'Declared Value',
    ],
    kpiNote: 'Separate from Surcharges KPI — accessorial taxonomy + ACC classification.',
  },
}

export function waterfallBucketTaxonomy(label: string): WaterfallBucketTaxonomy | null {
  return WATERFALL_BUCKET_TAXONOMY[label as WaterfallBucketKey] ?? null
}
