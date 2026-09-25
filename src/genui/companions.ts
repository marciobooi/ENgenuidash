import { fetchEurostatData, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Plan, WidgetSpec } from './types'

/**
 * Related data shown next to the main dashboard, from the same or another dataset, when it
 * answers the natural next question:
 *
 *   oil consumption in Spain            → which sectors use it (industry, transport, households…)
 *   import dependency of a country      → dependency by fuel, and where its natural gas comes from
 *   renewable share of a country        → the share in electricity, heating & cooling, transport
 *   household or industry prices        → what the price is made of (energy, network, taxes, VAT)
 *
 * Each companion is one request and one chart; one that fails or has no data is left out.
 */

export interface CompanionStrings {
  bySector: string
  byFuel: string
  gasOrigins: string
  renBySector: string
  priceParts: string
  /** Taxes, fees, levies and charges other than VAT. */
  otherTaxes: string
}

export interface Companion {
  dataset: string
  filters: Record<string, string | string[]>
  /** The dimension whose codes are the slices or bars. */
  dim: string
  /** Codes to show; all two-letter partner countries when 'partners'. */
  codes: string[] | 'partners'
  title: string
  view: 'pie' | 'bar'
  /** Price components: taxes other than VAT are derived (see PRICE_PARTS). */
  priceSplit?: { otherTaxes: string }
  unit?: string
  top?: number
}

const SECTORS = ['FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'FC_NE']
const FUELS = ['C0000X0350-0370', 'O4000XBIO', 'G3000']
const REN_SECTORS = ['REN_ELC', 'REN_HEAT_CL', 'REN_TRA']
// "Taxes, fees, levies and charges" includes VAT (and allowances reduce it): the price is
// energy and supply + network costs + (taxes − VAT − allowances) + VAT.
const PRICE_PARTS = ['NRG_SUP', 'NETC', 'TAX_FEE_LEV_CHRG', 'VAT', 'TAX_FEE_LEV_CHRG_ALLOW']
const PRICE_COMPONENTS: Record<string, string> = { nrg_pc_204: 'nrg_pc_204_c', nrg_pc_205: 'nrg_pc_205_c', nrg_pc_202: 'nrg_pc_202_c', nrg_pc_203: 'nrg_pc_203_c' }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? undefined : v)

export function companionsFor(plan: Plan, dict: EnergyDictionary, s: CompanionStrings): Companion[] {
  const f = plan.filters
  const geo = one(f.geo)
  if (!geo) return [] // companions describe one country (or the EU)
  const has = (dataset: string, dim: string, code: string) => dict.datasets[dataset]?.dimensions.find((d) => d.id === dim)?.codes.includes(code) ?? false
  const out: Companion[] = []

  // A product's consumption or supply in the balances → use by sector.
  if (plan.dataset === 'nrg_bal_c' && one(f.siec) && ['FC_E', 'GIC', 'GAE'].includes(one(f.nrg_bal) ?? '')) {
    out.push({ dataset: 'nrg_bal_c', filters: { siec: f.siec as string, unit: f.unit as string, geo }, dim: 'nrg_bal', codes: SECTORS, title: s.bySector, view: 'pie' })
  }
  // Import dependency → by fuel, and the origins of natural gas imports.
  if (plan.dataset === 'nrg_ind_id' && one(f.siec) === 'TOTAL') {
    out.push({ dataset: 'nrg_ind_id', filters: { unit: 'PC', geo }, dim: 'siec', codes: FUELS, title: s.byFuel, view: 'bar', unit: '%' })
    if (has('nrg_ti_gas', 'geo', geo)) {
      out.push({ dataset: 'nrg_ti_gas', filters: { siec: 'G3000', unit: 'MIO_M3', geo }, dim: 'partner', codes: 'partners', title: s.gasOrigins, view: 'pie', unit: 'million m³', top: 6 })
    }
  }
  // Overall renewable share → the three sector shares.
  if (plan.dataset === 'nrg_ind_ren' && one(f.nrg_bal) === 'REN') {
    out.push({ dataset: 'nrg_ind_ren', filters: { unit: 'PC', geo }, dim: 'nrg_bal', codes: REN_SECTORS, title: s.renBySector, view: 'bar', unit: '%' })
  }
  // Prices → their components (annual data, same consumption band and currency).
  const parts = PRICE_COMPONENTS[plan.dataset]
  if (parts && dict.datasets[parts]) {
    const ds = dict.datasets[parts]
    const band = one(f.nrg_cons)
    const filters: Record<string, string> = { geo, currency: one(f.currency) ?? 'EUR' }
    filters.nrg_cons = band && has(parts, 'nrg_cons', band) ? band : (ds.defaults.nrg_cons ?? '')
    if (ds.dimensions.some((d) => d.id === 'unit')) filters.unit = ds.defaults.unit ?? 'KWH'
    out.push({ dataset: parts, filters, dim: 'nrg_prc', codes: PRICE_PARTS, title: s.priceParts, view: 'pie', priceSplit: { otherTaxes: s.otherTaxes } })
  }
  return out
}

/** Short names: "Final consumption - industry sector - energy use" → "industry sector". */
function shortLabel(label: string): string {
  const parts = label.split(/\s+-\s+/)
  const core = parts.length > 2 ? parts.slice(1, -1) : parts.length === 2 ? parts.slice(1) : parts
  const text = core.filter((p) => !/^(other sectors|sonstige sektoren|autres secteurs)$/i.test(p)).join(' – ') || label
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Fetches the companions (in parallel) and builds their charts, for the year the dashboard shows
 * (`year`) or the latest year with data.
 */
export async function buildCompanions(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: CompanionStrings,
  year: string | undefined,
  format: (v: number) => string,
  signal?: AbortSignal,
): Promise<WidgetSpec[]> {
  const list = companionsFor(plan, dict, s)
  const results = await Promise.allSettled(
    list.map((c) =>
      fetchEurostatData(c.dataset, {
        filters: { ...c.filters, ...(Array.isArray(c.codes) ? { [c.dim]: c.codes } : {}) },
        ...(year ? { sinceTimePeriod: year, untilTimePeriod: year } : { lastTimePeriod: 3 }),
        lang,
        signal,
      }),
    ),
  )
  const widgets: WidgetSpec[] = []
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const w = toWidget(list[i], r.value, lang, format)
    if (w) widgets.push(w)
  })
  return widgets
}

export function toWidget(c: Companion, result: EurostatResult, lang: string, format: (v: number) => string): WidgetSpec | null {
  const codes = result.dimensions[c.dim]?.codes ?? []
  const times = result.dimensions.time?.codes ?? []
  const value = (code: string, time: string) => result.observations.find((o) => o.keys[c.dim] === code && o.keys.time === time)?.value ?? null
  // The latest period where most codes have a value.
  const time = [...times].reverse().find((t) => codes.filter((k) => value(k.code, t.code) != null).length >= Math.max(2, Math.ceil(codes.length / 2)))
  if (!time) return null
  if (c.priceSplit) {
    const v = (code: string) => value(code, time.code) ?? 0
    const labelOf = (code: string) => shortLabel(codes.find((k) => k.code === code)?.label ?? code)
    const other = v('TAX_FEE_LEV_CHRG') - v('VAT') - v('TAX_FEE_LEV_CHRG_ALLOW')
    const rows = [
      { name: labelOf('NRG_SUP'), y: v('NRG_SUP') },
      { name: labelOf('NETC'), y: v('NETC') },
      { name: c.priceSplit.otherTaxes, y: Math.round(other * 10000) / 10000 },
      { name: labelOf('VAT'), y: v('VAT') },
    ].filter((x) => x.y > 0)
    if (rows.length < 2) return null
    const total = rows.reduce((n, x) => n + x.y, 0)
    return { type: 'pie', title: c.title.replace('{period}', time.label), slices: rows, centerLabel: format(total), size: 'half', source: sourceOf(c, lang) }
  }
  let rows = codes
    .filter((k) => (c.codes === 'partners' ? /^[A-Z]{2}$/.test(k.code) && k.code !== 'EU' : true))
    .map((k) => ({ name: c.dim === 'nrg_bal' || c.dim === 'nrg_prc' ? shortLabel(k.label) : k.label.replace(/\s*\(.*?\)\s*$/, ''), y: value(k.code, time.code) }))
    .filter((x): x is { name: string; y: number } => x.y != null && x.y > 0)
    .sort((a, b) => b.y - a.y)
  if (c.top && rows.length > c.top) {
    const rest = rows.slice(c.top - 1).reduce((n, x) => n + x.y, 0)
    rows = [...rows.slice(0, c.top - 1), { name: lang === 'de' ? 'Andere' : lang === 'fr' ? 'Autres' : 'Others', y: rest }]
  }
  if (rows.length < 2) return null
  const title = c.title.replace('{period}', time.label)
  const source = sourceOf(c, lang)
  if (c.view === 'pie') {
    const total = rows.reduce((n, x) => n + x.y, 0)
    return { type: 'pie', title, slices: rows, centerLabel: format(total), size: 'half', source, ...(c.unit ? { unit: c.unit } : {}) }
  }
  return {
    type: 'bar',
    title,
    categories: rows.map((x) => x.name),
    series: [{ name: title, data: rows.map((x) => x.y) }],
    horizontal: true,
    size: 'half',
    source,
    ...(c.unit ? { unit: c.unit } : {}),
  }
}

const sourceOf = (c: Companion, lang: string) => ({ code: c.dataset, url: `https://ec.europa.eu/eurostat/databrowser/view/${c.dataset}/default/table?lang=${lang}` })
