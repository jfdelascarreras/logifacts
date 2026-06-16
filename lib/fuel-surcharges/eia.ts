export type EiaObservation = {
  period: string  // "2026-05-19"
  value: number   // USD per gallon
}

export type EiaFetchResult =
  | { ok: true; data: EiaObservation[] }
  | { ok: false; error: 'rate_limited' | 'api_error' | 'network_error'; message: string }

export async function fetchEiaDieselHistory(
  apiKey?: string
): Promise<EiaFetchResult> {
  // DEMO_KEY is rate-limited (HTTP 429) under any real load.
  // Get a free permanent key at https://www.eia.gov/opendata/register.php (takes 2 minutes).
  const key = apiKey ?? process.env.EIA_API_KEY?.trim() ?? 'DEMO_KEY'

  // EIA v2 — US national weekly retail on-highway No. 2 Diesel (NUS + EPD2D).
  // NUS = U.S. Total (national average); EPD2D = No. 2 Diesel.
  const url =
    `https://api.eia.gov/v2/petroleum/pri/gnd/data/` +
    `?api_key=${encodeURIComponent(key)}` +
    `&frequency=weekly` +
    `&data%5B0%5D=value` +
    `&facets%5Bduoarea%5D%5B%5D=NUS` +
    `&facets%5Bproduct%5D%5B%5D=EPD2D` +
    `&sort%5B0%5D%5Bcolumn%5D=period` +
    `&sort%5B0%5D%5Bdirection%5D=desc` +
    `&length=52`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })

    if (res.status === 429) {
      return {
        ok: false,
        error: 'rate_limited',
        message: 'EIA DEMO_KEY rate limit exceeded. Add a free EIA_API_KEY to your .env file at https://www.eia.gov/opendata/register.php',
      }
    }

    if (!res.ok) {
      return { ok: false, error: 'api_error', message: `EIA API returned ${res.status}` }
    }

    const json = await res.json() as {
      response?: { data?: Array<{ period: string; value: number | null }> }
    }

    const data = (json?.response?.data ?? [])
      .filter((d) => d.value != null)
      .map((d) => ({ period: d.period, value: Number(d.value) }))

    return { ok: true, data }
  } catch {
    return { ok: false, error: 'network_error', message: 'EIA fetch timed out or network error' }
  }
}

/** US Gulf Coast kerosene-type jet fuel spot — UPS domestic air index. Series EER_EPJK_PF4_RGC_DPG */
export async function fetchEiaJetFuelGulfCoastHistory(
  apiKey?: string
): Promise<EiaFetchResult> {
  const key = apiKey ?? process.env.EIA_API_KEY?.trim() ?? 'DEMO_KEY'

  const url =
    `https://api.eia.gov/v2/petroleum/pri/spt/data/` +
    `?api_key=${encodeURIComponent(key)}` +
    `&frequency=weekly` +
    `&data%5B0%5D=value` +
    `&facets%5Bduoarea%5D%5B%5D=RGC` +
    `&facets%5Bproduct%5D%5B%5D=EPJK` +
    `&sort%5B0%5D%5Bcolumn%5D=period` +
    `&sort%5B0%5D%5Bdirection%5D=desc` +
    `&length=52`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })

    if (res.status === 429) {
      return {
        ok: false,
        error: 'rate_limited',
        message: 'EIA rate limit exceeded. Set EIA_API_KEY in environment.',
      }
    }

    if (!res.ok) {
      return { ok: false, error: 'api_error', message: `EIA API returned ${res.status}` }
    }

    const json = await res.json() as {
      response?: { data?: Array<{ period: string; value: number | null }> }
    }

    const data = (json?.response?.data ?? [])
      .filter((d) => d.value != null)
      .map((d) => ({ period: d.period, value: Number(d.value) }))

    return { ok: true, data }
  } catch {
    return { ok: false, error: 'network_error', message: 'EIA jet fuel fetch timed out or network error' }
  }
}
