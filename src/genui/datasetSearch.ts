import type { DatasetInfo, EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { normalize } from '../llm/energyScope'
import { isFunctionWord } from '../llm/vocabulary'

/**
 * Finds the dataset and codes a question is about by searching the Eurostat dictionary itself:
 * dataset titles and the labels of the codes each dataset uses (products, flows, plant types,
 * stock flows…), in English, German and French. This is what lets the planner reach all 141
 * energy datasets ("solar capacity in Spain" → electricity production capacities, "gas storage"
 * → stock levels, "wood pellets" → supply of biomass) instead of only the topics that have
 * hand-written rules.
 *
 * Scoring is IDF-weighted word overlap: a question word found in a dataset's title counts 2.5
 * times as much as one found in its code labels, and rare words ("capacity", "stock", "pellets")
 * count far more than common ones ("energy", "consumption").
 */

// Dimensions whose code labels describe the topic. Countries (geo, partner), time, units, prices
// and economic sectors (NACE: 50+ long labels) are left out.
const TOPIC_DIMS = ['siec', 'nrg_bal', 'plant_tec', 'plants', 'stk_flow', 'hp_tech', 'gen_tech', 'nrg_tech', 'tra_mode', 'customer', 'network', 'indic_nrg', 'operator']

// Words that mean the same as a title word in another form ("storage" ↔ "stock levels").
const SYNONYMS: Record<string, string> = {
  storage: 'stock', stored: 'stock', reserve: 'stock', reserves: 'stock', speicher: 'stock', gasspeicher: 'stock', stockage: 'stock',
  // Titles say "by partner country" where people say "by country of origin".
  origin: 'partner', herkunft: 'partner', herkunftsland: 'partner', origine: 'partner', provenance: 'partner',
}

// Abbreviations → the words of the product's label. They name a product (a code label), so they
// never count as title words ("LNG imports" is about imports of liquefied natural gas, not
// "stock levels for … liquefied gas").
// "Power plants" in these statistics means electricity production capacity.
const CAPACITY = ['electricity', 'production', 'capacity']
const EXPANSIONS: Record<string, string[]> = {
  kraftwerk: CAPACITY, kraftwerke: CAPACITY, centrale: CAPACITY, centrales: CAPACITY,
  kernkraftwerk: ['nuclear', ...CAPACITY], kernkraftwerke: ['nuclear', ...CAPACITY],
}

const PRODUCT_SYNONYMS: Record<string, string[]> = {
  lng: ['liquefied', 'natural', 'gas'],
  lpg: ['liquefied', 'petroleum', 'gases'],
  chp: ['combined', 'heat', 'power'],
}

// Words that describe the request, not the topic, and prepositions the stop-word list lacks.
const REQUEST_WORDS = new Set(
  ('data dataset datasets statistics statistic eurostat figures numbers value values level levels trend total amount chart table map show country countries member states eu europe european union ' +
    'aus nach bei uber unter zwischen durch gegen ohne als pour par sur sous entre vers chez selon into onto within across per').split(' '),
)

const words = (text: string) =>
  normalize(text)
    .replace(/[’']/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

/**
 * Matching key: a light stem, so "capacity"/"capacities", "import"/"imports",
 * "generating"/"generation" meet while "production" and "productivity" stay apart.
 */
export const key = (w: string) => {
  let s = w
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`
  else if (s.length > 4 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  if (s.length > 6) s = s.replace(/(ing|ion|en|er)$/, '')
  if (s.length > 5 && s.endsWith('e')) s = s.slice(0, -1) // German plural: Importe
  return s.slice(0, 9)
}

export interface TopicIndex {
  /** title: keys of all three titles; titleEn: keys of the English title (to measure coverage). */
  datasets: { ds: DatasetInfo; title: Set<string>; titleEn: Set<string>; labels: Set<string> }[]
  /** Every key in the dictionary (titles and topic labels). */
  all: Set<string>
  idfTitle: Map<string, number>
  idfLabel: Map<string, number>
  codelists: EnergyCodelists
  /** Partner country names (EN/DE/FR, normalised) → code. */
  partners: Map<string, string>
  /** Words of country and region names (never topic words). */
  places: Set<string>
}

const cache = new WeakMap<EnergyDictionary, TopicIndex>()

export function topicIndex(dict: EnergyDictionary, codelists: EnergyCodelists): TopicIndex {
  const cached = cache.get(dict)
  if (cached) return cached
  const labelsOf = (ds: DatasetInfo) => {
    const out = new Set<string>()
    for (const dim of ds.dimensions) {
      if (!TOPIC_DIMS.includes(dim.id) || !dim.codelist) continue
      for (const code of dim.codes) {
        for (const [lang, label] of Object.entries(codelists.codelists[dim.codelist]?.codes[code] ?? {})) {
          if (lang !== 'parent' && typeof label === 'string') for (const w of words(label)) out.add(key(w))
        }
      }
    }
    return out
  }
  const datasets = Object.values(dict.datasets).map((ds) => ({
    ds,
    title: new Set(Object.values(ds.title).flatMap(words).map(key)),
    titleEn: new Set(words(ds.title.en ?? '').filter((w) => !isFunctionWord(w)).map(key)),
    labels: labelsOf(ds),
  }))
  const all = new Set(datasets.flatMap((d) => [...d.title, ...d.labels]))
  const idf = (sets: Set<string>[]) => {
    const df = new Map<string, number>()
    for (const s of sets) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1)
    return new Map([...df].map(([w, n]) => [w, Math.log(1 + sets.length / n)]))
  }
  const partners = new Map<string, string>()
  for (const [code, labels] of Object.entries(codelists.codelists.PARTNER?.codes ?? {})) {
    if (!/^[A-Z]{2}$/.test(code)) continue
    for (const [lang, label] of Object.entries(labels)) {
      if (lang !== 'parent' && typeof label === 'string') partners.set(words(label.replace(/\(.*?\)/g, '')).join(' '), code)
    }
  }
  const places = new Set<string>()
  for (const list of ['GEO', 'PARTNER']) {
    for (const labels of Object.values(codelists.codelists[list]?.codes ?? {})) {
      for (const [lang, label] of Object.entries(labels)) if (lang !== 'parent' && typeof label === 'string') for (const w of words(label)) places.add(w)
    }
  }
  const index = { datasets, all, places, idfTitle: idf(datasets.map((d) => d.title)), idfLabel: idf(datasets.map((d) => d.labels)), codelists, partners }
  cache.set(dict, index)
  return index
}

// "imports from Norway", "Gas aus Russland", "gaz en provenance de Norvège", "importé du Qatar"
const FROM = /\b(?:from|aus|von|en provenance d(?:e|u|es)|provenant d(?:e|u|es)|originating in|imported from|importe(?:s|e|es)? d(?:e|u|es))\s+(?:the |l |la |le |les |dem |der )?([a-z][a-z -]{1,40})/

/** Partner country named after "from" / "aus" / "en provenance de". */
export function partnerIn(question: string, index: TopicIndex): string | undefined {
  const text = words(question).join(' ')
  const m = text.match(FROM)
  if (!m) return undefined
  const rest = m[1].split(' ')
  // Longest country name first ("united states" before "united").
  for (let n = Math.min(4, rest.length); n >= 1; n--) {
    const code = index.partners.get(rest.slice(0, n).join(' '))
    if (code) return code
  }
  return undefined
}

export interface TopicMatch {
  dataset: string
  score: number
  /** Question words (matching keys) found in the dataset title. */
  titleWords: string[]
  /** Question words found nowhere in the dictionary. */
  unmatched: string[]
  /** Codes chosen from the labels, per dimension. */
  filters: Record<string, string>
  /** Matching keys of the question's topic words. */
  keys: string[]
  partner?: string
  /** Next best datasets (for tests and debugging). */
  runnersUp: { code: string; score: number }[]
}

/**
 * Best dataset for a question. `ignore` holds words already used for something else (places,
 * years, time and chart words), normalised.
 */
export function matchTopic(
  index: TopicIndex,
  question: string,
  {
    ignore = new Set<string>(),
    monthly = /\b(monthly|monatlich\w*|mensuel\w*)\b/.test(normalize(question)),
    noPlace = false,
    exclude = [],
  }: { ignore?: Set<string>; monthly?: boolean; noPlace?: boolean; exclude?: string[] } = {},
): TopicMatch | null {
  const partner = partnerIn(question, index)
  const text = normalize(question).replace(/\bpower (plant|station)s?\b/g, ' electricity production capacity ')
  const qWords = [
    ...new Set(words(text).filter((w) => !isFunctionWord(w) && !REQUEST_WORDS.has(w) && !ignore.has(w) && !index.places.has(w) && !/^\d+$/.test(w))),
  ]
  // Abbreviations become their label words; German compounds the dictionary does not know as a
  // whole are split: "gasimporte" → gas + importe.
  const productKeys = new Set(qWords.filter((w) => PRODUCT_SYNONYMS[w] && w !== 'chp').map((w) => key(PRODUCT_SYNONYMS[w][0])))
  const expanded = qWords.flatMap((w) => EXPANSIONS[w] ?? PRODUCT_SYNONYMS[w] ?? (index.all.has(key(w)) ? [w] : splitCompound(w, index.all) ?? [w]))
  // Each question word matches as itself or as its synonym ("storage" → storage | stock).
  const groups = [...new Map(expanded.map((w) => [key(w), [...new Set([key(w), ...(SYNONYMS[w] ? [key(SYNONYMS[w])] : [])])]])).values()]
  const keys = [...new Set(groups.flat())]
  if (!keys.length) return null

  let best: { d: TopicIndex['datasets'][number]; score: number; titleWords: string[] } | null = null
  const ranking: { code: string; score: number }[] = []
  for (const d of index.datasets) {
    const code = d.ds.code
    if (exclude.includes(code)) continue
    let score = 0
    const titleWords: string[] = []
    for (const group of groups) {
      const inTitle = group.find((k) => d.title.has(k) && !productKeys.has(k))
      const inLabels = group.find((k) => d.labels.has(k))
      if (inTitle) {
        score += 2.5 * (index.idfTitle.get(inTitle) ?? 0)
        titleWords.push(inTitle)
      } else if (inLabels) score += index.idfLabel.get(inLabels) ?? 0
      // A question word this dataset does not cover at all costs ("solar capacity" should not
      // land on solar collectors' surface).
      else if (group.some((k) => index.all.has(k))) score -= 0.5 * Math.max(...group.map((k) => index.idfTitle.get(k) ?? 1))
    }
    if (score <= 0) continue
    // Prefer titles the question covers: every English title word it does not use costs a little
    // ("Imports of natural gas by partner country" beats "Natural gas import dependency by
    // country of origin" for "imports of natural gas from Norway").
    for (const t of d.titleEn) if (!keys.includes(t)) score -= 0.4 * (index.idfTitle.get(t) ?? 0)
    if (partner && d.ds.dimensions.some((x) => x.id === 'partner')) score += 3
    const isMonthly = /monthly|_m$|m$/.test(code) && d.ds.defaults.freq === 'M'
    if (isMonthly !== monthly) score -= 8
    // Historic series (until 2007), NUTS-2 regions and calorific-value tables only when nothing
    // else fits (or calorific values are asked for).
    if (/_h$|r2_/.test(code)) score -= 4
    // No place named: the EU total is shown, so datasets without one rank lower.
    if (noPlace && !d.ds.dimensions.find((x) => x.id === 'geo')?.codes.includes('EU27_2020')) score -= 3
    if (/cv$/.test(code) && !keys.some((k) => /^(calorif|heizwert)/.test(k))) score -= 6
    ranking.push({ code, score })
    if (!best || score > best.score) best = { d, score, titleWords }
  }
  if (!best || best.score <= 0) return null

  const unmatched = expanded.filter((w) => !index.all.has(key(w)) && !(SYNONYMS[w] && index.all.has(key(SYNONYMS[w]))))
  return {
    dataset: best.d.ds.code,
    score: best.score,
    titleWords: best.titleWords,
    unmatched,
    // Words in the dataset title name the dataset, not a code ("gas" in "gas storage").
    filters: codesFor(index, best.d.ds, keys.filter((k) => !best.d.title.has(k) || productKeys.has(k))).codes,
    keys,
    partner,
    runnersUp: ranking.sort((a, b) => b.score - a.score).slice(1, 3),
  }
}

/**
 * For each topic dimension of the dataset, the code whose label best matches the question
 * ("wood pellets" → R5111 Wood pellets, not R5110 Fuelwood, wood residues…). Dimensions with no
 * match are left to the dataset defaults.
 */
export function codesFor(index: TopicIndex, ds: DatasetInfo, keys: string[]): { codes: Record<string, string>; used: Set<string> } {
  const remaining = new Set(keys)
  const used = new Set<string>()
  const out: Record<string, string> = {}
  const dims = ds.dimensions.filter((d) => TOPIC_DIMS.includes(d.id) && d.codelist)
  // Greedy: the best (dimension, code) pair first; its words are then used up, so "wood pellets
  // consumption" gives siec = Wood pellets and nrg_bal = a consumption flow, not "…wood products".
  for (;;) {
    let best: { dim: string; code: string; score: number; used: string[] } | null = null
    for (const dim of dims) {
      if (out[dim.id]) continue
      for (const code of dim.codes) {
        for (const [lang, label] of Object.entries(index.codelists.codelists[dim.codelist!]?.codes[code] ?? {})) {
          if (lang === 'parent' || typeof label !== 'string') continue
          // Residual codes ("Other type of generation", "Other fuels n.e.c.") only when asked.
          if (/^(other|sonstig|autre)/i.test(label) && !remaining.has('other')) continue
          const lw = [...new Set(words(label).map(key))]
          const used = lw.filter((w) => remaining.has(w))
          if (!used.length) continue
          // Rare words decide ("biodiesel" over "production"); extra label words cost a little.
          const score = used.reduce((n, w) => n + (index.idfLabel.get(w) ?? 1), 0) - 0.1 * (lw.length - used.length)
          if (!best || score > best.score) best = { dim: dim.id, code, score, used }
        }
      }
    }
    if (!best || best.score <= 0) break
    out[best.dim] = best.code
    for (const w of best.used) {
      remaining.delete(w)
      used.add(w)
    }
  }
  return { codes: out, used }
}

/** Splits a compound into two known parts of 3+ letters ("gasimporte" → gas, importe). */
function splitCompound(w: string, known: Set<string>): string[] | null {
  if (w.length < 7) return null
  for (let i = 3; i <= w.length - 3; i++) {
    const a = w.slice(0, i)
    const b = w.slice(i)
    if (known.has(key(a)) && known.has(key(b))) return [a, b]
  }
  return null
}
