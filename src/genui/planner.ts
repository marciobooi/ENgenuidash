import type { DatasetInfo, EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { normalize } from '../llm/energyScope'
import {
  ADD_PREFIXES,
  ADD_WORDS,
  ONLY_WORDS,
  ALL_COUNTRIES_WORDS,
  CHART_WORDS,
  REMOVE_WORDS,
  TREND_WORDS,
  ALL_TIME_WORDS,
  ELECTRICITY_MIX,
  ENERGY_MIX,
  EU27,
  EU_ALIASES,
  EXPLAIN_WORDS,
  FLOWS,
  INDUSTRY_WORDS,
  METRICS,
  MIX_WORDS,
  MONTH_NAMES,
  MONTHLY,
  MONTHLY_WORDS,
  PRODUCTS,
  TAX_EXCLUDED_WORDS,
  UNIT_WORDS,
  type Concept,
} from './concepts'
import type { ChartKind, Clarification, NoteKey, Plan, TimeRange } from './types'

/**
 * Turns a question into a Plan (plain JSON: dataset + filters + time + intent) without the
 * language model. Rules are deterministic so the numbers shown are always the right ones.
 */

export type PlanResult =
  | { kind: 'plan'; plan: Plan }
  | { kind: 'clarify'; clarification: Clarification }
  | { kind: 'explain' } // conceptual question → language model
  | { kind: 'none' } // no matching data → language model with search-based sources

interface Parsed {
  text: string // normalised, padded with spaces for phrase matching
  words: string[]
}

function parse(question: string): Parsed {
  const words = normalize(question)
    .replace(/[’']/g, ' ')
    .split(/[^a-z0-9-]+/)
    .filter(Boolean)
  return { text: ` ${words.join(' ')} `, words }
}

function matches(p: Parsed, stem: string): boolean {
  const s = stem.trim()
  // "word$": that exact word only.
  if (s.endsWith('$')) return p.words.includes(s.slice(0, -1))
  if (s.includes(' ')) return p.text.includes(` ${s}`)
  if (s.length <= 4) return p.words.some((w) => w === s || w === `${s}s` || w === `${s}es`)
  // Long stems also match inside German compounds: "stromverbrauch" contains "verbrauch".
  if (s.length >= 7) return p.words.some((w) => w.includes(s))
  return p.words.some((w) => w.startsWith(s))
}

const any = (p: Parsed, stems: string[]) => stems.some((s) => matches(p, s))
const find = <T extends Concept>(p: Parsed, list: T[]) => list.filter((c) => any(p, c.stems))

// ---------- geography ----------

function detectGeos(p: Parsed, codelists: EnergyCodelists): { codes: string[]; eu: boolean } {
  const codes: string[] = []
  const eu = EU_ALIASES.some((a) => p.text.includes(` ${a} `))
  const geo = codelists.codelists.GEO?.codes ?? {}
  for (const code of EU27.concat(['NO', 'IS', 'UK', 'TR', 'UA', 'RS', 'ME', 'MK', 'AL', 'BA', 'MD', 'GE', 'XK'])) {
    for (const label of Object.values(geo[code] ?? {})) {
      if (typeof label !== 'string') continue
      const name = parse(label.replace(/\(.*?\)/g, '')).words.join(' ')
      if (name.length > 2 && p.text.includes(` ${name} `) && !codes.includes(code)) codes.push(code)
    }
  }
  // Common short forms that are not in the official labels.
  const extra: Record<string, string> = { uk: 'UK', britain: 'UK', greece: 'EL', holland: 'NL', czechia: 'CZ' }
  for (const [word, code] of Object.entries(extra)) if (p.words.includes(word) && !codes.includes(code)) codes.push(code)
  return { codes, eu }
}

/** "top 5", "5 highest", "bottom 3", "les 5 premiers", "die 5 höchsten" → { n, lowest }. */
const TOP_BEFORE = '(?:top|best|highest|largest|biggest|premiers?|meilleurs?|hochsten|grossten)'
const BOTTOM_BEFORE = '(?:bottom|worst|lowest|smallest|derniers?|niedrigsten|kleinsten)'
const TOP_AFTER = '(?:highest|largest|biggest|most|premiers?|plus eleves?|plus grands?|hochsten|grossten|meisten)'
const BOTTOM_AFTER = '(?:lowest|smallest|least|derniers?|plus faibles?|plus bas|niedrigsten|kleinsten|wenigsten)'

function detectTop(p: Parsed): Plan['top'] {
  const n = (m: RegExpMatchArray | null) => (m ? Number(m[1]) : 0)
  const top = n(p.text.match(new RegExp(`\\b${TOP_BEFORE}\\s+(\\d{1,2})\\b`))) || n(p.text.match(new RegExp(`\\b(\\d{1,2})\\s+${TOP_AFTER}\\b`)))
  if (top >= 1 && top <= 27) return { n: top }
  const bottom = n(p.text.match(new RegExp(`\\b${BOTTOM_BEFORE}\\s+(\\d{1,2})\\b`))) || n(p.text.match(new RegExp(`\\b(\\d{1,2})\\s+${BOTTOM_AFTER}\\b`)))
  if (bottom >= 1 && bottom <= 27) return { n: bottom, lowest: true }
  // Without a number ("which countries depend the most?", "am abhängigsten", "les moins
  // dépendants"): the 5 highest or lowest, but only when the message is about countries, so
  // "which source is the largest?" on a mix is not turned into a country ranking.
  if (!RANKED_SUBJECT.test(p.text)) return undefined
  if (LOWEST_WORDS.test(p.text)) return { n: 5, lowest: true }
  if (HIGHEST_WORDS.test(p.text)) return { n: 5 }
  return undefined
}

const RANKED_SUBJECT = /\b(countr(y|ies)|member states?|states|ones|who|lander|land|staaten|pays|etats)\b/
const LOWEST_WORDS = /\b(least|lowest|smallest|fewest|am wenigsten|am niedrigsten|am kleinsten|les moins|le moins|la moins|les plus faibles|les plus bas)\b/
const HIGHEST_WORDS = /\b(the most|most \w+|highest|largest|biggest|am meisten|am \w+sten|les plus|le plus|la plus)\b/

/** Places named in free text (EU27 countries, neighbours, the EU itself). */
export function placesInText(text: string, codelists: EnergyCodelists): { codes: string[]; eu: boolean } {
  return detectGeos(parse(text), codelists)
}

// ---------- time ----------

interface TimeIntent {
  range: TimeRange | null
  /** "last N years/months" before conversion to the dataset's frequency. */
  lastUnit?: 'year' | 'month'
  years: number[]
  month?: { year: number; month: number }
  monthly: boolean
}

function detectTime(p: Parsed): TimeIntent {
  const years = [...new Set((p.text.match(/\b(19[5-9]\d|20[0-4]\d)\b/g) ?? []).map(Number))].sort()
  const monthly = any(p, MONTHLY_WORDS)

  let month: TimeIntent['month']
  for (let i = 0; i < p.words.length - 1; i++) {
    const m = MONTH_NAMES[p.words[i]]
    const y = Number(p.words[i + 1])
    if (m && y > 1950) month = { year: y, month: m }
  }
  const iso = p.text.match(/\b(20\d\d)-(0[1-9]|1[0-2])\b/)
  if (iso) month = { year: Number(iso[1]), month: Number(iso[2]) }

  const last = p.text.match(/\b(?:last|past|letzten|vergangenen|derniers?|dernieres?)\s+(\d{1,2})\s+(years?|jahren?|ans?|annees?|months?|monaten?|mois)\b/)
  const since = /\b(since|seit|depuis|from|ab|von|a partir)\b/.test(p.text)

  let range: TimeRange | null = null
  let lastUnit: TimeIntent['lastUnit']
  if (any(p, ALL_TIME_WORDS)) range = { kind: 'all' }
  else if (last) {
    range = { kind: 'last', n: Number(last[1]) }
    lastUnit = /month|monat|mois/.test(last[2]) ? 'month' : 'year'
  }
  else if (years.length >= 2) range = { kind: 'range', since: String(years[0]), until: String(years.at(-1)) }
  else if (years.length === 1 && since) range = { kind: 'range', since: String(years[0]) }
  return { range, lastUnit, years, month, monthly: monthly || !!month || lastUnit === 'month' }
}

/** Formats a year/month boundary in the dataset's period format (2024, 2024-S1, 2024-01). */
function periodFor(freq: string, year: string | number, end: boolean, month?: number): string {
  if (freq === 'M') return `${year}-${String(month ?? (end ? 12 : 1)).padStart(2, '0')}`
  if (freq === 'S') return `${year}-S${end ? 2 : 1}`
  if (freq === 'Q') return `${year}-Q${end ? 4 : 1}`
  return String(year)
}

// ---------- units ----------

/** Unit named in free text, if the dataset offers it. Used by the model's grounding step too. */
export function unitFromText(text: string, ds: DatasetInfo): string | undefined {
  return requestedUnit(parse(text), ds)
}

/** A unit the question asks for, if the dataset offers it ("in GWh", "in TJ", "in m³"). */
function requestedUnit(p: Parsed, ds: DatasetInfo): string | undefined {
  for (const entry of UNIT_WORDS) {
    if (!any(p, entry.stems)) continue
    const hit = entry.units.find((u) => ds.units.includes(u))
    if (hit) return hit
  }
  return undefined
}

// ---------- helpers ----------

const freqOf = (ds: DatasetInfo) => ds.dimensions.find((d) => d.id === 'freq')?.codes[0] ?? 'A'
const has = (ds: DatasetInfo, dim: string, code: string) =>
  ds.dimensions.find((d) => d.id === dim)?.codes.includes(code) ?? false

/** Keeps only codes the dataset has; falls back to `fallback` when none survive. */
function keep(ds: DatasetInfo, dim: string, codes: string[], fallback?: string): string | string[] | undefined {
  const ok = codes.filter((c) => has(ds, dim, c))
  if (ok.length > 1) return ok
  if (ok.length === 1) return ok[0]
  return fallback && has(ds, dim, fallback) ? fallback : ds.dimensions.find((d) => d.id === dim)?.codes[0]
}

// ---------- main ----------

export function planQuestion(question: string, dict: EnergyDictionary, codelists: EnergyCodelists): PlanResult {
  const p = parse(question)
  const metrics = new Set(find(p, METRICS).map((m) => m.id))
  const products = find(p, PRODUCTS)
  const flows = find(p, FLOWS)
  const time = detectTime(p)
  const geo = detectGeos(p, codelists)
  const top = detectTop(p)
  const allCountries = any(p, ALL_COUNTRIES_WORDS) || !!top
  const mix = any(p, MIX_WORDS)
  const notes: NoteKey[] = []

  // Conceptual questions without a concrete place, period or data request go to the model.
  const explain = any(p, EXPLAIN_WORDS)
  const concrete = geo.codes.length > 0 || geo.eu || time.years.length > 0 || time.range !== null || allCountries
  if (explain && !concrete && !metrics.has('price')) return { kind: 'explain' }

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
  } else if (metrics.has('degreeDays')) {
    dataset = time.monthly ? 'nrg_chdd_m' : 'nrg_chdd_a'
    filters.indic_nrg = matches(p, 'cooling') || matches(p, 'kuhl') || matches(p, 'refroid') ? 'CDD' : 'HDD'
  } else if (metrics.has('dependency') || (flows.some((f) => f.id === 'imports') && matches(p, 'depend'))) {
    dataset = 'nrg_ind_id'
    seriesProducts = products.map((x) => x.siec)
  } else if (metrics.has('share') && productIds.some((id) => ['renewables', 'solar', 'wind', 'hydro', 'bioenergy'].includes(id))) {
    dataset = 'nrg_ind_ren'
    const sub = isElectricity ? 'REN_ELC' : flows.some((f) => f.id === 'transport') ? 'REN_TRA' : matches(p, 'heat') || matches(p, 'warme') || matches(p, 'chauffage') ? 'REN_HEAT_CL' : 'REN'
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
  if (!dataset && time.monthly) {
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
    const v = keep(ds, dim.id, wanted ? ([] as string[]).concat(wanted) : [], dim.codes.includes('TOTAL') ? 'TOTAL' : dim.codes[0])
    if (v) finalFilters[dim.id] = Array.isArray(v) ? v[0] : v
  }

  // Geography.
  const geoDim = ds.dimensions.find((d) => d.id === 'geo')
  if (geoDim) {
    let geos: string[]
    if (allCountries) geos = EU27.filter((c) => geoDim.codes.includes(c))
    else {
      geos = geo.codes.filter((c) => geoDim.codes.includes(c))
      const eu = geoDim.codes.includes('EU27_2020') ? 'EU27_2020' : geoDim.codes.find((c) => c.startsWith('EU'))
      if ((geo.eu || !geos.length) && eu) geos.unshift(eu)
      if (!geo.eu && !geo.codes.length) notes.push('assumedEu')
    }
    finalFilters.geo = geos.length === 1 ? geos[0] : geos
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
    range = { kind: 'last', n: freq === 'A' ? 2 : freq === 'S' ? 2 : 13 }
    intent = 'compare'
  } else {
    range = { kind: 'last', n: freq === 'M' ? 24 : freq === 'S' ? 12 : 15 }
    intent = mix ? 'mix' : 'trend'
  }
  if (allCountries && intent !== 'trend') intent = 'compare'
  if (mix && !Array.isArray(finalFilters.geo)) intent = time.years.length === 1 || !time.range ? 'mix' : intent

  // "Show monthly data" is offered for annual balances only (prices and indicators have none).
  const monthlyDataset = monthlyKey && dataset === 'nrg_bal_c' ? MONTHLY[monthlyKey].dataset : undefined

  return {
    kind: 'plan',
    plan: { dataset, filters: finalFilters, time: range, intent, focusPeriod, allCountries, top, monthlyDataset, notes },
  }
}

// ---------- refinements of the current dashboard ----------

function detectChart(p: Parsed): ChartKind | undefined {
  return (Object.keys(CHART_WORDS) as ChartKind[]).find((k) => any(p, CHART_WORDS[k]))
}

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
  const hasTopic = find(p, PRODUCTS).length > 0 || find(p, METRICS).length > 0 || find(p, FLOWS).some((f) => f.id !== 'consumption')
  // Naming the topic already on screen ("which countries are the most dependent?" on the import
  // dependency dashboard) is still a change of this dashboard, not a new question.
  if (hasTopic && !sameTopic(current, question, dict, codelists)) return null

  const ds = dict.datasets[current.dataset]
  const geoDim = ds.dimensions.find((d) => d.id === 'geo')
  const freq = freqOf(ds)
  const time = detectTime(p)
  const geo = detectGeos(p, codelists)
  const chart = detectChart(p)
  const top = detectTop(p)
  const allCountries = any(p, ALL_COUNTRIES_WORDS) || !!top
  const mix = any(p, MIX_WORDS)

  const next: Plan = { ...current, filters: { ...current.filters }, notes: [] }
  let changed = false

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
      if (next.time.kind !== 'range' || !next.focusPeriod) next.time = { kind: 'last', n: freq === 'A' || freq === 'S' ? 2 : 13 }
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
        if (next.intent === 'compare' && geos.length <= 6) next.intent = 'trend'
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

  return changed ? next : null
}

/** True when a question would plan the dataset and selection (except place/time) already shown. */
function sameTopic(current: Plan, question: string, dict: EnergyDictionary, codelists: EnergyCodelists): boolean {
  const result = planQuestion(question, dict, codelists)
  if (result.kind !== 'plan' || result.plan.dataset !== current.dataset) return false
  const topic = (f: Plan['filters']) => JSON.stringify(Object.entries(f).filter(([k]) => k !== 'geo' && k !== 'freq').sort(([a], [b]) => a.localeCompare(b)))
  return topic(result.plan.filters) === topic(current.filters)
}

/** Filters for the monthly variant of an annual balance plan. */
export function monthlyFilters(plan: Plan, dict: EnergyDictionary): Plan['filters'] {
  const monthly = Object.values(MONTHLY).find((m) => m.dataset === plan.monthlyDataset)
  const mds = plan.monthlyDataset ? dict.datasets[plan.monthlyDataset] : undefined
  if (!monthly || !mds) return plan.filters
  const annualFlow = String(plan.filters.nrg_bal ?? '')
  const flow = ({ IMP: 'IMP', EXP: 'EXP', PPRD: 'IPRD' } as Record<string, string>)[annualFlow] ?? monthly.defaultFlow
  const siec = mds.dimensions.find((d) => d.id === 'siec')?.codes ?? []
  const units = mds.dimensions.find((d) => d.id === 'unit')?.codes ?? []
  return {
    freq: 'M',
    nrg_bal: flow,
    geo: plan.filters.geo,
    ...(siec.length ? { siec: siec.includes('O4600') ? 'O4600' : siec[0] } : {}),
    ...(units.length ? { unit: mds.defaults.unit ?? units[0] } : {}),
  }
}
