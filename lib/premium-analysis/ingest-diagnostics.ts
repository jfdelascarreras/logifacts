import { primaryRollupDateRaw, toNumber, type InvoiceRecord } from '@/lib/invoices/csv'
import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'
import {
  buildChargeDescriptionLookup,
  lookupChargeTaxonomyForRecord,
  shipmentPackageDedupeKey,
} from '@/lib/premium-analysis/analysis-summary'

export type IngestDiagnosticsBase = Pick<
  PremiumParseIngestDiagnostics,
  'duplicateUploadRowsSkipped' | 'duplicateChargeRowsDropped' | 'rowsDroppedCriticalSciCorruption'
>

const ZERO_EXTENDED: Omit<PremiumParseIngestDiagnostics, keyof IngestDiagnosticsBase> = {
  linesTotal: 0,
  linesMapped: 0,
  unmappedSpend: 0,
  shipmentsTotal: 0,
  shipmentsWithoutTracking: 0,
  linesMissingShipDate: 0,
  parseVersions: [],
}

export function emptyIngestDiagnostics(): PremiumParseIngestDiagnostics {
  return {
    duplicateUploadRowsSkipped: 0,
    duplicateChargeRowsDropped: 0,
    rowsDroppedCriticalSciCorruption: 0,
    ...ZERO_EXTENDED,
  }
}

function lineIsMapped(
  rec: InvoiceRecord,
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>
): boolean {
  const taxonomy = lookupChargeTaxonomyForRecord(mappingLookup, rec)
  return Boolean(taxonomy?.category_1 || taxonomy?.category_3)
}

function shipDatePresent(rec: InvoiceRecord): boolean {
  const raw = primaryRollupDateRaw(rec)
  return Boolean(raw && raw.trim() && !/^invoice\b/i.test(raw))
}

/**
 * Enrich base ingest counters with mapping, tracking, and spend coverage metrics.
 * Call on the full unfiltered record set after carrier adapters merge.
 */
export function buildIngestDiagnostics(
  records: InvoiceRecord[],
  base: IngestDiagnosticsBase,
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>,
  parseVersions: string[] = []
): PremiumParseIngestDiagnostics {
  let linesMapped = 0
  let unmappedSpend = 0
  let linesMissingShipDate = 0

  const shipmentKeys = new Set<string>()
  const shipmentsWithoutTracking = new Set<string>()

  for (const rec of records) {
    const net = toNumber(rec['Net Amount'])
    if (lineIsMapped(rec, mappingLookup)) {
      linesMapped += 1
    } else if (net !== 0) {
      unmappedSpend += net
    }

    if (!shipDatePresent(rec)) linesMissingShipDate += 1

    const shipKey = shipmentPackageDedupeKey(rec)
    if (!shipKey) continue
    shipmentKeys.add(shipKey)
    const tracking = (rec['Tracking Number'] ?? rec['Shipment Reference Number 1'] ?? '').trim()
    if (!tracking) shipmentsWithoutTracking.add(shipKey)
  }

  const versions = [...new Set(parseVersions.map((v) => v.trim()).filter(Boolean))].sort()

  return {
    ...base,
    linesTotal: records.length,
    linesMapped,
    unmappedSpend: +unmappedSpend.toFixed(2),
    shipmentsTotal: shipmentKeys.size,
    shipmentsWithoutTracking: shipmentsWithoutTracking.size,
    linesMissingShipDate,
    parseVersions: versions,
  }
}

export function mergeParseVersions(parts: Array<string | undefined | null>): string[] {
  return [...new Set(parts.map((v) => String(v ?? '').trim()).filter(Boolean))]
}
