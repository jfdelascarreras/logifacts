import type { SupabaseClient } from '@supabase/supabase-js'
import type { Carrier, InvoiceLine, MasterMappingRow } from '@/types/invoice'
import type { ParsedInvoiceLine } from './parsers/types'

/** Normalizes charge descriptions for master_mapping lookups (FedEx/WWE/UPS). */
export function normalizeChargeDescriptionForLookup(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function normalize(value: string | null | undefined): string {
  return normalizeChargeDescriptionForLookup(value)
}

/** Fetches master_mapping for the given carrier and builds a lookup keyed by normalized charge_description. */
async function loadMasterMapping(
  carrier: Carrier,
  supabase: SupabaseClient
): Promise<Map<string, MasterMappingRow>> {
  const { data, error } = await supabase
    .from('master_mapping')
    .select('*')
    .eq('carrier', carrier)

  if (error || !data) return new Map()

  const lookup = new Map<string, MasterMappingRow>()
  for (const row of data as MasterMappingRow[]) {
    lookup.set(normalize(row.charge_description), row)
  }
  return lookup
}

/**
 * Maps parsed invoice lines to the master_mapping taxonomy.
 * Unrecognized charge descriptions get mapped = false so they surface in the admin UI.
 */
export async function mapInvoiceLines(
  lines: ParsedInvoiceLine[],
  invoiceId: string,
  carrier: Carrier,
  supabase: SupabaseClient
): Promise<Omit<InvoiceLine, 'id'>[]> {
  const lookup = await loadMasterMapping(carrier, supabase)

  return lines.map((line) => {
    const key = normalize(line.charge_description)
    const mapping = lookup.get(key)

    return {
      invoice_id: invoiceId,
      carrier,
      charge_description: line.charge_description,
      standardized_charge: mapping?.standardized_charge ?? null,
      transportation_mode: mapping?.transportation_mode ?? null,
      category_1: mapping?.category_1 ?? null,
      category_2: mapping?.category_2 ?? null,
      category_3: mapping?.category_3 ?? null,
      category_4: mapping?.category_4 ?? null,
      category_5: mapping?.category_5 ?? null,
      charge_amount: line.charge_amount,
      shipment_date: line.shipment_date ?? null,
      zone: line.zone ?? null,
      destination_state: line.destination_state ?? null,
      service_level: line.service_level ?? null,
      reference_1: line.tracking_id ?? line.reference_1 ?? null,
      mapped: mapping !== undefined,
      charge_classification_code: line.charge_classification_code ?? null,
      charge_category_code: line.charge_category_code ?? null,
      package_quantity: line.package_quantity ?? null,
    }
  })
}
