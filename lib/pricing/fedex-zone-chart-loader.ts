import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import { resolveChartPrefix } from '@/lib/pricing/zone-chart-prefix'
import type { FedExZoneChart } from '@/lib/pricing/fedex-types'

import manifestJson from '@/lib/pricing/data/fedex-zone-charts/_manifest.json'

const AVAILABLE_PREFIXES = (manifestJson as { prefixes: number[] }).prefixes

const ZONE_CHART_DIR = path.join(process.cwd(), 'lib/pricing/data/fedex-zone-charts')

const chartCache = new Map<string, FedExZoneChart>()
const MAX_CHART_CACHE = 64

function readChartFile(prefix: string): FedExZoneChart | null {
  const filePath = path.join(ZONE_CHART_DIR, `${prefix}.json`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FedExZoneChart
  } catch {
    return null
  }
}

export function loadFedExZoneChart(originZip: string): FedExZoneChart | null {
  const prefix = resolveChartPrefix(originZip, AVAILABLE_PREFIXES)
  if (!prefix) return null

  const cached = chartCache.get(prefix)
  if (cached) return cached

  const chart = readChartFile(prefix)
  if (!chart) return null

  if (chartCache.size >= MAX_CHART_CACHE) {
    const oldest = chartCache.keys().next().value
    if (oldest) chartCache.delete(oldest)
  }
  chartCache.set(prefix, chart)

  return chart
}

export function resolveFedExZoneChartPrefix(originZip: string): string | null {
  return resolveChartPrefix(originZip, AVAILABLE_PREFIXES)
}

export function clearFedExZoneChartCache(): void {
  chartCache.clear()
}
