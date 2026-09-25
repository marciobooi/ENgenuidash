import type { DatasetInfo, EnergyCodelists, EnergyDictionary } from '../../data/eurostat'
import { normalize } from '../../llm/energyScope'
import {
  ADD_WORDS,
  ONLY_WORDS,
  ALL_COUNTRIES_WORDS,
  CHART_WORDS,
  REMOVE_WORDS,
  TREND_WORDS,
  ALL_TIME_WORDS,
  EU_ALIASES,
  EXPLAIN_WORDS,
  MONTH_NAMES,
  MONTHLY_WORDS,
  FLOWS,
  METRICS,
  PRODUCTS,
} from '../concepts'
import { codesFor, key, matchTopic, topicIndex } from '../datasetSearch'
import { parse, matches, detectGeos } from './parse'

/**
 * The bridge to the dictionary search (../datasetSearch.ts): which dataset and codes a question is
 * about when the hand-written concepts do not cover it, and sensible default codes.
 */

// ---------- dictionary search ----------

// Words the planner already uses for places, time, charts and rankings: never topic words.
export const NON_TOPIC = new Set(
  [ALL_TIME_WORDS, MONTHLY_WORDS, TREND_WORDS, ALL_COUNTRIES_WORDS, EXPLAIN_WORDS, EU_ALIASES, ADD_WORDS, ONLY_WORDS, REMOVE_WORDS, Object.keys(MONTH_NAMES), ...Object.values(CHART_WORDS)]
    .flat()
    .flatMap((t) => normalize(t).split(/[^a-z0-9]+/))
    .filter((w) => w.length >= 3),
)

/**
 * The dictionary's view of a question: a dataset when its title names a topic the hand-written
 * concepts do not cover, a product code otherwise, and `unknown` when a topic word is found
 * nowhere (neither in the concepts nor in the dictionary).
 */
export function topicFromDictionary(question: string, dict: EnergyDictionary, codelists: EnergyCodelists, monthly: boolean, exclude: string[] = []) {
  const index = topicIndex(dict, codelists)
  const p = parse(question)
  const places = detectGeos(p, codelists)
  const match = matchTopic(index, question, { ignore: NON_TOPIC, monthly, noPlace: !places.codes.length && !places.eu, exclude })
  if (!match) return null
  // Keys the hand-written concepts explain ("gas", "imports", "consumption"…).
  const concepts = [...PRODUCTS, ...FLOWS, ...METRICS]
  // Words of multi-word concepts found in the question ("gaz naturel" → gaz, naturel).
  const phraseWords = concepts.flatMap((c) => c.stems.filter((st) => st.includes(' ') && matches(p, st)).flatMap((st) => st.split(' ')))
  const explained = new Set([
    // The question's words and the parts of split compounds ("Kohleverbrauch" → kohle, verbrauch).
    ...[...p.words, ...match.words].filter((w) => concepts.some((c) => c.stems.some((st) => matches(parse(w), st)))).map(key),
    ...phraseWords.map((w) => key(normalize(w))),
    // "Energy" alone names no particular topic: it must not move a question off the balances.
    ...['energy', 'energie', 'energies'].map(key),
  ])
  const unknown = match.unmatched.some((w) => !explained.has(key(w)) && !NON_TOPIC.has(w))
  const found = dict.datasets[match.dataset]
  const hasPartner = found?.dimensions.some((d) => d.id === 'partner') ?? false
  const newTopic = match.titleWords.some((k) => !explained.has(k)) || (!!match.partner && hasPartner)
  const topic = { unknown, dataset: match.dataset, filters: match.filters, partner: hasPartner ? match.partner : undefined, siec: undefined as string | undefined }
  if (newTopic) return topic

  // No new topic in a title: the words the rules do not know name a product or a flow. Use the
  // complete balances when they have it ("peat", "biodiesel"), else the dataset that covers
  // more of those words ("LNG" → Liquefied natural gas in the gas imports, not LPG in the balance).
  const rest = match.keys.filter((k) => !explained.has(k))
  if (!rest.length) return { ...topic, dataset: undefined, filters: {} }
  const inBalance = dict.datasets.nrg_bal_c ? codesFor(index, dict.datasets.nrg_bal_c, rest) : null
  const inMatch = found ? codesFor(index, found, rest) : null
  if (inBalance?.codes.siec && inBalance.used.size >= (inMatch?.used.size ?? 0)) return { ...topic, dataset: undefined, filters: {}, siec: inBalance.codes.siec }
  if (inMatch?.used.size) return topic
  return { ...topic, dataset: undefined, filters: {} }
}

export const ORIGIN = / (by|per) (country of origin|origin|partner|partner country)| nach (herkunft\w*|partnerland\w*)| par (pays d origine|origine|partenaire|pays partenaire)/

// Dimensions that are a breakdown (steam, gas turbine, combined cycle…) rather than a measure:
// with no total, all their codes become the series.
export const BREAKDOWN_DIMS = ['gen_tech', 'hp_tech', 'plants', 'tra_mode', 'customer', 'network']

/** The code to use for a dimension the question says nothing about. */
export function defaultCode(ds: DatasetInfo, dimId: string, codelists: EnergyCodelists): string | undefined {
  const dim = ds.dimensions.find((d) => d.id === dimId)
  if (!dim) return undefined
  if (dim.codes.includes('TOTAL')) return 'TOTAL'
  const label = (c: string) => (dim.codelist ? codelists.codelists[dim.codelist]?.codes[c]?.en ?? '' : '')
  // A total by another name; for stocks, the closing stock on the national territory.
  return (
    dim.codes.find((c) => /^(total|all )/i.test(label(c))) ??
    dim.codes.find((c) => ['STKCL_NAT', 'STK_CL', 'WORLD', 'EXT_EU27_2020'].includes(c)) ??
    dim.codes[0]
  )
}
