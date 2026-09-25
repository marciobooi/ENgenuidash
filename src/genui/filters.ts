import { codeLabel, pick, type DatasetInfo, type EnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import type { FilterControl } from '../components/filters'
import type { Plan } from './types'

/**
 * Toolbar filters for the dashboard on screen: countries, products, flows and the dataset's other
 * small dimensions (price band, taxes, currency, stock type…). Choosing an option rebuilds the
 * dashboard directly, like a chat request, so users do not need to type "add France".
 *
 * Only one dimension can vary (be the series) at a time: while several products are shown,
 * "Countries" is a single choice, and the other way round.
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
const MAIN_PRODUCTS = ['TOTAL', 'C0000X0350-0370', 'P1000', 'O4000XBIO', 'G3000', 'RA000', 'W6100_6220', 'N900H', 'H8000', 'E7000']
const MAIN_FLOWS = ['PPRD', 'IMP', 'EXP', 'GAE', 'GIC', 'TI_E', 'FC_E', 'FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'FC_NE', 'DL']
// Countries offered: the EU, its member states and neighbours (not regions or historical aggregates).
const EUROPE = /^(EU27_2020|EA20|[A-Z]{2})$/
// Dimensions shown as filters when they have few codes (the others are fixed by the planner).
const SMALL_DIMS = ['nrg_cons', 'tax', 'currency', 'stk_flow', 'plant_tec', 'operator', 'indic_nrg', 'customer', 'tra_mode', 'nrg_prc']
const MAX_OPTIONS = 12

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
  const varying = Object.entries(plan.filters).find(([, v]) => Array.isArray(v) && v.length > 1)?.[0]
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
    out.push({ dim, label: name, multiple: multiple && (!varying || varying === dim), options, selected })
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
    const codes = codesOf(ds, dim)
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
  const next: Plan = { ...plan, filters: { ...plan.filters, [dim]: valid.length === 1 ? valid[0] : valid }, notes: [], retry: undefined }
  // Only one dimension varies: the others keep their first code.
  if (valid.length > 1) {
    for (const [k, v] of Object.entries(next.filters)) if (k !== dim && Array.isArray(v)) next.filters[k] = v[0]
  }
  if (dim === 'geo') {
    next.allCountries = false
    next.top = undefined
  }
  const several = valid.length > 1
  if (several) next.intent = next.focusPeriod ? 'compare' : dim === 'geo' && valid.length > 6 ? 'compare' : 'trend'
  else if (!Object.values(next.filters).some((v) => Array.isArray(v))) next.intent = next.focusPeriod ? 'snapshot' : 'trend'
  // A comparison without a year shows the latest one, with ten years for the evolution.
  if (next.intent === 'compare' && !next.focusPeriod && next.time.kind === 'last' && next.time.n < 10) next.time = { kind: 'last', n: 10 }
  return next
}
