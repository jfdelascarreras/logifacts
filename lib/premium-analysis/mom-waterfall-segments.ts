/**
 * Month-over-month waterfall buckets — mutually exclusive partition of spend.
 *
 * Fuel is a subset of `costSurcharges` (see AGENTS Invoices.md). The waterfall must
 * not add Fuel and full Surcharges as separate steps (that double-counts fuel).
 */

export type MonthCostBucket = {
  totalCost: number
  costFuel?: number
  costAccessorials?: number
  costSurcharges?: number
}

export type WaterfallSegment = {
  label: string
  delta: number
  base: number
  current: number
  previous: number
}

/** Non-fuel surcharge spend (peak, accessorial surcharge at cat_3, etc.). */
export function nonFuelSurchargeCost(bucket: MonthCostBucket): number {
  const fuel = bucket.costFuel ?? 0
  const surcharges = bucket.costSurcharges ?? 0
  return Math.max(0, surcharges - fuel)
}

/** Base freight residual: total minus surcharge family and accessorials. */
export function baseFreightCost(bucket: MonthCostBucket): number {
  return bucket.totalCost - (bucket.costSurcharges ?? 0) - (bucket.costAccessorials ?? 0)
}

/**
 * Builds four additive MoM segments that sum to totalCost delta.
 * Fuel is shown separately for visibility; "Other surcharges" excludes fuel.
 */
export function buildMomWaterfallSegments(
  current: MonthCostBucket,
  previous: MonthCostBucket
): WaterfallSegment[] {
  const fuelC = current.costFuel ?? 0
  const fuelP = previous.costFuel ?? 0
  const otherSurC = nonFuelSurchargeCost(current)
  const otherSurP = nonFuelSurchargeCost(previous)
  const bfC = baseFreightCost(current)
  const bfP = baseFreightCost(previous)
  const accC = current.costAccessorials ?? 0
  const accP = previous.costAccessorials ?? 0

  return [
    { label: 'Base Freight', delta: bfC - bfP, base: bfP, current: bfC, previous: bfP },
    { label: 'Fuel', delta: fuelC - fuelP, base: fuelP, current: fuelC, previous: fuelP },
    {
      label: 'Other surcharges',
      delta: otherSurC - otherSurP,
      base: otherSurP,
      current: otherSurC,
      previous: otherSurP,
    },
    { label: 'Accessorials', delta: accC - accP, base: accP, current: accC, previous: accP },
  ]
}

/** Sanity check: partition sums to total for one month. */
export function partitionMatchesTotal(bucket: MonthCostBucket, tolerance = 0.01): boolean {
  const sum =
    baseFreightCost(bucket) +
    (bucket.costFuel ?? 0) +
    nonFuelSurchargeCost(bucket) +
    (bucket.costAccessorials ?? 0)
  return Math.abs(sum - bucket.totalCost) <= tolerance
}
