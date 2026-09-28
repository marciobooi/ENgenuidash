import { codeLabel, pick, type DatasetInfo, type EnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import type { FilterControl } from '../components/filters'
import type { Plan } from './types'
import { BALANCE_GEOS } from './balance'

/**
 * Toolbar filters for the dashboard on screen: countries, products, flows and the dataset's other
 * small dimensions (price band, taxes, currency, stock type…). Choosing an option rebuilds the
 * dashboard directly, like a chat request, so users do not need to type "add France".
 *
 * Countries (or partner countries) can always be several, together with one other dimension
 * (several products or flows): the dashboard then shows each country's mix. Two other dimensions
 * never vary at once: while several products are shown, "Flow" is a single choice.
 */


export interface FilterLabels {
  geo: string
  partner: string
  siec: string
  nrg_bal: string
  other: Record<string, string>
}

// The main products and flows of the energy balances (72 and 142 codes): the lists stay short,
// and the current selection is always added.
// Products: the main fuel families of Eurostat's energy balances visualisation (enbal).
const MAIN_PRODUCTS = ['TOTAL', 'C0000X0350-0370', 'C0350-0370', 'P1000', 'S2000', 'G3000', 'O4000XBIO', 'RA000', 'W6100_6220', 'N900H', 'E7000', 'H8000']
// Flows: supply, the balance lines of enbal and the main final consumption sectors.
const MAIN_FLOWS = ['PPRD', 'IMP', 'EXP', 'GAE', 'GIC', 'NRGSUP', 'TI_E', 'TO', 'NRG_E', 'DL', 'AFC', 'STATDIFF', 'FC_NE', 'FC_E', 'FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'GEP', 'GHP']
// Countries offered: the EU, its member states and neighbours (not regions or historical aggregates).
const EUROPE = /^(EU27_2020|EA20|[A-Z]{2})$/
// Dimensions shown as filters when they have few codes (the others are fixed by the planner).
const SMALL_DIMS = ['nrg_cons', 'tax', 'currency', 'stk_flow', 'plant_tec', 'operator', 'indic_nrg', 'customer', 'tra_mode', 'nrg_prc']
const MAX_OPTIONS = 12

/**
 * A consumption band still in use (price datasets keep pre-2007 bands in their dimension: a
 * single figure, e.g. KWH1200 or GJ83P70 - or, for industry, a load factor, e.g. GJ41860_I31).
 * The bands still used have a range (1000-2499), a comparator (_LT1000, _GE15000) or are the
 * "all bands" total (TOT_KWH) - never a bare figure.
 */
export const isCurrentBand = (code: string) => /^TOT_|_(LT|LE|GE)\d|\d-\d/.test(code)

const codesOf = (ds: DatasetInfo, dim: string) => ds.dimensions.find((d) => d.id === dim)?.codes ?? []
const asList = (v: string | string[] | undefined) => ([] as string[]).concat(v ?? [])

export function filterControls(
  plan: Plan,
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
  lang: string,
  labels: FilterLabels,
  /** Codes the dashboard actually shows (DashboardSpec.shown): a "top 5" asks for all 27 countries
   * but shows 5, and those are the ones selected. */
  shown?: Record<string, string[]>,
): FilterControl[] {
  const ds = dict.datasets[plan.dataset]
  if (!ds) return []
  if (plan.balance || plan.trade || plan.prices) {
    const label = (code: string) => {
      const text = codeLabel(codelists, 'GEO', code, lang).replace(/\s*\(.*?\)\s*$/, '')
      return code === 'EU27_2020' ? `EU-27 (${text})` : text
    }
    const geos = plan.balance ? BALANCE_GEOS.filter((c) => codesOf(ds, 'geo').includes(c)) : codesOf(ds, 'geo').filter((c) => /^(EU27_2020|[A-Z]{2})$/.test(c))
    const options = geos.map((code) => ({ code, label: label(code) }))
    return [{ dim: 'geo', label: labels.geo, multiple: false, options: [options[0], ...options.slice(1).sort((a, b) => a.label.localeCompare(b.label, lang))], selected: [String(plan.filters.geo)] }]
  }
  const isPlace = (dim: string) => dim === 'geo' || dim === 'partner'
  // The non-place dimension that varies, if any (products, flows…).
  const varying = Object.entries(plan.filters).find(([k, v]) => !isPlace(k) && Array.isArray(v) && v.length > 1)?.[0]
  const out: FilterControl[] = []
  const label = (dim: string, code: string) => {
    const codelist = ds.dimensions.find((d) => d.id === dim)?.codelist ?? null
    const text = codeLabel(codelists, codelist, code, lang).replace(/\s*\(.*?\)\s*$/, '')
    return code === 'EU27_2020' ? `EU-27 (${text})` : text
  }
  const control = (dim: string, name: string, codes: string[], multiple: boolean, sort = false) => {
    const selected = shown?.[dim]?.length ? shown[dim] : asList(plan.filters[dim])
    const all = [...new Set([...codes, ...selected])].filter((c) => codesOf(ds, dim).includes(c))
    if (all.length < 2) return
    let options = all.map((code) => ({ code, label: label(dim, code) }))
    if (sort) options = [...options.filter((o) => o.code.startsWith('EU')), ...options.filter((o) => !o.code.startsWith('EU')).sort((a, b) => a.label.localeCompare(b.label, lang))]
    out.push({ dim, label: name, multiple: multiple && (isPlace(dim) || !varying || varying === dim), options, selected })
  }

  // Countries (reporting) and partner countries (imports from / exports to).
  control('geo', labels.geo, codesOf(ds, 'geo').filter((c) => EUROPE.test(c)), true, true)
  if (codesOf(ds, 'partner').length) control('partner', labels.partner, codesOf(ds, 'partner').filter((c) => /^[A-Z]{2}$/.test(c)), true, true)
  // Products and flows: curated lists for the big balances, every code for small datasets.
  const siec = codesOf(ds, 'siec')
  control('siec', labels.siec, siec.length > 15 ? MAIN_PRODUCTS : siec, true)
  const flows = codesOf(ds, 'nrg_bal')
  control('nrg_bal', labels.nrg_bal, flows.length > 15 ? MAIN_FLOWS : flows, false)
  // Other small dimensions (single choice), with the dictionary's name for them.
  for (const dim of SMALL_DIMS) {
    const codes = dim === 'nrg_cons' ? codesOf(ds, dim).filter(isCurrentBand) : codesOf(ds, dim)
    if (codes.length < 2 || codes.length > MAX_OPTIONS) continue
    control(dim, labels.other[dim] ?? pick(dict.dimensions[dim], lang, dim), codes, false)
  }
  return out
}

/**
 * The plan after a filter change. Several countries (or products) make them the series of the
 * dashboard: a comparison for a year, a trend over time, a composition for parts of a whole.
 */
export function applyFilter(plan: Plan, dim: string, codes: string[], dict: EnergyDictionary): Plan {
  const ds = dict.datasets[plan.dataset]
  const valid = codes.filter((c) => codesOf(ds, dim).includes(c))
  if (!valid.length) return plan
  const next: Plan = { ...plan, filters: { ...plan.filters, [dim]: valid.length === 1 ? valid[0] : valid }, notes: [], retry: undefined, fallback: undefined }
  // Countries vary together with one other dimension at most: several products (or flows) keep
  // the other non-place dimensions to their first code; several countries keep the products.
  const isPlace = (d: string) => d === 'geo' || d === 'partner'
  if (valid.length > 1) {
    for (const [k, v] of Object.entries(next.filters)) if (k !== dim && Array.isArray(v) && (isPlace(k) === isPlace(dim) || !isPlace(k))) next.filters[k] = isPlace(dim) && !isPlace(k) ? v : v[0]
  }
  // Still a mix when the parts stay several (the dashboard shows each country's mix).
  const parts = Object.entries(next.filters).some(([k, v]) => !isPlace(k) && Array.isArray(v) && v.length > 1)
  if (dim === 'geo') {
    next.allCountries = false
    next.top = undefined
  }
  const several = valid.length > 1
  if (plan.intent === 'mix' && parts) next.intent = 'mix'
  else if (several) next.intent = next.focusPeriod ? 'compare' : dim === 'geo' && valid.length > 6 ? 'compare' : 'trend'
  else if (!Object.values(next.filters).some((v) => Array.isArray(v))) next.intent = next.focusPeriod ? 'snapshot' : 'trend'
  // A comparison without a year shows the latest one, with ten years for the evolution.
  if (next.intent === 'compare' && !next.focusPeriod && next.time.kind === 'last' && next.time.n < 10) next.time = { kind: 'last', n: 10 }
  return next
}
