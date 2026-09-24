// Fetches data from the Eurostat dissemination API (JSON-stat 2.0). The API allows
// cross-origin requests, so this runs directly in the browser — no backend.
const API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'

export interface EurostatQuery {
  /** Dimension filters, e.g. { geo: ['EU27_2020', 'DE'], siec: 'TOTAL', unit: 'KTOE' }. */
  filters?: Record<string, string | string[]>
  /** Only the N most recent periods. */
  lastTimePeriod?: number
  sinceTimePeriod?: string
  untilTimePeriod?: string
  /** Label language: en, de or fr. */
  lang?: string
  signal?: AbortSignal
}

export interface Observation {
  /** Code per dimension, including the time dimension, e.g. { geo: 'DE', time: '2023', … }. */
  keys: Record<string, string>
  value: number | null
  /** Eurostat flag, e.g. "p" (provisional), "e" (estimated). */
  flag?: string
}

export interface EurostatResult {
  code: string
  label: string
  updated?: string
  source?: string
  /** Dimension ids in order (the time dimension is "time"). */
  dimensionIds: string[]
  /** Codes and labels per dimension, in the order Eurostat returned them. */
  dimensions: Record<string, { label: string; codes: { code: string; label: string }[] }>
  observations: Observation[]
  /** Set when Eurostat was unreachable and the data came from the browser cache (ISO date). */
  cachedAt?: string
}

/** Eurostat could not be reached (outage, maintenance, network) and nothing was cached. */
export class EurostatUnavailableError extends Error {
  constructor(code: string) {
    super(`Eurostat is temporarily unavailable (${code}).`)
    this.name = 'EurostatUnavailableError'
  }
}

// Successful responses are kept in Cache Storage and used when Eurostat is unreachable.
const CACHE_NAME = 'eurostat-data-v1'
const CACHED_AT = 'x-engenuidash-cached-at'

async function cacheResponse(url: string, text: string) {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(url, new Response(text, { headers: { 'content-type': 'application/json', [CACHED_AT]: new Date().toISOString() } }))
  } catch {
    // Cache Storage unavailable (private mode, quota): not fatal.
  }
}

async function cachedResponse(url: string): Promise<{ body: JsonStat; cachedAt: string } | null> {
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(url)
    if (!hit) return null
    return { body: (await hit.json()) as JsonStat, cachedAt: hit.headers.get(CACHED_AT) ?? '' }
  } catch {
    return null
  }
}

interface JsonStat {
  label: string
  updated?: string
  source?: string
  id: string[]
  size: number[]
  value: Record<string, number | null> | (number | null)[]
  status?: Record<string, string> | string[]
  dimension: Record<string, { label: string; category: { index: Record<string, number> | string[]; label?: Record<string, string> } }>
  error?: { status: number; label: string }[]
}

const cache = new Map<string, Promise<EurostatResult>>()

export function buildDataUrl(code: string, q: EurostatQuery = {}): string {
  const params = new URLSearchParams({ format: 'JSON', lang: (q.lang ?? 'en').toUpperCase() })
  for (const [dim, value] of Object.entries(q.filters ?? {})) {
    for (const v of Array.isArray(value) ? value : [value]) params.append(dim, v)
  }
  if (q.lastTimePeriod) params.set('lastTimePeriod', String(q.lastTimePeriod))
  if (q.sinceTimePeriod) params.set('sinceTimePeriod', q.sinceTimePeriod)
  if (q.untilTimePeriod) params.set('untilTimePeriod', q.untilTimePeriod)
  return `${API}/${encodeURIComponent(code)}?${params}`
}

/**
 * Fetches a filtered slice of a dataset. Always filter large datasets (e.g. nrg_bal_c has
 * 21M values): Eurostat rejects extractions that are too big.
 */
export function fetchEurostatData(code: string, q: EurostatQuery = {}): Promise<EurostatResult> {
  const url = buildDataUrl(code, q)
  let pending = cache.get(url)
  if (!pending) {
    pending = load(code, url, q.signal)
    cache.set(url, pending)
    pending.catch(() => cache.delete(url))
  }
  return pending
}

async function load(code: string, url: string, signal?: AbortSignal): Promise<EurostatResult> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    // Network failure. During EC outages the API redirects to sorry.ec.europa.eu, which the
    // browser reports as a failed (CORS) fetch. Fall back to the last cached copy.
    return fromCache(code, url)
  }
  // 5xx / maintenance pages: also an outage, not a problem with the query.
  if (res.status >= 500 || !(res.headers.get('content-type') ?? '').includes('json')) return fromCache(code, url)

  const text = await res.text()
  const body = (() => {
    try {
      return JSON.parse(text) as JsonStat
    } catch {
      return null
    }
  })()
  if (!res.ok || !body || body.error) {
    // A real query error (unknown code, extraction too large): report it, don't hide it behind the cache.
    const message = body?.error?.map((e) => e.label).join('; ') || `HTTP ${res.status}`
    throw new Error(`Eurostat ${code}: ${message}`)
  }
  void cacheResponse(url, text)
  return parseJsonStat(code, body)
}

async function fromCache(code: string, url: string): Promise<EurostatResult> {
  const hit = await cachedResponse(url)
  if (!hit) throw new EurostatUnavailableError(code)
  return { ...parseJsonStat(code, hit.body), cachedAt: hit.cachedAt }
}

function categoryCodes(index: Record<string, number> | string[]): string[] {
  if (Array.isArray(index)) return index
  return Object.entries(index)
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code)
}

export function parseJsonStat(code: string, js: JsonStat): EurostatResult {
  const ids = js.id
  const codes = ids.map((id) => categoryCodes(js.dimension[id].category.index))
  const strides = ids.map((_, i) => js.size.slice(i + 1).reduce((a, b) => a * b, 1))

  const dimensions: EurostatResult['dimensions'] = {}
  ids.forEach((id, i) => {
    const labels = js.dimension[id].category.label ?? {}
    dimensions[id] = {
      label: js.dimension[id].label,
      codes: codes[i].map((c) => ({ code: c, label: labels[c] ?? c })),
    }
  })

  const entries: [number, number | null][] = Array.isArray(js.value)
    ? js.value.map((v, i) => [i, v])
    : Object.entries(js.value).map(([i, v]) => [Number(i), v])
  const status = js.status ?? {}

  const observations: Observation[] = entries.map(([flat, value]) => {
    const keys: Record<string, string> = {}
    ids.forEach((id, i) => {
      keys[id] = codes[i][Math.floor(flat / strides[i]) % js.size[i]]
    })
    const flag = Array.isArray(status) ? status[flat] : status[String(flat)]
    return { keys, value, ...(flag ? { flag } : {}) }
  })

  return { code, label: js.label, updated: js.updated, source: js.source, dimensionIds: ids, dimensions, observations }
}

/**
 * Reshapes a result into chart input: one series per `seriesBy` code, values along `x`
 * (default: time). Missing values become null.
 */
export function toSeries(result: EurostatResult, { x = 'time', seriesBy }: { x?: string; seriesBy: string }) {
  const xCodes = result.dimensions[x]?.codes ?? []
  const seriesCodes = result.dimensions[seriesBy]?.codes ?? []
  const lookup = new Map<string, number | null>()
  for (const o of result.observations) lookup.set(`${o.keys[seriesBy]}|${o.keys[x]}`, o.value)

  return {
    categories: xCodes.map((c) => c.label),
    series: seriesCodes.map((s) => ({
      name: s.label,
      data: xCodes.map((c) => lookup.get(`${s.code}|${c.code}`) ?? null),
    })),
  }
}
