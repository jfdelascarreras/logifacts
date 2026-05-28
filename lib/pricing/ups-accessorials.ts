import type { AdditionalHandlingType, RemoteAreaType, UPSService } from './types'
import rawZipSurcharges from './data/zip-surcharges.json'

type Dims = { length: number; width: number; height: number }
type ZoneTier = { zoneMin: number; zoneMax: number; rate: number }
type ZipSurchargeKind = 'das_standard' | 'das_extended' | 'remote_alaska' | 'remote_hawaii' | 'remote_us48'

const ZIP_SURCHARGES = rawZipSurcharges as Record<string, ZipSurchargeKind>

// Zone base offsets per service. Air zones encode as (offset + base), e.g. NDA zone 2 → 102.
const ZONE_OFFSETS: Record<UPSService, number> = {
  ground:    0,
  nda:       100,
  nda_saver: 130,
  '2day':    200,
  '2day_am': 240,
  '3day':    300,
}

/**
 * Extracts the base zone (2–8) from a service-encoded zone code.
 * Territory zones (ground 44/45/46, air equivalents) fall outside 2–8 after
 * offset removal and are clamped to 8 (caught by the 7–99 tier in rate tables).
 */
export function baseZone(zone: number, service: UPSService): number {
  const base = zone - ZONE_OFFSETS[service]
  if (base < 2 || base > 8) return 8
  return base
}

/** Finds the rate for a given base zone from a zone-tiered rate array. */
export function tieredRate(tiers: ZoneTier[], bz: number): number {
  return tiers.find(t => bz >= t.zoneMin && bz <= t.zoneMax)?.rate ?? 0
}

/**
 * Returns true if the package qualifies for the Large Package Surcharge.
 * Trigger: longest side > 96 in OR (longest + girth) > 130 in.
 */
export function isLargePackage(dims: Dims): boolean {
  const [l, w, h] = [dims.length, dims.width, dims.height].sort((a, b) => b - a) as [number, number, number]
  return l > 96 || l + 2 * (w + h) > 130
}

/** Returns the remote area type for a ZIP, or null if not a remote area ZIP. */
export function remoteAreaType(destinationZip: string): RemoteAreaType | null {
  const kind = ZIP_SURCHARGES[destinationZip]
  if (kind === 'remote_alaska') return 'alaska'
  if (kind === 'remote_hawaii') return 'hawaii'
  if (kind === 'remote_us48') return 'us48'
  return null
}

/** Returns the DAS type for a ZIP, or null if not a DAS ZIP. */
export function dasType(destinationZip: string): 'standard' | 'extended' | null {
  const kind = ZIP_SURCHARGES[destinationZip]
  if (kind === 'das_standard') return 'standard'
  if (kind === 'das_extended') return 'extended'
  return null
}

/**
 * Calculates the declared value charge.
 * Formula: max(minimum, declaredValueDollars / 100 × ratePerHundred).
 */
export function declaredValueCharge(
  declaredValueDollars: number,
  ratePerHundred: number,
  minimum: number,
): number {
  if (declaredValueDollars <= 0) return 0
  return Math.max(minimum, (declaredValueDollars / 100) * ratePerHundred)
}

/**
 * Returns the highest-priority additional handling trigger, or null if none apply.
 * Priority: weight > dimensions > packaging (only the highest is charged).
 * Large package surcharge takes precedence — do not call this if isLargePackage is true.
 */
export function additionalHandlingTrigger(
  weightLbs: number,
  dims: Dims | undefined,
  nonStandardPackaging: boolean,
): AdditionalHandlingType | null {
  if (weightLbs > 70) return 'weight'
  if (dims) {
    const [longest, second] = [dims.length, dims.width, dims.height].sort((a, b) => b - a) as [number, number, number]
    if (longest > 48 || second > 30) return 'dimensions'
  }
  if (nonStandardPackaging) return 'packaging'
  return null
}
