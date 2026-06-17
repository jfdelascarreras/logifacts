import { describe, expect, it } from 'vitest'

import {
  contractDiscountsToRow,
  mapRowToContractDiscounts,
} from '@/lib/profile/contract-discounts'

describe('contract discount row mapping', () => {
  it('maps DB row snake_case to ContractDiscounts camelCase', () => {
    expect(
      mapRowToContractDiscounts({
        user_id: 'u1',
        transportation: '0.56',
        fuel_surcharge: 0.3,
        residential: null,
        das: '0.5',
        additional_handling: null,
        large_package: null,
        address_correction: null,
        declared_value: null,
      })
    ).toEqual({
      transportation: 0.56,
      fuelSurcharge: 0.3,
      das: 0.5,
    })
  })

  it('clamps values above 0.95 when reading', () => {
    expect(
      mapRowToContractDiscounts({
        user_id: 'u1',
        transportation: 1.2,
        fuel_surcharge: null,
        residential: null,
        das: null,
        additional_handling: null,
        large_package: null,
        address_correction: null,
        declared_value: null,
      })
    ).toEqual({ transportation: 0.95 })
  })

  it('writes null for unset fields on upsert row', () => {
    expect(
      contractDiscountsToRow('u1', { transportation: 0.4, fuelSurcharge: 0.25 })
    ).toEqual({
      user_id: 'u1',
      transportation: 0.4,
      fuel_surcharge: 0.25,
      residential: null,
      das: null,
      additional_handling: null,
      large_package: null,
      address_correction: null,
      declared_value: null,
    })
  })
})
