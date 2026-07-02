import type { UPSService, FedExService } from '@/lib/pricing'

const MOCK_RATE = 9.99

export function mockCalcUPS(service: UPSService) {
  return {
    service,
    base_rate: MOCK_RATE,
    fuel_surcharge: 0,
    residential_fee: 0,
    other_fees: 0,
    final_rate: MOCK_RATE,
    currency: 'USD',
    _sandbox: true,
  }
}

export function mockCalcFedEx(service: FedExService) {
  return {
    service,
    base_rate: MOCK_RATE,
    fuel_surcharge: 0,
    residential_fee: 0,
    other_fees: 0,
    final_rate: MOCK_RATE,
    currency: 'USD',
    _sandbox: true,
  }
}
