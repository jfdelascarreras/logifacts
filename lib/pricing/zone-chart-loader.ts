import fs from 'node:fs'
import path from 'node:path'

import { resolveChartPrefix } from '@/lib/pricing/zone-chart-prefix'
import type { ZoneChart } from '@/lib/pricing/types'

import manifestJson from '@/lib/pricing/data/zone-charts/_manifest.json'

const AVAILABLE_PREFIXES = (manifestJson as { prefixes: number[] }).prefixes

const ZONE_CHART_DIR = path.join(process.cwd(), 'lib/pricing/data/zone-charts')

export function loadZoneChart(originZip: string): ZoneChart | null {
  const prefix = resolveChartPrefix(originZip, AVAILABLE_PREFIXES)
  if (!prefix) return null

  const filePath = path.join(ZONE_CHART_DIR, `${prefix}.json`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ZoneChart
  } catch {
    return null
  }
}

export function resolveZoneChartPrefix(originZip: string): string | null {
  return resolveChartPrefix(originZip, AVAILABLE_PREFIXES)
}
