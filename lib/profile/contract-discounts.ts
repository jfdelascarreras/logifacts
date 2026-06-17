import type { SupabaseClient, User } from '@supabase/supabase-js'

import type { ContractDiscounts } from '@/lib/pricing/types'

export type UserContractDiscountsRow = {
  user_id: string
  transportation: number | string | null
  fuel_surcharge: number | string | null
  residential: number | string | null
  das: number | string | null
  additional_handling: number | string | null
  large_package: number | string | null
  address_correction: number | string | null
  declared_value: number | string | null
  updated_at?: string
}

const ROW_TO_KEY: Record<keyof Omit<UserContractDiscountsRow, 'user_id' | 'updated_at'>, keyof ContractDiscounts> = {
  transportation: 'transportation',
  fuel_surcharge: 'fuelSurcharge',
  residential: 'residential',
  das: 'das',
  additional_handling: 'additionalHandling',
  large_package: 'largePackage',
  address_correction: 'addressCorrection',
  declared_value: 'declaredValue',
}

function parseDiscountValue(value: number | string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(n, 0.95)
}

export function mapRowToContractDiscounts(row: UserContractDiscountsRow): ContractDiscounts {
  const discounts: ContractDiscounts = {}
  for (const [column, key] of Object.entries(ROW_TO_KEY) as [keyof typeof ROW_TO_KEY, keyof ContractDiscounts][]) {
    const val = parseDiscountValue(row[column])
    if (val !== undefined) discounts[key] = val
  }
  return discounts
}

export function contractDiscountsToRow(
  userId: string,
  discounts: ContractDiscounts
): UserContractDiscountsRow {
  const row: UserContractDiscountsRow = {
    user_id: userId,
    transportation: null,
    fuel_surcharge: null,
    residential: null,
    das: null,
    additional_handling: null,
    large_package: null,
    address_correction: null,
    declared_value: null,
  }

  for (const [column, key] of Object.entries(ROW_TO_KEY) as [keyof typeof ROW_TO_KEY, keyof ContractDiscounts][]) {
    const val = parseDiscountValue(discounts[key])
    row[column] = val ?? null
  }

  return row
}

function legacyMetadataDiscounts(user: Pick<User, 'user_metadata'>): ContractDiscounts {
  return (user.user_metadata?.contract_discounts as ContractDiscounts | undefined) ?? {}
}

/** Loads profile contract discounts from Postgres; falls back to legacy auth metadata if no row exists. */
export async function loadUserContractDiscounts(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'user_metadata'>
): Promise<ContractDiscounts> {
  const { data, error } = await supabase
    .from('user_contract_discounts')
    .select(
      'user_id, transportation, fuel_surcharge, residential, das, additional_handling, large_package, address_correction, declared_value'
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (!error && data) {
    return mapRowToContractDiscounts(data as UserContractDiscountsRow)
  }

  return legacyMetadataDiscounts(user)
}
