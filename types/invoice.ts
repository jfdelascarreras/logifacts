export type Carrier = 'UPS' | 'FedEx' | 'WWE'

export type UploadStatus = 'pending' | 'processed' | 'error'

export interface MasterMappingRow {
  id: string
  charge_description: string
  transportation_mode: string | null
  category_1: string | null
  category_2: string | null
  category_3: string | null
  category_4: string | null
  category_5: string | null
  carrier: Carrier
  standardized_charge: string | null
}

export interface Invoice {
  id: string
  user_id: string
  carrier: Carrier
  invoice_number: string | null
  invoice_date: string | null
  filename: string
  upload_status: UploadStatus
  total_amount: number | null
  created_at: string
}

export interface InvoiceLine {
  id: string
  invoice_id: string
  carrier: Carrier
  charge_description: string
  standardized_charge: string | null
  transportation_mode: string | null
  category_1: string | null
  category_2: string | null
  category_3: string | null
  category_4: string | null
  category_5: string | null
  charge_amount: number
  shipment_date: string | null
  zone: string | null
  destination_state: string | null
  service_level: string | null
  reference_1: string | null
  mapped: boolean
  // KPI classification fields (mirrors Python dashboard script)
  charge_classification_code: string | null  // "FRT" | "ACC" etc.
  charge_category_code: string | null        // "INF" | "ICC" etc.
  package_quantity: number | null            // for Total Volume KPI
}

export interface AnalysisFilters {
  carrier?: Carrier[]
  standardized_charge?: string[]
  category_1?: string[]
  category_2?: string[]
  shipment_date_range?: [string | null, string | null]
  zone?: string[]
  destination_state?: string[]
  mapped?: boolean
}
