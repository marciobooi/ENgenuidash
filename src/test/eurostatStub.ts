import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'

/**
 * A stand-in for the Eurostat data API in tests: answers every data request with synthetic
 * JSON-stat for exactly the codes asked for (all of a dimension's codes when it is not filtered),
 * over the dataset's periods from the dictionary, with code labels from the codelists. Values are
 * deterministic (a hash of the keys), shaped by the unit: percentages 5–100, prices 0.05–0.45,
 * quantities 100–50 000, with a gentle trend over time.
 *
 * `empty` makes selected requests return no values (to test fallbacks).
 */
export interface StubOptions {
  empty?: (dataset: string, params: URLSearchParams) => boolean
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) / 4294967296

function periodsOf(freq: string, start: string, end: string): string[] {
  const y1 = Number(start.slice(0, 4)) || 2000
  const y2 = Number(end.slice(0, 4)) || 2024
  const out: string[] = []
  for (let y = y1; y <= y2; y++) {
    if (freq === 'M') for (let m = 1; m <= 12; m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
    else if (freq === 'S') out.push(`${y}-S1`, `${y}-S2`)
    else if (freq === 'Q') for (let q = 1; q <= 4; q++) out.push(`${y}-Q${q}`)
    else out.push(String(y))
  }
  // Monthly data end at the dictionary's last month.
  return freq === 'M' && end.length >= 7 ? out.filter((p) => p <= end.slice(0, 7)) : out
}

export function installEurostatStub(dict: EnergyDictionary, codelists: EnergyCodelists, opts: StubOptions = {}): () => void {
  const real = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const match = url.pathname.match(/\/data\/([^/?]+)$/)
    const ds = match ? dict.datasets[decodeURIComponent(match[1])] : undefined
    if (!ds) return new Response(JSON.stringify({ error: [{ status: 404, label: 'unknown dataset' }] }), { status: 404, headers: { 'content-type': 'application/json' } })
    requests.push(url.search)
    const p = url.searchParams
    const freq = p.get('freq') ?? ds.defaults.freq ?? 'A'
    let periods = periodsOf(freq, String(ds.dataStart ?? '2000'), String(ds.dataEnd ?? '2024'))
    const since = p.get('sinceTimePeriod')
    const until = p.get('untilTimePeriod')
    if (since) periods = periods.filter((t) => t >= since)
    if (until) periods = periods.filter((t) => t.slice(0, until.length) <= until)
    const last = Number(p.get('lastTimePeriod'))
    if (last) periods = periods.slice(-last)

    const dims = ds.dimensions.map((d) => d.id).filter((id) => id !== 'time')
    const codes: Record<string, string[]> = {}
    for (const id of dims) {
      const asked = p.getAll(id)
      const all = ds.dimensions.find((d) => d.id === id)?.codes ?? []
      codes[id] = asked.length ? asked.filter((c) => all.includes(c) || id === 'freq') : all
    }
    codes.time = periods
    const ids = [...dims, 'time']
    const size = ids.map((id) => codes[id].length)
    const unit = codes.unit?.[0] ?? ''
    const empty = opts.empty?.(ds.code, p) ?? false
    const value: Record<string, number> = {}
    if (!empty) {
      const total = size.reduce((a, b) => a * b, 1)
      for (let i = 0; i < total; i++) {
        let rest = i
        const keys = ids.map((id, k) => {
          const n = size.slice(k + 1).reduce((a, b) => a * b, 1)
          const code = codes[id][Math.floor(rest / n)]
          rest %= n
          return code
        })
        // (Price components share one base, so their shares below hold.)
        const series = hash(`${ds.code}|${keys.slice(0, -1).filter((_, k) => ids[k] !== 'nrg_prc').join('|')}`)
        const t = periods.indexOf(keys.at(-1)!) / Math.max(1, periods.length - 1)
        const base = unit === 'PC' ? 5 + 95 * series : ds.code.startsWith('nrg_pc') && !ds.code.endsWith('_v') ? 0.05 + 0.4 * series : 100 + 50000 * series
        // Price components keep Eurostat's relation: "taxes, fees, levies" includes VAT.
        const component = keys[ids.indexOf('nrg_prc')]
        const share = component === 'VAT' ? 0.3 : component === 'TAX_FEE_LEV_CHRG' ? 0.9 : component?.endsWith('_ALLOW') ? 0 : 1
        value[i] = Math.round(base * share * (0.85 + 0.3 * t + 0.05 * Math.sin(i)) * 1000) / 1000
      }
    }
    const label = (id: string, code: string) => {
      const codelist = ds.dimensions.find((d) => d.id === id)?.codelist
      return (codelist && codelists.codelists[codelist]?.codes[code]?.en) || code
    }
    const body = {
      version: '2.0',
      class: 'dataset',
      label: ds.title.en,
      id: ids,
      size,
      value,
      dimension: Object.fromEntries(
        ids.map((id) => [id, { label: id, category: { index: Object.fromEntries(codes[id].map((c, k) => [c, k])), label: Object.fromEntries(codes[id].map((c) => [c, id === 'time' ? c : label(id, c)])) } }]),
      ),
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const restore = () => {
    globalThis.fetch = real
  }
  return Object.assign(restore, { requests })
}
