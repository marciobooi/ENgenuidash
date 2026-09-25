import type { EnergyCodelists, EnergyDictionary } from '../../data/eurostat'
import {
  ALL_COUNTRIES_WORDS,
  CAUSAL_WORDS,
  ELECTRICITY_MIX,
  ENERGY_MIX,
  EU27,
  EXPLAIN_WORDS,
  FLOWS,
  INDUSTRY_WORDS,
  METRICS,
  MIX_WORDS,
  MONTHLY,
  PRODUCTS,
  TAX_EXCLUDED_WORDS,
} from '../concepts'
import { partnerIn, topicIndex } from '../datasetSearch'
import type { Clarification, NoteKey, Plan, TimeRange } from '../types'
import {
  parse,
  matches,
  any,
  find,
  detectGeos,
  detectFocus,
  detectTop,
  detectTime,
  periodFor,
  requestedUnit,
  freqOf,
  keep,
} from './parse'
import { topicFromDictionary, ORIGIN, BREAKDOWN_DIMS, defaultCode } from './topic'

/**
 * Turns a question into a Plan (plain JSON: dataset + filters + time + intent) without the
 * language model. Rules are deterministic so the numbers shown are always the right ones.
 */

export type PlanResult =
  | { kind: 'plan'; plan: Plan }
  | { kind: 'clarify'; clarification: Clarification }
  | { kind: 'explain' } // conceptual question → language model
  | { kind: 'none' } // no matching data → language model with search-based sources

// ---------- main ----------

export function planQuestion(
  question: string,
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
  /** Datasets that had no values for this question (see Plan.retry). */
  { exclude = [] }: { exclude?: string[] } = {},
): PlanResult {
  const p = parse(question)
  const metrics = new Set(find(p, METRICS).map((m) => m.id))
  const products = find(p, PRODUCTS)
  const flows = find(p, FLOWS)
  const time = detectTime(p)
  const geo = detectGeos(p, codelists)
  const top = detectTop(p)
  let allCountries = any(p, ALL_COUNTRIES_WORDS) || !!top
  let mix = any(p, MIX_WORDS)
  const notes: NoteKey[] = []

  // Conceptual questions without a concrete place, period or data request go to the model.
  const explain = any(p, EXPLAIN_WORDS)
  const concrete = geo.codes.length > 0 || geo.eu || time.years.length > 0 || time.range !== null || allCountries
  if (explain && !concrete && !metrics.has('price')) return { kind: 'explain' }
  if (any(p, CAUSAL_WORDS) && !time.years.length && !time.range && !allCountries) return { kind: 'explain' }

  const productIds = products.map((x) => x.id)
  const isElectricity = productIds.includes('electricity')
  const isGas = productIds.includes('gas')
  const wantsProduction = flows.some((f) => f.id === 'production')

  let dataset: string | null = null
  const filters: Plan['filters'] = {}
  let seriesProducts: string[] | null = null

  // 1. Indicator datasets.
  if (metrics.has('price')) {
    const industry = any(p, INDUSTRY_WORDS)
    if (!isElectricity && !isGas) {
      return {
        kind: 'clarify',
        clarification: { question: 'whichPrices', options: [] }, // options are filled in by the UI (translated)
      }
    }
    dataset = isGas ? (industry ? 'nrg_pc_203' : 'nrg_pc_202') : industry ? 'nrg_pc_205' : 'nrg_pc_204'
    if (!industry) notes.push('assumedHouseholds')
    // Currency, band and unit come from the dictionary's recommended selection.
    if (any(p, TAX_EXCLUDED_WORDS)) filters.tax = 'X_TAX'
    // "in PPS" (purchasing power standards) or in national currency instead of euro.
    if (any(p, ['pps', 'purchasing power', 'kaufkraft', 'pouvoir d achat', 'standard de pouvoir'])) filters.currency = 'PPS'
    else if (any(p, ['national currency', 'landeswahrung', 'monnaie nationale'])) filters.currency = 'NAC'
  } else if (metrics.has('degreeDays')) {
    dataset = time.monthly ? 'nrg_chdd_m' : 'nrg_chdd_a'
    filters.indic_nrg = matches(p, 'cooling') || matches(p, 'kuhl') || matches(p, 'refroid') ? 'CDD' : 'HDD'
  } else if (metrics.has('dependency') || (flows.some((f) => f.id === 'imports') && matches(p, 'depend'))) {
    dataset = 'nrg_ind_id'
    seriesProducts = products.map((x) => x.siec)
  } else if (metrics.has('share') && isElectricity && products.some((x) => x.id !== 'electricity' && x.id !== 'renewables')) {
    // "Nuclear share of electricity": the electricity mix, where the asked fuel's share is shown.
    dataset = 'nrg_bal_peh'
    filters.nrg_bal = 'GEP'
    seriesProducts = [...new Set([...products.filter((x) => x.id !== 'electricity').map((x) => x.siec), ...ELECTRICITY_MIX])]
    mix = true
  } else if (metrics.has('share') && productIds.some((id) => ['renewables', 'solar', 'wind', 'hydro', 'bioenergy'].includes(id))) {
    dataset = 'nrg_ind_ren'
    const sub = isElectricity ? 'REN_ELC' : flows.some((f) => f.id === 'transport') ? 'REN_TRA' : any(p, ['heat', 'heating', 'cooling', 'warme', 'heizen', 'kuhl', 'chauffage', 'refroid']) ? 'REN_HEAT_CL' : 'REN'
    filters.nrg_bal = sub
  } else if (metrics.has('intensity')) {
    dataset = 'nrg_ind_ei'
    filters.nrg_bal = 'EI_GDP_PPS'
  } else if (metrics.has('perCapita')) {
    dataset = 'nrg_ind_esc'
    filters.nrg_bal = flows.find((f) => f.id !== 'consumption')?.nrgBal ?? 'FC_E'
  } else if (metrics.has('primary') && !products.length) {
    dataset = 'sdg_07_10'
  }

  // 2. Monthly supply data.
  const monthlyKey = productIds.find((id) => MONTHLY[id])
  // (Not for "imports from Russia": the partner datasets have the origin, monthly too.)
  const partnerAsked = !!partnerIn(question, topicIndex(dict, codelists))
  if (!dataset && time.monthly && !partnerAsked) {
    if (monthlyKey) {
      const m = MONTHLY[monthlyKey]
      dataset = m.dataset
      const flow = flows.map((f) => m.flows[f.id]).find(Boolean) ?? m.defaultFlow
      filters.nrg_bal = flow
      if (monthlyKey === 'oil') filters.siec = 'O4600' // oil products
      if (monthlyKey === 'crude') filters.siec = 'O4100_TOT'
    } else {
      notes.push('noMonthly')
    }
  }

  // Datasets chosen above are curated routes (indicators, monthly supply); the ones below are the
  // general energy balances, which the dictionary search can replace with a better fit.
  const curated = !!dataset

  // 3. Electricity generation (by fuel).
  if (!dataset && isElectricity && (wantsProduction || mix)) {
    dataset = 'nrg_bal_peh'
    filters.nrg_bal = 'GEP'
    const fuels = products.filter((x) => x.id !== 'electricity').map((x) => x.siec)
    seriesProducts = mix && !fuels.length ? ELECTRICITY_MIX : fuels.length ? fuels : ['TOTAL']
  }

  // 4. Energy balances: any product and/or flow.
  if (!dataset && (products.length || flows.length)) {
    dataset = 'nrg_bal_c'
    const sectorFlow = flows.find((f) => ['households', 'industry', 'transport', 'services'].includes(f.id))
    const flow = sectorFlow ?? flows.find((f) => f.id !== 'consumption') ?? flows[0]
    filters.nrg_bal = flow?.nrgBal ?? 'GIC'
    const siecs = products.map((x) => x.siec)
    seriesProducts = mix && siecs.length <= 1 ? ENERGY_MIX : siecs.length ? siecs : ['TOTAL']
    // Electricity on its own reads better in GWh than in the balance default (ktoe).
    if (isElectricity && siecs.length === 1) filters.unit = 'GWH'
  }

  // 5. The dictionary: the topic words the rules do not know ("capacity", "stocks", "pellets",
  // "from Norway") pick the dataset and codes from Eurostat's own titles and labels.
  let partner: string | undefined
  let fromDictionary = false
  if (!curated) {
    const topic = topicFromDictionary(question, dict, codelists, time.monthly, exclude)
    if (topic?.unknown) return { kind: 'none' } // a topic word nothing knows: no guessed dashboard
    if (topic?.dataset && topic.dataset !== dataset) {
      dataset = topic.dataset
      fromDictionary = true
      const found = dict.datasets[dataset]
      const codesOf = (dim: string) => found.dimensions.find((d) => d.id === dim)?.codes ?? []
      for (const k of Object.keys(filters)) delete filters[k]
      Object.assign(filters, topic.filters)
      // The question's own flow and products, when this dataset has them ("wood pellets
      // consumption" → final consumption, not the dataset's first flow).
      const flow = flows.map((f) => f.nrgBal).find((c) => codesOf('nrg_bal').includes(c))
      if (flow && !topic.filters.nrg_bal) filters.nrg_bal = flow
      const own = products.map((x) => x.siec).filter((c) => codesOf('siec').includes(c))
      seriesProducts = !topic.filters.siec && own.length ? own : null
      // "… by fuel" on a dataset with a product breakdown: every product is a series.
      const siecs = codesOf('siec').filter((c) => c !== 'TOTAL')
      if (mix && !topic.filters.siec && siecs.length > 1 && siecs.length <= 12) seriesProducts = siecs
      partner = topic.partner
    } else if (topic?.siec && (!dataset || !seriesProducts || seriesProducts.join() === 'TOTAL')) {
      // The balance, with a product the rules do not know ("biodiesel", "peat").
      if (!dataset) {
        dataset = 'nrg_bal_c'
        filters.nrg_bal = flows.find((f) => f.id !== 'consumption')?.nrgBal ?? flows[0]?.nrgBal ?? 'GIC'
      }
      seriesProducts = [topic.siec]
    }
  }

  if (!dataset) return { kind: 'none' }
  const ds = dict.datasets[dataset]
  if (!ds) return { kind: 'none' }
  const freq = freqOf(ds)

  // Unit: the one the question names, else the planner's choice, else the dictionary default.
  // Datasets with several units always get exactly one — never an invented one.
  const askedUnit = requestedUnit(p, ds)
  if (askedUnit) filters.unit = askedUnit
  for (const [dim, code] of Object.entries(ds.defaults)) if (code && filters[dim] === undefined) filters[dim] = code

  // Validate filters against the dataset and fill every remaining dimension.
  const finalFilters: Plan['filters'] = {}
  for (const dim of ds.dimensions) {
    if (dim.id === 'geo') continue
    if (dim.id === 'siec' && seriesProducts) {
      const v = keep(ds, 'siec', seriesProducts, 'TOTAL')
      if (v) finalFilters.siec = v
      continue
    }
    const wanted = filters[dim.id]
    // A breakdown with no total (types of generation…): all codes, when nothing else is a series.
    if (!wanted && BREAKDOWN_DIMS.includes(dim.id) && !dim.codes.includes('TOTAL') && dim.codes.length > 1 && dim.codes.length <= 8 && !seriesProducts && !allCountries) {
      finalFilters[dim.id] = dim.codes
      continue
    }
    const v = keep(ds, dim.id, wanted ? ([] as string[]).concat(wanted) : [], defaultCode(ds, dim.id, codelists))
    if (v) finalFilters[dim.id] = Array.isArray(v) ? v[0] : v
  }

  // Geography. ("by country of origin" is a partner breakdown, not every EU country.)
  const byOrigin = ORIGIN.test(p.text) && ds.dimensions.some((d) => d.id === 'partner')
  if (byOrigin) allCountries = false
  const geoDim = ds.dimensions.find((d) => d.id === 'geo')
  if (geoDim) {
    let geos: string[]
    if (allCountries) geos = EU27.filter((c) => geoDim.codes.includes(c))
    else {
      // "Imports from Norway": Norway is the partner, not the reporting country.
      geos = geo.codes.filter((c) => geoDim.codes.includes(c) && c !== partner)
      const eu = geoDim.codes.includes('EU27_2020') ? 'EU27_2020' : geoDim.codes.find((c) => c.startsWith('EU'))
      if ((geo.eu || !geos.length) && eu) geos.unshift(eu)
      if (!geo.eu && !geo.codes.some((c) => c !== partner)) notes.push('assumedEu')
    }
    finalFilters.geo = geos.length === 1 ? geos[0] : geos
  }

  if (partner && ds.dimensions.some((d) => d.id === 'partner' && d.codes.includes(partner))) finalFilters.partner = partner
  // "… by country of origin" / "by partner": the partner countries are the series (the largest
  // ten, see execute.ts), for the EU unless a reporting country is named.
  const partnerDim = ds.dimensions.find((d) => d.id === 'partner')
  let topPartners: Plan['top']
  if (partnerDim && !partner && ORIGIN.test(p.text)) {
    const countries = partnerDim.codes.filter((c) => /^[A-Z]{2}$/.test(c) && !EU27.includes(c))
    if (countries.length > 1) {
      finalFilters.partner = countries
      if (Array.isArray(finalFilters.geo)) finalFilters.geo = geoDim?.codes.includes('EU27_2020') ? 'EU27_2020' : finalFilters.geo[0]
      if (countries.length > 10) topPartners = { n: 10 }
    }
  }

  // Time and intent.
  const seriesCount = Object.values(finalFilters).reduce((n, v) => Math.max(n, Array.isArray(v) ? v.length : 1), 1)
  let range: TimeRange
  let intent: Plan['intent']
  let focusPeriod: string | undefined

  if (time.month && freq === 'M') {
    const { year, month } = time.month
    range = { kind: 'range', since: periodFor('M', year - 1, false, month), until: periodFor('M', year, true, month) }
    intent = 'trend'
  } else if (time.range) {
    const perYear = freq === 'M' ? 12 : freq === 'S' ? 2 : freq === 'Q' ? 4 : 1
    range =
      time.range.kind === 'last'
        ? {
            kind: 'last',
            n: time.lastUnit === 'month' ? Math.max(1, Math.ceil((time.range.n * perYear) / 12)) : time.range.n * perYear,
          }
        : time.range.kind === 'range'
        ? {
            kind: 'range',
            since: time.range.since ? periodFor(freq, time.range.since, false) : undefined,
            until: time.range.until ? periodFor(freq, time.range.until, true) : undefined,
          }
        : time.range
    intent = mix ? 'mix' : 'trend'
  } else if (time.years.length === 1) {
    const y = time.years[0]
    if (freq === 'A') {
      // One year: several countries/products → comparison for that year (previous year fetched
      // only for the change); a single series → KPI for that year with ten years of context.
      focusPeriod = String(y)
      intent = mix ? 'mix' : seriesCount > 1 ? 'compare' : 'snapshot'
      range = { kind: 'range', since: String(intent === 'snapshot' ? y - 9 : y - 1), until: String(y) }
    } else {
      range = { kind: 'range', since: periodFor(freq, y, false), until: periodFor(freq, y, true) }
      intent = 'trend'
    }
  } else if (allCountries) {
    // Ten years (the latest one is compared), so the dashboard can also show the evolution.
    range = { kind: 'last', n: freq === 'A' ? 10 : freq === 'S' ? 10 : 13 }
    intent = 'compare'
  } else {
    range = { kind: 'last', n: freq === 'M' ? 24 : freq === 'S' ? 10 : 15 } // = a period button (execute.ts)
    intent = mix ? 'mix' : 'trend'
  }
  if (allCountries && intent !== 'trend') intent = 'compare'
  if (mix && !Array.isArray(finalFilters.geo)) intent = time.years.length === 1 || !time.range ? 'mix' : intent

  // "Show monthly data" is offered for annual balances only (prices and indicators have none).
  const monthlyDataset = monthlyKey && dataset === 'nrg_bal_c' ? MONTHLY[monthlyKey].dataset : undefined

  return {
    kind: 'plan',
    plan: {
      dataset,
      filters: finalFilters,
      time: range,
      intent: topPartners || byOrigin ? 'compare' : intent,
      focus: detectFocus(p),
      focusPeriod,
      allCountries,
      top: top ?? topPartners,
      monthlyDataset,
      notes,
      ...(fromDictionary ? { retry: { question, tried: exclude } } : {}),
    },
  }
}
