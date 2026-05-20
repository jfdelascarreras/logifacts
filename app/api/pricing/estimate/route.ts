import fs from 'node:fs'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { estimateUPS } from '@/lib/pricing/ups-estimate'
import type { UPSService, ZoneChart } from '@/lib/pricing/types'

const VALID_SERVICES: UPSService[] = ['ground', '3day', '2day', 'nda_saver', 'nda']

// Sorted list of origin prefixes we have zone charts for
const AVAILABLE_PREFIXES = [5, 20, 100, 200, 300, 400, 500, 601, 700, 750, 800, 850, 900, 941, 980]

function resolveChartPrefix(originZip: string): string {
  const n = parseInt(originZip.replace(/\D/g, '').substring(0, 3), 10)
  let best = AVAILABLE_PREFIXES[0]!
  for (const p of AVAILABLE_PREFIXES) {
    if (p <= n) best = p
  }
  return String(best).padStart(3, '0')
}

function loadZoneChart(originZip: string): ZoneChart | null {
  const prefix = resolveChartPrefix(originZip)
  const filePath = path.join(process.cwd(), 'lib/pricing/data/zone-charts', `${prefix}.json`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ZoneChart
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    weightLbs,
    dimensionsIn,
    originZip: bodyOriginZip,
    destinationZip,
    service,
    residential,
  } = body as Record<string, unknown>

  if (typeof weightLbs !== 'number' || weightLbs <= 0) {
    return NextResponse.json({ error: 'Invalid weight.' }, { status: 422 })
  }
  if (typeof destinationZip !== 'string' || !/^\d{5}$/.test(destinationZip)) {
    return NextResponse.json({ error: 'Destination ZIP must be exactly 5 digits.' }, { status: 422 })
  }
  if (typeof service !== 'string' || !VALID_SERVICES.includes(service as UPSService)) {
    return NextResponse.json({ error: 'Invalid service.' }, { status: 422 })
  }

  let parsedDims: { length: number; width: number; height: number } | undefined
  if (dimensionsIn != null) {
    const d = dimensionsIn as Record<string, unknown>
    if (
      typeof d.length !== 'number' || d.length <= 0 ||
      typeof d.width !== 'number' || d.width <= 0 ||
      typeof d.height !== 'number' || d.height <= 0
    ) {
      return NextResponse.json({ error: 'Invalid dimensions — all values must be positive numbers.' }, { status: 422 })
    }
    parsedDims = { length: d.length, width: d.width, height: d.height }
  }

  // Origin ZIP: body overrides profile (allows per-query override)
  const profileOriginZip = String(user.user_metadata?.origin_zip ?? '')
  const originZip = (typeof bodyOriginZip === 'string' && /^\d{5}$/.test(bodyOriginZip))
    ? bodyOriginZip
    : profileOriginZip

  if (!/^\d{5}$/.test(originZip)) {
    return NextResponse.json(
      { error: 'Origin ZIP not set. Please add your shipping origin ZIP in My Profile.' },
      { status: 422 }
    )
  }

  const zoneChart = loadZoneChart(originZip)
  if (!zoneChart) {
    return NextResponse.json({ error: 'Zone chart unavailable for this origin ZIP.' }, { status: 422 })
  }

  const result = estimateUPS({
    weightLbs,
    dimensionsIn: parsedDims,
    destinationZip,
    service: service as UPSService,
    residential: Boolean(residential),
    zoneChart,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json({ breakdown: result.breakdown })
}
