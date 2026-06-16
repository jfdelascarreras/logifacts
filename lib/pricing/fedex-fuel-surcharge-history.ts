import fs from 'node:fs'
import path from 'node:path'

export type FedExFuelRateObservation = {
  effectiveDate: string
  ground: number
  express: number
}

export function loadFedExFuelSurchargeHistory(): FedExFuelRateObservation[] {
  const filePath = path.join(
    process.cwd(),
    'lib/pricing/data/fedex-fuel-surcharge-history.json'
  )
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FedExFuelRateObservation[]
  } catch {
    return []
  }
}
