/**
 * Resolves which origin 3-digit prefix chart to use for a given origin ZIP.
 * Prefers an exact chart match; falls back to the largest available prefix ≤ origin.
 */
export function originZipToPrefix(originZip: string): number {
  return parseInt(originZip.replace(/\D/g, '').substring(0, 3), 10)
}

export function resolveChartPrefix(
  originZip: string,
  availablePrefixes: readonly number[]
): string | null {
  if (availablePrefixes.length === 0) return null

  const originPrefix = originZipToPrefix(originZip)
  if (Number.isNaN(originPrefix)) return null

  if (availablePrefixes.includes(originPrefix)) {
    return String(originPrefix).padStart(3, '0')
  }

  let best: number | null = null
  for (const prefix of availablePrefixes) {
    if (prefix <= originPrefix) best = prefix
    else break
  }

  return best === null ? null : String(best).padStart(3, '0')
}
