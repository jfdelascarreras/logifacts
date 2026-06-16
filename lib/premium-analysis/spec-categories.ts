import { toNumber, type InvoiceRecord } from '@/lib/invoices/csv'

import {
  buildChargeDescriptionLookup,
  lookupChargeTaxonomyForRecord,
  normalizeMappingText,
  type ChargeDescriptionMappingRow,
} from '@/lib/premium-analysis/analysis-summary'

export const AGENTS_CHARGE_CATEGORIES = [
  'BASE_FREIGHT',
  'FUEL',
  'RESIDENTIAL',
  'DELIVERY_AREA',
  'PEAK',
  'ADD_HANDLING',
  'ADDRESS_CORRECTION',
  'LARGE_PACKAGE',
  'DECLARED_VALUE',
  'OTHER',
] as const

export type AgentsChargeCategory = (typeof AGENTS_CHARGE_CATEGORIES)[number]

export type SpecCategoryRollup = {
  category: AgentsChargeCategory
  totalCost: number
  pctOfTotal: number
  lineCount: number
}

export type SpecCategoriesSummary = {
  categories: SpecCategoryRollup[]
  totalCost: number
}

type MappingWithStd = ChargeDescriptionMappingRow

function normStd(value: string | null | undefined): string {
  return normalizeMappingText(value).replace(/[^A-Z0-9]+/g, ' ').trim()
}

/** Map standardized_charge labels to AGENTS categories. */
function categoryFromStandardizedCharge(std: string): AgentsChargeCategory | null {
  const n = normStd(std)
  if (!n) return null
  if (/TRANSPORT|BASE CHARGE|BASE FREIGHT|FREIGHT CHARGE/.test(n)) return 'BASE_FREIGHT'
  if (/FUEL/.test(n)) return 'FUEL'
  if (/RESIDENTIAL/.test(n)) return 'RESIDENTIAL'
  if (/DELIVERY AREA|DAS|REMOTE/.test(n)) return 'DELIVERY_AREA'
  if (/PEAK|DEMAND/.test(n)) return 'PEAK'
  if (/ADDITIONAL HANDLING|ADD HANDLING/.test(n)) return 'ADD_HANDLING'
  if (/ADDRESS CORRECTION/.test(n)) return 'ADDRESS_CORRECTION'
  if (/LARGE PACKAGE|OVERSIZE|OVER SIZE/.test(n)) return 'LARGE_PACKAGE'
  if (/DECLARED VALUE/.test(n)) return 'DECLARED_VALUE'
  return null
}

function categoryFromTaxonomy(cat1: string, cat3: string): AgentsChargeCategory | null {
  const c1 = normalizeMappingText(cat1)
  const c3 = normalizeMappingText(cat3)
  if (c3 === 'FUEL SURCHARGE' || c1.includes('FUEL')) return 'FUEL'
  if (c3 === 'SURCHARGE' && /PEAK|DEMAND/.test(c1)) return 'PEAK'
  if (c1.includes('RESIDENTIAL')) return 'RESIDENTIAL'
  if (c1.includes('DELIVERY') || c3.includes('DELIVERY')) return 'DELIVERY_AREA'
  if (c1.includes('ADDRESS')) return 'ADDRESS_CORRECTION'
  if (c1.includes('HANDLING')) return 'ADD_HANDLING'
  if (c1.includes('LARGE') || c1.includes('OVERSIZE')) return 'LARGE_PACKAGE'
  if (c1.includes('DECLARED')) return 'DECLARED_VALUE'
  if (c1.includes('TRANSPORT') || c3.includes('TRANSPORT')) return 'BASE_FREIGHT'
  return null
}

/** Last-resort substring rules for unmapped rows (AGENTS Invoices.md). */
function categoryFromChargeDescription(desc: string): AgentsChargeCategory {
  const d = normalizeMappingText(desc)
  if (/TRANSPORTATION|BASE CHARGE/.test(d)) return 'BASE_FREIGHT'
  if (/FUEL/.test(d)) return 'FUEL'
  if (/RESIDENTIAL/.test(d)) return 'RESIDENTIAL'
  if (/DELIVERY AREA|DAS/.test(d)) return 'DELIVERY_AREA'
  if (/PEAK|DEMAND/.test(d)) return 'PEAK'
  if (/ADDITIONAL HANDLING|ADD HANDLING/.test(d)) return 'ADD_HANDLING'
  if (/ADDRESS CORRECTION/.test(d)) return 'ADDRESS_CORRECTION'
  if (/LARGE PACKAGE|OVERSIZE/.test(d)) return 'LARGE_PACKAGE'
  if (/DECLARED VALUE/.test(d)) return 'DECLARED_VALUE'
  return 'OTHER'
}

function buildStandardizedChargeLookup(
  rows: MappingWithStd[] | null | undefined
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const m of rows ?? []) {
    const descNorm = normalizeMappingText(m.charge_description)
    if (!descNorm) continue
    const rawCarrier = normalizeMappingText((m.carrier ?? '') || '')
    const carrier =
      rawCarrier === '' || rawCarrier === 'UPS'
        ? 'UPS'
        : rawCarrier.includes('FED')
          ? 'FEDEX'
          : rawCarrier.includes('WORLD') || rawCarrier === 'WWE'
            ? 'WWE'
            : rawCarrier
    const std = m.standardized_charge?.trim() || null
    out.set(`${carrier}\t${descNorm}`, std)
    if (carrier === 'UPS') out.set(descNorm, std)
  }
  return out
}

function lookupStandardizedCharge(
  stdLookup: Map<string, string | null>,
  carrier: string,
  chargeDescription: string
): string | null {
  const descNorm = normalizeMappingText(chargeDescription)
  if (!descNorm) return null
  const raw = normalizeMappingText(carrier)
  const c =
    raw === '' || raw === 'UPS'
      ? 'UPS'
      : raw.includes('FED')
        ? 'FEDEX'
        : raw.includes('WORLD') || raw === 'WWE'
          ? 'WWE'
          : raw
  return stdLookup.get(`${c}\t${descNorm}`) ?? (c !== 'UPS' ? stdLookup.get(`UPS\t${descNorm}`) : null) ?? stdLookup.get(descNorm) ?? null
}

export function resolveAgentsCategory(
  rec: InvoiceRecord,
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>,
  stdLookup: Map<string, string | null>,
  mappingRows?: MappingWithStd[] | null
): AgentsChargeCategory {
  const chargeDescription = (rec['Charge Description'] ?? '').trim()
  const carrier = rec['Carrier Name'] ?? ''
  const taxonomy = lookupChargeTaxonomyForRecord(mappingLookup, rec)

  const std =
    lookupStandardizedCharge(stdLookup, carrier, chargeDescription) ??
    (mappingRows
      ? mappingRows.find(
          (m) =>
            normalizeMappingText(m.charge_description) === normalizeMappingText(chargeDescription)
        )?.standardized_charge ?? null
      : null)

  if (std) {
    const fromStd = categoryFromStandardizedCharge(std)
    if (fromStd) return fromStd
  }

  if (taxonomy) {
    const fromTax = categoryFromTaxonomy(taxonomy.category_1, taxonomy.category_3)
    if (fromTax) return fromTax
  }

  if (!taxonomy && !std) {
    return categoryFromChargeDescription(chargeDescription)
  }

  return 'OTHER'
}

export function rollupByAgentsCategory(
  records: InvoiceRecord[],
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>,
  mappingRows: MappingWithStd[] | null | undefined
): SpecCategoriesSummary {
  const stdLookup = buildStandardizedChargeLookup(mappingRows)
  const totals = new Map<AgentsChargeCategory, { totalCost: number; lineCount: number }>()

  for (const cat of AGENTS_CHARGE_CATEGORIES) {
    totals.set(cat, { totalCost: 0, lineCount: 0 })
  }

  let grandTotal = 0
  for (const rec of records) {
    const net = toNumber(rec['Net Amount'])
    grandTotal += net
    const cat = resolveAgentsCategory(rec, mappingLookup, stdLookup, mappingRows)
    const bucket = totals.get(cat)!
    bucket.totalCost += net
    bucket.lineCount += 1
  }

  const categories: SpecCategoryRollup[] = AGENTS_CHARGE_CATEGORIES.map((category) => {
    const b = totals.get(category)!
    return {
      category,
      totalCost: b.totalCost,
      pctOfTotal: grandTotal > 0 ? b.totalCost / grandTotal : 0,
      lineCount: b.lineCount,
    }
  }).filter((c) => c.totalCost > 0 || c.lineCount > 0)

  return { categories, totalCost: grandTotal }
}
