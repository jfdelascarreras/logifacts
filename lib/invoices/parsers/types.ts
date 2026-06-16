export interface ParsedInvoiceLine {
  charge_description: string
  charge_amount: number
  invoice_number?: string
  invoice_date?: string
  shipment_date?: string
  transaction_date?: string
  zone?: string
  destination_state?: string
  service_level?: string
  reference_1?: string
  /** FedEx Express or Ground Tracking ID; WWE Airbill # when package-level. */
  tracking_id?: string
  account_number?: string
  billed_weight?: number
  entered_weight?: number
  // Dashboard KPI fields (mirrors Python dashboard script)
  charge_classification_code?: string   // e.g. "FRT" | "ACC" — needed for Accessorials KPI
  charge_category_code?: string         // e.g. "INF" | "ICC" — excluded from Accessorials
  package_quantity?: number             // for Total Volume (sum, not row count)
  parse_version?: string
}
