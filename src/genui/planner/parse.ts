import type { DatasetInfo, EnergyCodelists, EnergyDictionary } from '../../data/eurostat'
import { normalize } from '../../llm/energyScope'
import {
  CHART_WORDS,
  ALL_TIME_WORDS,
  EU27,
  EU_ALIASES,
  MONTH_NAMES,
  MONTHLY,
  MONTHLY_WORDS,
  UNIT_WORDS,
  type Concept,
} from '../concepts'
import type { ChartKind, Plan, TimeRange } from '../types'

/**
 * Reading a question: its words, places, years and periods, rankings ("top 5"), chart type and
 * unit, plus small helpers shared by the planner modules.
 */

export interface Parsed {
  text: string // normalised, padded with spaces for phrase matching
  words: string[]
}

export function parse(question: string): Parsed {
  const words = normalize(question)
    .replace(/[’']/g, ' ')
    .split(/[^a-z0-9-]+/)
    .filter(Boolean)
  return { text: ` ${words.join(' ')} `, words }
}

export function matches(p: Parsed, stem: string): boolean {
  const s = stem.trim()
  // "word$": that exact word only.
  if (s.endsWith('$')) return p.words.includes(s.slice(0, -1))
  if (s.includes(' ')) return p.text.includes(` ${s}`)
  if (s.length <= 4) return p.words.some((w) => w === s || w === `${s}s` || w === `${s}es`)
  // Long stems also match inside German compounds: "stromverbrauch" contains "verbrauch".
  if (s.length >= 7) return p.words.some((w) => w.includes(s))
  return p.words.some((w) => w.startsWith(s))
}

export const any = (p: Parsed, stems: string[]) => stems.some((s) => matches(p, s))
export const find = <T extends Concept>(p: Parsed, list: T[]) => list.filter((c) => any(p, c.stems))

// ---------- geography ----------

export function detectGeos(p: Parsed, codelists: EnergyCodelists): { codes: string[]; eu: boolean } {
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

export function detectTop(p: Parsed): Plan['top'] {
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

/**
 * What the question asks about, beyond what to show: "which country is the most dependent?",
 * "welche Quelle ist am größten?", "quel pays consomme le plus ?" → which (the highest or the
 * lowest); "how has it changed since 2010?", "wie hat sich … entwickelt?", "comment a évolué…" →
 * change. Plain requests ("oil consumption in Spain") have no focus.
 */
export function detectFocus(p: Parsed): Plan['focus'] {
  const superlative = LOWEST_WORDS.test(p.text) || HIGHEST_WORDS.test(p.text)
  if ((WHICH_WORDS.test(p.text) && superlative) || /\b(top|bottom)\s+\d/.test(p.text)) {
    // "The most" wins over a "least" later in the sentence only when it comes first.
    const low = p.text.search(LOWEST_WORDS)
    const high = p.text.search(HIGHEST_WORDS)
    const bottom = /\bbottom\s+\d/.test(p.text)
    return {
      kind: 'which',
      ...(bottom || (low >= 0 && (high < 0 || low < high)) ? { lowest: true } : {}),
      ...(PERIOD_WORDS.test(p.text) ? { period: true } : {}),
    }
  }
  if (CHANGE_WORDS.test(p.text)) return { kind: 'change' }
  return undefined
}

const PERIOD_WORDS = /\b((which|what) (year|month|period)|when|welche[nms]? (jahr|monat)|in welchem (jahr|monat)|wann|quel(le)? (annee|mois|periode)|quand)\b/
const WHICH_WORDS = /\b(which|who|what|when|wann|quand|welche[nrms]?|wer|quel(le)?s?|lequel|laquelle|lesquel(le)?s|qui)\b/
const CHANGE_WORDS =
  /\b(chang(e|ed|es|ing)|evolv(e|ed|ing)|evolution|develop(ed|ment)|grow(n|th)?|grew|increas(e|ed|es)|decreas(e|ed|es)|ris(e|en)|rose|f[ae]ll(en)?|drop(ped)?|trend|verander(ung|t)|entwick(lung|elt)|gestiegen|gesunken|zugenommen|abgenommen|evolue|augment(e|ation)|diminu(e|tion)|baisse|hausse)\b/

const RANKED_SUBJECT = /\b(countr(y|ies)|member states?|states|ones|who|lander|land|staaten|pays|etats)\b/
const LOWEST_WORDS = /\b(least|lowest|smallest|fewest|am wenigsten|am niedrigsten|am kleinsten|les moins|le moins|la moins|les plus faibles|les plus bas)\b/
const HIGHEST_WORDS = /\b(the most|most \w+|highest|largest|biggest|am meisten|am \w+sten|les plus|le plus|la plus)\b/

/** Places named in free text (EU27 countries, neighbours, the EU itself). */
export function placesInText(text: string, codelists: EnergyCodelists): { codes: string[]; eu: boolean } {
  return detectGeos(parse(text), codelists)
}

// ---------- time ----------

export interface TimeIntent {
  range: TimeRange | null
  /** "last N years/months" before conversion to the dataset's frequency. */
  lastUnit?: 'year' | 'month'
  years: number[]
  month?: { year: number; month: number }
  monthly: boolean
}

export function detectTime(p: Parsed): TimeIntent {
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
export function periodFor(freq: string, year: string | number, end: boolean, month?: number): string {
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
export function requestedUnit(p: Parsed, ds: DatasetInfo): string | undefined {
  for (const entry of UNIT_WORDS) {
    if (!any(p, entry.stems)) continue
    const hit = entry.units.find((u) => ds.units.includes(u))
    if (hit) return hit
  }
  return undefined
}

// ---------- helpers ----------

export const freqOf = (ds: DatasetInfo) => ds.dimensions.find((d) => d.id === 'freq')?.codes[0] ?? 'A'
export const has = (ds: DatasetInfo, dim: string, code: string) =>
  ds.dimensions.find((d) => d.id === dim)?.codes.includes(code) ?? false

/** Keeps only codes the dataset has; falls back to `fallback` when none survive. */
export function keep(ds: DatasetInfo, dim: string, codes: string[], fallback?: string): string | string[] | undefined {
  const ok = codes.filter((c) => has(ds, dim, c))
  if (ok.length > 1) return ok
  if (ok.length === 1) return ok[0]
  return fallback && has(ds, dim, fallback) ? fallback : ds.dimensions.find((d) => d.id === dim)?.codes[0]
}


export function detectChart(p: Parsed): ChartKind | undefined {
  return (Object.keys(CHART_WORDS) as ChartKind[]).find((k) => any(p, CHART_WORDS[k]))
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
