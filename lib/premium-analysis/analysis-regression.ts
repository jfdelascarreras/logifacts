export type AnalysisRunSnapshot = {
  total_cost: number | null
  shipment_count: number | null
  line_count: number | null
  ingest_source: string | null
  created_at: string
}

export type RunRegression = {
  previousRunAt: string
  totalCostDeltaPct: number
  shipmentDeltaPct: number
  lineCountDeltaPct: number
  significantChange: boolean
  message: string | null
}

const DEFAULT_REGRESSION_THRESHOLD = 0.05

function deltaPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 1
  return (current - previous) / Math.abs(previous)
}

/** Compare current analyze metrics to the prior `analysis_runs` row. */
export function compareAnalysisRunRegression(
  current: {
    totalCost: number
    shipmentCount: number
    lineCount: number
  },
  previous: AnalysisRunSnapshot,
  thresholdPct = DEFAULT_REGRESSION_THRESHOLD
): RunRegression | null {
  const prevCost = Number(previous.total_cost ?? 0)
  const prevShipments = Number(previous.shipment_count ?? 0)
  const prevLines = Number(previous.line_count ?? 0)

  if (prevCost <= 0 && prevShipments <= 0 && prevLines <= 0) return null

  const totalCostDeltaPct = deltaPct(current.totalCost, prevCost)
  const shipmentDeltaPct = deltaPct(current.shipmentCount, prevShipments)
  const lineCountDeltaPct = deltaPct(current.lineCount, prevLines)

  const significantChange =
    Math.abs(totalCostDeltaPct) > thresholdPct ||
    Math.abs(shipmentDeltaPct) > thresholdPct

  let message: string | null = null
  if (significantChange) {
    const parts: string[] = []
    if (Math.abs(totalCostDeltaPct) > thresholdPct) {
      parts.push(`total spend ${(totalCostDeltaPct * 100).toFixed(1)}%`)
    }
    if (Math.abs(shipmentDeltaPct) > thresholdPct) {
      parts.push(`shipments ${(shipmentDeltaPct * 100).toFixed(1)}%`)
    }
    message = `Metrics shifted vs prior run (${parts.join(', ')}) — confirm uploads or mapping changes.`
  }

  return {
    previousRunAt: previous.created_at,
    totalCostDeltaPct,
    shipmentDeltaPct,
    lineCountDeltaPct,
    significantChange,
    message,
  }
}
