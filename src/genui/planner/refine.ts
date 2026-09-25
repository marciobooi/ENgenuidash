import type { EnergyCodelists, EnergyDictionary } from '../../data/eurostat'
import {
  ADD_PREFIXES,
  ADD_WORDS,
  ONLY_WORDS,
  ALL_COUNTRIES_WORDS,
  REMOVE_WORDS,
  TREND_WORDS,
  ELECTRICITY_MIX,
  ENERGY_MIX,
  EU27,
  FLOWS,
  METRICS,
  MIX_WORDS,
  PRODUCTS,
} from '../concepts'
import type { Plan } from '../types'
import {
  parse,
  any,
  find,
  detectGeos,
  detectFocus,
  detectTop,
  detectTime,
  periodFor,
  requestedUnit,
  freqOf,
  detectChart,
  monthlyFilters,
} from './parse'
import { topicFromDictionary } from './topic'
import { planQuestion } from './plan'

/**
 * Follow-up rules: how a message changes the dashboard on screen ("add Germany", "since 2010",
 * "as bar chart", "what about oil?"), or null when it is a new question.
 */

// ---------- refinements of the current dashboard ----------

/**
 * If a message changes the current dashboard ("add Germany", "since 2010", "as bar chart",
 * "monthly", "all countries") rather than asking about a new topic, returns the updated plan.
 */
export function refinePlan(
  current: Plan,
  question: string,
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
): Plan | null {
  const p = parse(question)
  // "Why did it rise in 2022?" asks for an explanation, not a change of the dashboard.
  if (any(p, ['why', 'warum', 'wieso', 'weshalb', 'pourquoi'])) return null
  // "Electricity mix in France" on a dashboard without a mix (prices, import dependency) asks
  // for another dataset: a new question, not "electricity for France" on the prices shown.
  if (any(p, MIX_WORDS) && current.dataset !== 'nrg_bal_c' && current.dataset !== 'nrg_bal_peh') return null
  const products = find(p, PRODUCTS)
  const onlyProducts = products.length > 0 && !find(p, METRICS).length && !find(p, FLOWS).length
  // "What about oil?" on the import dependency dashboard: the same indicator for that product.
  const ownSiec = dict.datasets[current.dataset]?.dimensions.find((d) => d.id === 'siec')?.codes ?? []
  const switchProduct = onlyProducts && !Array.isArray(current.filters.siec) && products.every((x) => ownSiec.includes(x.siec))
  const hasTopic = !switchProduct && (products.length > 0 || find(p, METRICS).length > 0 || find(p, FLOWS).some((f) => f.id !== 'consumption'))
  // Naming the topic already on screen ("which countries are the most dependent?" on the import
  // dependency dashboard) is still a change of this dashboard, not a new question.
  if (hasTopic && !sameTopic(current, question, dict, codelists)) return null
  // A topic the rules do not know but the dictionary does ("wood pellets", "heat pumps") is a
  // new question when it points to another dataset or product than the one on screen.
  const topic = topicFromDictionary(question, dict, codelists, false)
  if (topic && ((topic.dataset && topic.dataset !== current.dataset) || (topic.siec && topic.siec !== current.filters.siec))) return null

  const ds = dict.datasets[current.dataset]
  const geoDim = ds.dimensions.find((d) => d.id === 'geo')
  const freq = freqOf(ds)
  const time = detectTime(p)
  const geo = detectGeos(p, codelists)
  const chart = detectChart(p)
  const top = detectTop(p)
  // "I want a map": the map comes with the comparison of all countries.
  const allCountries = any(p, ALL_COUNTRIES_WORDS) || !!top || any(p, ['map', 'karte', 'carte'])
  const mix = any(p, MIX_WORDS)

  const next: Plan = { ...current, filters: { ...current.filters }, notes: [], retry: undefined }
  let changed = false

  if (switchProduct) {
    const codes = products.map((x) => x.siec)
    next.filters.siec = codes.length === 1 ? codes[0] : codes
    changed = true
  }
  // "The latest year": the last year of the dataset.
  if (freq === 'A' && !time.years.length && !time.range && any(p, ['latest year', 'most recent year', 'last available year', 'neueste jahr', 'letzte verfugbare jahr', 'derniere annee', 'annee la plus recente'])) {
    const y = Number(String(ds.dataEnd ?? '').slice(0, 4))
    if (y) time.years.push(y)
  }

  if (chart) {
    next.chart = chart
    if (chart === 'pie' && current.intent === 'trend') next.intent = Array.isArray(current.filters.geo) ? 'compare' : 'mix'
    changed = true
  }

  if (geoDim && (geo.codes.length || geo.eu || allCountries)) {
    const currentGeos = ([] as string[]).concat(current.filters.geo ?? [])
    const eu = geoDim.codes.includes('EU27_2020') ? ['EU27_2020'] : []
    const mentioned = [...(geo.eu ? eu : []), ...geo.codes].filter((c) => geoDim.codes.includes(c))
    let geos: string[]
    if (allCountries) {
      geos = EU27.filter((c) => geoDim.codes.includes(c))
      next.allCountries = true
      next.top = top
      next.intent = 'compare'
      if (next.time.kind !== 'range' || !next.focusPeriod) next.time = { kind: 'last', n: freq === 'A' || freq === 'S' ? 10 : 13 }
    } else if (any(p, REMOVE_WORDS)) {
      geos = currentGeos.filter((c) => !mentioned.includes(c))
    } else if (!any(p, ONLY_WORDS) && (any(p, ADD_WORDS) || ADD_PREFIXES.some((w) => p.text.startsWith(` ${w} `)))) {
      geos = [...new Set([...currentGeos, ...mentioned])]
    } else {
      geos = mentioned
    }
    if (geos.length) {
      next.filters.geo = geos.length === 1 ? geos[0] : geos
      if (!allCountries) {
        next.allCountries = false
        next.top = undefined
        if (next.intent === 'compare' && geos.length <= 6 && !next.focusPeriod) next.intent = 'trend'
        // "Add Italy" on a single year: the countries compared for that year.
        if (next.focusPeriod && geos.length > 1 && next.intent === 'snapshot') {
          next.intent = 'compare'
          next.time = { kind: 'range', since: String(Number(next.focusPeriod) - 1), until: next.focusPeriod }
        }
      }
      changed = true
    }
  }

  // "Show the trend", "how has it changed?", "wie hat sich das entwickelt?": the whole series.
  if (!time.range && !time.years.length && !time.monthly && any(p, TREND_WORDS)) {
    time.range = { kind: 'all' }
  }

  if (time.range || time.years.length) {
    if (time.range?.kind === 'all') next.time = { kind: 'all' }
    else if (time.range?.kind === 'last') {
      const perYear = freq === 'M' ? 12 : freq === 'S' ? 2 : 1
      next.time = { kind: 'last', n: time.lastUnit === 'month' ? Math.max(1, Math.ceil((time.range.n * perYear) / 12)) : time.range.n * perYear }
    } else if (time.range?.kind === 'range') {
      next.time = {
        kind: 'range',
        since: time.range.since ? periodFor(freq, time.range.since, false) : undefined,
        until: time.range.until ? periodFor(freq, time.range.until, true) : undefined,
      }
    } else if (time.years.length === 1) {
      const y = time.years[0]
      if (freq === 'A') {
        // "in 2022": show that year. Several series → comparison (bar chart) for 2022;
        // one series → KPI for 2022 with context; a mix stays a mix, for 2022.
        const series = Object.values(next.filters).some((v) => Array.isArray(v) && v.length > 1)
        next.focusPeriod = String(y)
        if (next.intent !== 'mix') next.intent = series ? 'compare' : 'snapshot'
        next.time = { kind: 'range', since: String(next.intent === 'snapshot' ? y - 9 : y - 1), until: String(y) }
        // A chart type asked for earlier (e.g. "as line chart") no longer fits a single year.
        if (next.chart === 'line' || next.chart === 'area') next.chart = undefined
      } else {
        // Half-yearly/monthly data: the periods of that year.
        next.time = { kind: 'range', since: periodFor(freq, y, false), until: periodFor(freq, y, true) }
        next.focusPeriod = undefined
        if (next.intent === 'compare' || next.intent === 'snapshot') next.intent = 'trend'
      }
    }
    if (time.range) {
      // A range ("since 2015", "last 5 years", "all time") is a view over time again.
      next.focusPeriod = undefined
      if (next.intent === 'compare' || next.intent === 'snapshot') next.intent = 'trend'
    }
    changed = true
  }

  const unit = requestedUnit(p, ds)
  if (unit && unit !== current.filters.unit) {
    next.filters.unit = unit
    changed = true
  }

  if (time.monthly && current.monthlyDataset) {
    return { ...next, dataset: current.monthlyDataset, monthlyDataset: undefined, filters: monthlyFilters(next, dict), time: { kind: 'last', n: 24 }, intent: 'trend', focusPeriod: undefined }
  }

  if (mix && (current.dataset === 'nrg_bal_c' || current.dataset === 'nrg_bal_peh')) {
    next.filters.siec = current.dataset === 'nrg_bal_peh' ? ELECTRICITY_MIX : ENERGY_MIX
    next.intent = 'mix'
    changed = true
  }

  // A new focus ("which one is the highest?", "how has it changed?") replaces the previous one; a
  // plain change ("add Italy") keeps it. "Which…?" needs something to rank: several series, or the
  // periods of one ("which year…?"); "which source is the largest?" on one series is not a change.
  const focus = detectFocus(p)
  const rankable = focus?.kind !== 'which' || focus.period || Object.values(next.filters).some((v) => Array.isArray(v) && v.length > 1)
  if (focus && rankable && JSON.stringify(focus) !== JSON.stringify(current.focus)) {
    next.focus = focus
    changed = true
  }

  return changed ? next : null
}

/** True when a question would plan the dataset and selection (except place/time) already shown. */
function sameTopic(current: Plan, question: string, dict: EnergyDictionary, codelists: EnergyCodelists): boolean {
  const result = planQuestion(question, dict, codelists)
  if (result.kind !== 'plan' || result.plan.dataset !== current.dataset) return false
  const topic = (f: Plan['filters']) => JSON.stringify(Object.entries(f).filter(([k]) => k !== 'geo' && k !== 'freq').sort(([a], [b]) => a.localeCompare(b)))
  return topic(result.plan.filters) === topic(current.filters)
}
