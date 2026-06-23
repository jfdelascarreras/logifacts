// Effective dates match the source PDFs/XLS files in lib/pricing/data/sources/.
// Update these constants whenever rate files are regenerated from new carrier publications.
export const RATES_VERSION = {
  ups:   { carrier: 'UPS',   effectiveDate: '2025-12-22' },
  fedex: { carrier: 'FedEx', effectiveDate: '2026-01-05' },
} as const
