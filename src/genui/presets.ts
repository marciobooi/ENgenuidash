import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { STRINGS } from '../i18n'
import { normalize } from '../llm/energyScope'
import { refinePlan } from './planner'
import { detectFocus, parse } from './planner/parse'
import type { Plan } from './types'

/**
 * Starter questions (the welcome screen offers four, picked at random): the headline energy
 * topics, each with the exact plan of the Eurostat indicator behind it (dataset, codes, unit), so a
 * click always opens the right dashboard. The texts (EN/DE/FR) are in i18n (`starterQuestions`); typed in the
 * chat, the same questions go through the planner like any other.
 *
 * GHG emissions use env_air_gge (the energy sectors' fuel combustion, CRF 1.A), filed by
 * Eurostat under the environment. Households per capita use sdg_07_20 (SDG indicators).
 */

export type PresetId =
  | 'efficiency'
  | 'renewables'
  | 'ghg'
  | 'intensity'
  | 'productivity'
  | 'imports'
  | 'fossil'
  | 'householdsPerCapita'
  | 'byProduct'
  | 'bySector'
  | 'householdUses'
  | 'transport'
  | 'road'
  | 'services'
  | 'industry'
  | 'nonEnergy'
  | 'production'
  | 'combustible'
  | 'supply'
  | 'gae'

// Main products of the simplified energy balance (nrg_bal_s).
const BAL_PRODUCTS = ['C0000X0350-0370', 'C0350-0370', 'P1000', 'S2000', 'G3000', 'O4000XBIO', 'RA000', 'W6100_6220', 'N900H', 'E7000', 'H8000']
const TRANSPORT_FUELS = ['G3000', 'O4630', 'O4652XR5210B', 'O4671XR5220B', 'R5210P', 'R5210B', 'R5220P', 'R5220B', 'R5290', 'R5300', 'E7000']

const base = { filters: { freq: 'A', geo: 'EU27_2020' }, time: { kind: 'last', n: 15 } } as const
const plan = (dataset: string, filters: Plan['filters'], intent: Plan['intent']): Plan => ({
  dataset,
  filters: { ...base.filters, ...filters },
  time: { ...base.time },
  intent,
})
// Parts of a whole (by product, by sector, by use): the composition view (donut, stacked shares).
const mix = (dataset: string, filters: Plan['filters']) => plan(dataset, filters, 'mix')
const trend = (dataset: string, filters: Plan['filters']) => plan(dataset, filters, 'trend')

export const PRESETS: Record<PresetId, Plan> = {
  // Primary and final energy consumption: two measures, not parts of a total (lines, no shares).
  efficiency: { ...trend('nrg_ind_eff', { nrg_bal: ['FEC_EED', 'PEC_EED'], unit: 'MTOE' }), parts: false },
  renewables: trend('nrg_ind_ren', { nrg_bal: ['REN', 'REN_TRA', 'REN_ELC', 'REN_HEAT_CL'], unit: 'PC' }),
  ghg: mix('env_air_gge', { airpol: 'GHG', src_crf: ['CRF1A1', 'CRF1A2', 'CRF1A3', 'CRF1A4A', 'CRF1A4B', 'CRF1A4C', 'CRF1A5'], unit: 'THS_T' }),
  intensity: trend('nrg_ind_ei', { nrg_bal: 'EI_GDP_CLV05', unit: 'KGOE_TEUR' }),
  productivity: trend('nrg_ind_ep', { unit: 'EUR_KGOE' }),
  imports: trend('nrg_ind_id', { siec: ['G3000', 'O4000XBIO', 'O4100_TOT', 'O4200'], unit: 'PC' }),
  fossil: trend('nrg_ind_ffgae', { unit: 'PC' }),
  householdsPerCapita: trend('sdg_07_20', { unit: 'KGOE' }),
  byProduct: mix('nrg_bal_s', { nrg_bal: 'FC_E', siec: BAL_PRODUCTS, unit: 'KTOE' }),
  bySector: mix('nrg_bal_s', { siec: 'TOTAL', nrg_bal: ['FC_IND_E', 'FC_OTH_AF_E', 'FC_OTH_CP_E', 'FC_OTH_FISH_E', 'FC_OTH_HH_E', 'FC_OTH_NSP_E', 'FC_TRA_E'], unit: 'KTOE' }),
  householdUses: mix('nrg_d_hhq', { siec: 'TOTAL', nrg_bal: ['FC_OTH_HH_E_SH', 'FC_OTH_HH_E_SC', 'FC_OTH_HH_E_WH', 'FC_OTH_HH_E_CK', 'FC_OTH_HH_E_LE', 'FC_OTH_HH_E_OE'], unit: 'TJ' }),
  transport: mix('nrg_bal_c', { nrg_bal: 'FC_TRA_E', siec: [...TRANSPORT_FUELS, 'O4661XR5230B', 'O4680'], unit: 'KTOE' }),
  road: mix('nrg_bal_c', { nrg_bal: 'FC_TRA_ROAD_E', siec: TRANSPORT_FUELS, unit: 'KTOE' }),
  services: mix('nrg_bal_s', { nrg_bal: 'FC_OTH_CP_E', siec: ['C0000X0350-0370', 'E7000', 'G3000', 'H8000', 'O4000XBIO', 'RA000', 'W6100_6220'], unit: 'KTOE' }),
  industry: mix('nrg_bal_s', { nrg_bal: 'FC_IND_E', siec: BAL_PRODUCTS, unit: 'KTOE' }),
  nonEnergy: mix('nrg_bal_s', { nrg_bal: 'FC_NE', siec: ['C0000X0350-0370', 'C0350-0370', 'G3000', 'O4000XBIO', 'P1000', 'RA000', 'S2000'], unit: 'KTOE' }),
  production: mix('nrg_ind_peh', {
    plants: 'TOTAL',
    operator: 'TOTAL',
    nrg_bal: 'GEP',
    siec: ['CF', 'RA100', 'RA130', 'RA200', 'RA300', 'RA400', 'RA500', 'N9000', 'X9900', 'X9900H'],
    unit: 'GWH',
  }),
  combustible: mix('nrg_ind_pehcf', {
    plants: 'TOTAL',
    operator: 'TOTAL',
    nrg_bal: 'GEP',
    siec: ['C0110', 'C0121', 'C0129', 'C0210', 'C0220', 'C0311', 'C0312', 'C0320', 'C0330', 'C0340', 'C0350', 'C0360', 'C0371', 'C0379'],
    unit: 'GWH',
  }),
  supply: mix('nrg_bal_s', { nrg_bal: 'NRGSUP', siec: BAL_PRODUCTS, unit: 'KTOE' }),
  gae: mix('nrg_bal_s', { nrg_bal: 'GAE', siec: BAL_PRODUCTS, unit: 'KTOE' }),
}

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

/** `n` different starter topics, in random order (a new set at each start). */
export function pickPresets(n: number, random: () => number = Math.random): PresetId[] {
  const ids = [...PRESET_IDS]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids.slice(0, n)
}

// ---------- typed questions that name a starter topic ----------

// Words that carry no topic: articles, prepositions, filler, time and place words (the place and
// period of a typed question are applied on top of the topic's plan, see presetPlan).
const IGNORED = new Set(
  (
    'the a an of in for by to and from at on per show me what how has have is are was were do does use ' +
    'eu ue union european europe europaische europeenne ' +
    'der die das des dem den ein eine im in nach von fur und aus an am zu pro ' +
    'le la les l d de du des un une et en par dans au aux a quel quelle quels quelles ' +
    'since last years year seit letzten jahre jahren depuis dernieres dernieres annees ans between bis'
  ).split(/\s+/),
)
const contentWords = (text: string) =>
  normalize(text)
    .replace(/[’']/g, ' ')
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 1 && !IGNORED.has(w) && !/\d/.test(w))
// Same word, allowing plural and case endings ("fuel"/"fuels", "Energieträger"/"Energieträgern"):
// equal without the ending, or sharing their first 8 letters. Not just "Energie…": German
// compounds ("Energieimportabhängigkeit", "Energieproduktivität") differ after it.
const stem = (w: string) => w.replace(/(es|en|s|n|e)$/, '')
const same = (a: string, b: string) => {
  if (a === b || stem(a) === stem(b)) return true
  const k = Math.min(8, a.length, b.length)
  return k >= 7 && a.slice(0, k) === b.slice(0, k)
}

/**
 * The starter topic a typed question names, if any: it must contain (nearly) all of a topic
 * question's words, in any language, and little else apart from places and periods.
 */
export function matchPreset(text: string, isPlaceWord: (word: string) => boolean): PresetId | null {
  const words = contentWords(text).filter((w) => !isPlaceWord(w))
  if (!words.length) return null
  let best: { id: PresetId; score: number } | null = null
  for (const id of PRESET_IDS) {
    for (const lang of ['en', 'de', 'fr'] as const) {
      const topic = contentWords(STRINGS[lang].starterQuestions[id])
      if (!topic.length) continue
      const covered = topic.filter((t) => words.some((w) => same(w, t))).length / topic.length
      const precise = words.filter((w) => topic.some((t) => same(w, t))).length / words.length
      const score = covered + precise
      if (covered >= 0.8 && precise >= 0.7 && (!best || score > best.score)) best = { id, score }
    }
  }
  return best?.id ?? null
}

/**
 * The plan for a typed question that names a starter topic: the topic's exact plan, with the
 * places and period of the question applied ("… by type of fuel in Germany since 2010").
 */
export function presetPlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  const places = placeWords(codelists)
  const id = matchPreset(text, (w) => places.has(w))
  if (!id) return null
  const preset = PRESETS[id]
  const topic = contentWords(STRINGS.en.starterQuestions[id])
  // What the question adds to the topic (places, years): applied like a follow-up.
  const rest = normalize(text)
    .replace(/[’']/g, ' ')
    .split(/[^a-z0-9-]+/)
    .filter((w) => w && !topic.some((t) => same(w, t)))
    .join(' ')
  const plan = (rest && refinePlan(preset, rest, dict, codelists)) || preset
  // "How has … developed?", "which country …?": the question's focus (an answer card first).
  const focus = detectFocus(parse(text))
  return focus ? { ...plan, focus } : plan
}

const placeCache = new WeakMap<EnergyCodelists, Set<string>>()
function placeWords(codelists: EnergyCodelists): Set<string> {
  let set = placeCache.get(codelists)
  if (!set) {
    set = new Set<string>()
    // Country names only (two-letter codes): aggregate labels ("Euro area (from 2015)", "à partir
    // de 2015") would make ordinary words ("partir") places.
    for (const [code, labels] of Object.entries(codelists.codelists.GEO?.codes ?? {}) as [string, Record<string, string>][]) {
      if (!/^[A-Z]{2}$/.test(code)) continue
      for (const [k, v] of Object.entries(labels)) if (k !== 'parent') for (const w of normalize(v).split(/[^a-z0-9-]+/)) if (w.length > 2) set.add(w)
    }
    placeCache.set(codelists, set)
  }
  return set
}
