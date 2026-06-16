/**
 * Static metadata for calculator accuracy disclosure (UI + docs).
 * Update validation counts when test suites change.
 */

export const CALCULATOR_VALIDATION = {
  lastAudited: '2026-06-16',
  toleranceUsd: 0.01,
  vitest: { files: 5, tests: 90 },
  crossValidation: {
    ups: { cases: 50, passed: 50, fixture: 'scripts/pricing_test_cases.json' },
    fedex: { cases: 7, passed: 7, fixture: 'scripts/fedex_pricing_test_cases.json' },
  },
} as const

export const FUEL_RATES = {
  ups: {
    effectiveDate: '2026-06-15',
    ground: 0.265,
    air: 0.275,
    source: 'UPS weekly fuel surcharge index (EIA + index tables)',
  },
  fedex: {
    effectiveDate: '2026-06-15',
    ground: 0.26,
    express: 0.27,
    source: 'FedEx weekly fuel surcharge index',
  },
} as const

export type CarrierSourceRow = {
  publication: string
  builds: string
  effectiveDate: string
}

export const UPS_SOURCES: CarrierSourceRow[] = [
  {
    publication: '2026 UPS Daily Rates XLSX',
    builds: 'Transportation list rates (1–150 lb, zones 2–8 + territories)',
    effectiveDate: '2025-12-22',
  },
  {
    publication: 'UPS Zone Advisor XLS exports',
    builds: '902 origin-prefix zone charts (origin → destination → service zone)',
    effectiveDate: '2026',
  },
  {
    publication: 'UPS Rate & Service Guide — accessorial PDF',
    builds: 'Residential, DAS, large package, additional handling, remote area, declared value',
    effectiveDate: '2025-12-22',
  },
  {
    publication: 'UPS DAS + Remote Area ZIP list',
    builds: '25,782 destination ZIPs → DAS standard/extended or remote tier',
    effectiveDate: '2026',
  },
  {
    publication: 'UPS weekly fuel surcharge index',
    builds: 'Ground 26.5% · Air 27.5% (week of 2026-06-15) via EIA + index tables',
    effectiveDate: '2026-06-15',
  },
]

export const FEDEX_SOURCES: CarrierSourceRow[] = [
  {
    publication: 'FedEx Standard List Rates 2026 PDF',
    builds: 'Ground, Home Delivery, Express Saver, 2Day, Standard/Priority Overnight',
    effectiveDate: '2026-01-05',
  },
  {
    publication: 'FedEx Service Guide 2026 + surcharge changes PDF',
    builds: 'Residential, DAS tiers, zone-tiered AHS/oversize, declared value, address correction',
    effectiveDate: '2026-01-05',
  },
  {
    publication: 'fedex_zones_COMPLETE.csv',
    builds: '975 origin prefixes — separate Express vs Ground zones',
    effectiveDate: '2026',
  },
  {
    publication: 'FedEx DAS ZIP list + 2025 change overlay',
    builds: '~25,854 ZIPs → standard / extended / remote DAS tier',
    effectiveDate: '2025',
  },
  {
    publication: 'FedEx weekly fuel surcharge index',
    builds: 'Ground 26% · Express 27% (week of 2026-06-15)',
    effectiveDate: '2026-06-15',
  },
]

export const CALCULATION_STEPS = {
  shared: [
    'Billable weight = max(actual weight, dimensional weight when dimensions provided)',
    'Zone = origin 3-digit prefix chart → destination 3-digit prefix → service-specific zone',
    'Published list rate = rate table lookup by service × billable weight × zone',
    'Contract discounts from My Profile applied per charge category (transportation, fuel, surcharges)',
    'Total = net transportation + fuel + accessorial surcharges + optional declared value / address correction',
  ],
  ups: [
    'DIM divisor: 220 (Ground) · 194 (air services)',
    'Fuel: % × net transportation (waived for Small Business program)',
    'DAS / remote area from UPS ZIP list; large package blocks additional handling',
    'Small Business uses separate rate table with fuel/DAS/AH waived',
  ],
  fedex: [
    'DIM divisor: 139 (all services)',
    'Ground + residential → Home Delivery service + HD residential surcharge',
    'Fuel: Ground index for Ground/HD · Express index for air services',
    'Oversize and additional handling are zone-tiered; oversize takes precedence',
  ],
} as const

export const KNOWN_LIMITATIONS = {
  shared: [
    'Estimates only — not a carrier invoice, label, or guaranteed ship cost',
    'Uses published list rates + your profile contract discounts; carrier billing may differ',
    'Fuel surcharge changes weekly; totals drift until history JSON is updated',
    'Client markup is computed in the browser only — not sent to the API',
  ],
  ups: [
    'Domestic parcel only — no SurePost, international, or freight',
    '2nd Day Air A.M. unavailable on some lanes (returns error, as carrier tools do)',
  ],
  fedex: [
    'Alaska/Hawaii DAS ZIPs use remote tier ($16.75); separate AK ($46) / HI ($16.25) amounts not modeled',
    'Express rates parsed to 50 lb max; no One Rate, SmartPost, freight, or international',
    'High Cost Service Area PDF is FedEx Freight only — excluded from parcel calculator',
  ],
} as const

export const DOC_LINKS = {
  accuracy: '/docs/PRICING_ACCURACY.md',
  upsCalculation: '/docs/PRICING_CALCULATION.md',
  fedexCalculation: '/docs/FEDEX_PRICING_CALCULATION.md',
  userGuide: '/docs/PRICING_USER_GUIDE.md',
} as const
