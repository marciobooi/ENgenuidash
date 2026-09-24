import {
  codeLabel,
  describeDataset,
  fetchEurostatData,
  pick,
  searchDatasets,
  type DatasetInfo,
  type EnergyCodelists,
  type EnergyDictionary,
  type EurostatResult,
} from '../data/eurostat'
import { unitFromText } from '../genui/planner'
import { normalize } from './energyScope'
import { findDefinitions } from './glossary'
import { searchKnowledge, type Passage } from './knowledge'

/**
 * Retrieval step ("grounding"): finds the Eurostat datasets that match a question, fetches a
 * small, filtered slice of the best one and turns it into plain text the model can quote.
 * A 360M model knows little about energy statistics, so answers must come from this data.
 */

export interface Source {
  code: string
  title: string
  url: string
}

export interface Grounding {
  /** Text block appended to the question for the model, or null when nothing was found. */
  context: string | null
  sources: Source[]
}

/**
 * Dictionary description of the best-matching dataset (dimensions, allowed units). Only one, and
 * without example codes: a 360M model gets confused by several cards and describes the examples.
 */
function datasetInfo(dict: EnergyDictionary, codelists: EnergyCodelists, code: string): string {
  return describeDataset(dict, codelists, code, 'en', { examples: false })
}

const join = (...parts: (string | null)[]) => parts.filter(Boolean).join('\n\n') || null

const KIND_LABEL: Record<Passage['kind'], string> = { metadata: 'Metadata', article: 'Article', glossary: 'Glossary' }

/** Passages from our Eurostat knowledge base, formatted for the model (with source and date). */
function background(passages: Passage[]): string | null {
  if (!passages.length) return null
  const lines = passages.map((p) => {
    const where = [p.title, p.section].filter(Boolean).join(' › ')
    const text = p.text.length > 650 ? `${p.text.slice(0, 650).replace(/\s+\S*$/, '')}…` : p.text
    return `- ${where}${p.date ? ` (${p.date})` : ''}: ${text}`
  })
  return `Background from Eurostat documents (figures in them may be older than the Eurostat data):\n${lines.join('\n')}`
}

function passageSources(passages: Passage[]): Source[] {
  return passages.filter((p) => p.url).map((p) => ({ code: KIND_LABEL[p.kind], title: p.section ? `${p.title} › ${p.section}` : p.title, url: p.url! }))
}

const STOPWORDS = new Set(
  (
    'what which who how many much is are was were the a an of in on for to and or by from with about ' +
    'show tell give me please data value values share level levels there their its it this that ' +
    'was ist sind der die das ein eine von im in für und oder wie viel viele welche zeige mir bitte ' +
    'quel quelle quels quelles est sont le la les un une des du de en pour et ou combien montre moi ' +
    'eu europe european union country countries land länder pays year years jahr jahre année années'
  ).split(' '),
)

const EU_ALIASES = ['eu', 'eu27', 'eu-27', 'european union', 'europaische union', 'union europeenne', 'europe']
const MAX_GEOS = 5
const MAX_PERIODS = 8
const FETCH_TIMEOUT_MS = 8000

const words = (text: string) => normalize(text).split(/[^a-z0-9]+/).filter(Boolean)

/** Content words with a light plural trim, so "renewables" finds "renewable". */
function searchTerms(question: string): string[] {
  return words(question)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 5 && w.endsWith('s') ? w.slice(0, -1) : w))
}

function extractYears(question: string): string[] {
  return [...new Set(question.match(/\b(19[5-9]\d|20[0-4]\d)\b/g) ?? [])].sort()
}

function detectGeos(question: string, ds: DatasetInfo, codelists: EnergyCodelists): string[] {
  const geoDim = ds.dimensions.find((d) => d.id === 'geo')
  if (!geoDim) return []
  const text = ` ${words(question).join(' ')} `
  const found: string[] = []

  if (EU_ALIASES.some((a) => text.includes(` ${a} `))) {
    const eu = geoDim.codes.find((c) => c === 'EU27_2020') ?? geoDim.codes.find((c) => c.startsWith('EU'))
    if (eu) found.push(eu)
  }
  for (const code of geoDim.codes) {
    const labels = codelists.codelists[geoDim.codelist ?? 'GEO']?.codes[code]
    for (const label of Object.values(labels ?? {})) {
      if (typeof label !== 'string') continue
      const name = words(label.replace(/\(.*?\)/g, '')).join(' ')
      if (name.length > 2 && text.includes(` ${name} `) && !found.includes(code)) found.push(code)
    }
  }
  return found.slice(0, MAX_GEOS)
}

/** Picks one code per non-geo, non-time dimension: best label match, else TOTAL, else the first code. */
function chooseFilters(ds: DatasetInfo, question: string, codelists: EnergyCodelists) {
  const qWords = new Set(searchTerms(question))
  const filters: Record<string, string> = {}
  const selection: string[] = []

  for (const dim of ds.dimensions) {
    if (dim.id === 'geo' || !dim.codes.length) continue
    let best = dim.id === 'freq' && dim.codes.includes('A') ? 'A' : dim.codes.includes('TOTAL') ? 'TOTAL' : dim.codes[0]
    let bestScore = 0
    if (dim.id !== 'freq') {
      for (const code of dim.codes) {
        const label = codeLabel(codelists, dim.codelist, code, 'en')
        const labelWords = searchTerms(label)
        const score = labelWords.filter((w) => qWords.has(w)).length / Math.max(labelWords.length, 1)
        if (score > bestScore) {
          bestScore = score
          best = code
        }
      }
    }
    filters[dim.id] = best
    if (dim.id !== 'freq') selection.push(`${dim.id} = ${codeLabel(codelists, dim.codelist, best, 'en')}`)
  }
  return { filters, selection }
}

function formatData(result: EurostatResult, ds: DatasetInfo, selection: string[], lang: string): string | null {
  const geos = result.dimensions.geo?.codes ?? [{ code: '', label: '' }]
  const periods = (result.dimensions.time?.codes ?? []).slice(-MAX_PERIODS)
  const byKey = new Map(result.observations.map((o) => [`${o.keys.geo ?? ''}|${o.keys.time}`, o]))

  const lines: string[] = []
  const flags = new Set<string>()
  for (const g of geos) {
    const values = periods
      .map((p) => {
        const o = byKey.get(`${g.code}|${p.code}`)
        if (o?.value == null) return null
        if (o.flag) flags.add(o.flag)
        return `${p.label}: ${o.value}${o.flag ? ` (${o.flag})` : ''}`
      })
      .filter(Boolean)
    if (values.length) lines.push(`- ${g.label || 'Value'}: ${values.join('; ')}`)
  }
  if (!lines.length) return null

  const unit = result.dimensions.unit?.codes[0]?.label
  return [
    `Eurostat dataset ${ds.code}: "${pick(ds.title, lang)}" (last update ${ds.lastUpdate ?? 'n/a'}).`,
    selection.length ? `Selection: ${selection.join('; ')}.` : '',
    unit ? `Unit: ${unit}.` : '',
    'Values:',
    ...lines,
    flags.size ? `Flags: ${[...flags].map((f) => `${f} = ${FLAG_NAMES[f] ?? f}`).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const FLAG_NAMES: Record<string, string> = {
  p: 'provisional',
  e: 'estimated',
  b: 'break in time series',
  c: 'confidential',
  d: 'definition differs',
  u: 'low reliability',
  n: 'not significant',
  z: 'not applicable',
}

/** Finds sources and, when possible, a data slice for the question. Never throws. */
export async function groundQuestion(
  question: string,
  dict: EnergyDictionary | null,
  codelists: EnergyCodelists | null,
  lang: string,
  signal?: AbortSignal,
  /**
   * Fetch a data slice for the model. Off for "why/how" questions: they do not need numbers, and a
   * 360M model misreads tables (numbers belong on dashboards, which are built without the model).
   */
  { includeData = true }: { includeData?: boolean } = {},
): Promise<Grounding> {
  // Verified definitions for concepts in the question ("SIEC", "ktoe", "energy intensity"…).
  const definitions = findDefinitions(question)
  const glossary = definitions.length ? `Definitions:\n${definitions.map((d) => `- ${d}`).join('\n')}` : null
  if (!dict || !codelists) return { context: glossary, sources: [] }

  // Best passages from our own knowledge base (dataset metadata, articles, glossary).
  const searchDatasetsFirst = searchDatasets(dict, searchTerms(question).join(' '), { codelists, limit: 1 })
  const passages = await searchKnowledge(question, { datasets: searchDatasetsFirst.map((d) => d.code) }).catch(() => [])
  const docs = background(passages)

  const query = searchTerms(question).join(' ')
  const matches = searchDatasets(dict, query, { codelists, limit: 3 })
  const datasetSources: Source[] = matches.map((ds) => ({
    code: ds.code,
    title: pick(ds.title, lang, ds.code),
    url: `https://ec.europa.eu/eurostat/databrowser/view/${ds.code}/default/table?lang=${lang}`,
  }))
  const sources = [...passageSources(passages), ...datasetSources].slice(0, 4)
  const best = matches[0]
  if (!best) return { context: join(glossary, docs), sources }
  const info = `Dataset information:\n${datasetInfo(dict, codelists, best.code)}`
  if (!includeData) return { context: join(glossary, docs, info), sources }

  const years = extractYears(question)
  const geos = detectGeos(question, best, codelists)
  const geoCodes = best.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const defaultGeo = geoCodes.includes('EU27_2020') ? ['EU27_2020'] : geoCodes.slice(0, 1)
  const { filters, selection } = chooseFilters(best, question, codelists)
  // Several units: never mix or invent them — the unit the question names, else the dictionary default.
  const unit = unitFromText(question, best) ?? best.defaults.unit
  if (best.multipleUnits && unit) {
    filters.unit = unit
    const i = selection.findIndex((x) => x.startsWith('unit ='))
    const label = `unit = ${codeLabel(codelists, 'UNIT', unit, 'en')}`
    if (i >= 0) selection[i] = label
    else selection.push(label)
  }
  for (const [dim, code] of Object.entries(best.defaults)) if (dim !== 'unit' && code && dim in filters) filters[dim] = code

  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS)
  signal?.addEventListener('abort', () => timeout.abort(), { once: true })

  try {
    const result = await fetchEurostatData(best.code, {
      filters: { ...filters, ...(geoCodes.length ? { geo: geos.length ? geos : defaultGeo } : {}) },
      ...(years.length
        ? { sinceTimePeriod: years[0], untilTimePeriod: years[years.length - 1] }
        : { lastTimePeriod: 6 }),
      lang: 'en', // the model reads English best; the UI shows sources in the user's language
      signal: timeout.signal,
    })
    const data = formatData(result, best, selection, 'en')
    return { context: join(glossary, docs, info, data ? `Eurostat data:\n${data}` : null), sources }
  } catch {
    // Network error, timeout or a selection Eurostat rejects: answer from our documents and the dictionary.
    return { context: join(glossary, docs, info), sources }
  } finally {
    window.clearTimeout(timer)
  }
}
