import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import { resolveChartPrefix } from '@/lib/pricing/zone-chart-prefix'
import type { ZoneChart } from '@/lib/pricing/types'

import manifestJson from '@/lib/pricing/data/zone-charts/_manifest.json'

const AVAILABLE_PREFIXES = (manifestJson as { prefixes: number[] }).prefixes

const ZONE_CHART_DIR = path.join(process.cwd(), 'lib/pricing/data/zone-charts')

/** In-memory LRU cache — zone charts are static and keyed by origin prefix. */
const chartCache = new Map<string, ZoneChart>()
const MAX_CHART_CACHE = 64

function readChartFile(prefix: string): ZoneChart | null {
  const filePath = path.join(ZONE_CHART_DIR, `${prefix}.json`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ZoneChart
  } catch {
    return null
  }
}

export function loadZoneChart(originZip: string): ZoneChart | null {
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

export function resolveZoneChartPrefix(originZip: string): string | null {
  return resolveChartPrefix(originZip, AVAILABLE_PREFIXES)
}

/** Clears the in-memory chart cache (for tests). */
export function clearZoneChartCache(): void {
  chartCache.clear()
}
