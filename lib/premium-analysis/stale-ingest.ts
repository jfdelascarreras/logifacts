import {
  FEDEX_PARSE_VERSION,
  UPS_PARSE_VERSION,
  WWE_PARSE_VERSION,
} from '@/lib/invoices/charge-line-contract'

export type StaleIngestAlert = {
  needsReupload: boolean
  reasons: string[]
}

const CARRIER_PARSE_EXPECTATIONS: Array<{ carrier: string; version: string }> = [
  { carrier: 'FedEx', version: FEDEX_PARSE_VERSION },
  { carrier: 'WWE', version: WWE_PARSE_VERSION },
  { carrier: 'UPS', version: UPS_PARSE_VERSION },
]

/** Flag when stored facts lack current parser versions for carriers in the dataset. */
export function detectStaleIngest(
  parseVersions: string[],
  carriersPresent: string[]
): StaleIngestAlert {
  const reasons: string[] = []
  const versions = new Set(parseVersions.map((v) => v.trim()).filter(Boolean))
  const carriers = new Set(carriersPresent.map((c) => c.trim()).filter(Boolean))

  for (const { carrier, version } of CARRIER_PARSE_EXPECTATIONS) {
    const present = [...carriers].some((c) => c.toLowerCase().includes(carrier.toLowerCase()))
    if (!present) continue
    if (!versions.has(version)) {
      reasons.push(
        `${carrier} data may be from an older parser — re-upload invoices to refresh weights, tracking, and taxonomy (expected ${version}).`
      )
    }
  }

  if (carriers.size > 0 && versions.size === 0) {
    reasons.push(
      'No parser version recorded on stored facts — re-upload invoices to pick up the latest ingest pipeline.'
    )
  }

  return {
    needsReupload: reasons.length > 0,
    reasons: [...new Set(reasons)],
  }
}
