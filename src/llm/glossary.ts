import { normalize } from './energyScope'

/**
 * Energy glossary used to answer "what is …?" questions and to ground the model.
 *
 * Primary source: the official Eurostat Statistics Explained glossary, downloaded by
 * `npm run eurostat:glossary` into public/data/eurostat/energy/glossary.json (English only).
 * A few concepts that glossary does not cover (SIEC, energy balance, degree days, price bands)
 * have short curated definitions based on Eurostat methodology, marked `official: false`.
 */

export interface GlossaryEntry {
  term: string
  aliases: string[]
  /** Short answer (first paragraph). */
  summary: string
  /** Longer text for the model's context. */
  text: string
  url?: string
  official: boolean
}

interface GlossaryFile {
  entries: Omit<GlossaryEntry, 'official'>[]
}

const CURATED: GlossaryEntry[] = [
  {
    term: 'SIEC',
    aliases: ['siec', 'standard international energy product classification'],
    summary:
      'SIEC (Standard International Energy Product Classification) is the United Nations classification of energy products. Eurostat uses it for the "siec" dimension: products such as solid fossil fuels, natural gas, oil and petroleum products, renewables and biofuels, nuclear heat, electricity and heat, each with a code (e.g. G3000 = natural gas, E7000 = electricity).',
    text: '',
    url: 'https://unstats.un.org/unsd/energystats/methodology/siec/',
    official: false,
  },
  {
    term: 'Energy balance',
    aliases: ['energy balance', 'energy balances', 'nrg_bal', 'energiebilanz', 'bilan energetique'],
    summary:
      'An energy balance shows, for one country and year, how each energy product is produced, imported, exported, stored, transformed and finally consumed, in a common unit. Its rows are the "nrg_bal" codes (e.g. PPRD = primary production, IMP = imports, FC_E = final consumption - energy use).',
    text: '',
    url: 'https://ec.europa.eu/eurostat/web/energy/database/additional-data#Energy%20balances',
    official: false,
  },
  {
    term: 'Heating and cooling degree days',
    aliases: ['degree day', 'degree days', 'degree-day', 'heating degree days', 'cooling degree days', 'hdd', 'cdd', 'gradtag', 'gradtage', 'degre-jour', 'degres-jours'],
    summary:
      'Heating degree days (HDD) measure how cold a period was and so how much heating was needed: for each day with a mean outdoor temperature of 15 °C or less, Eurostat adds 18 °C minus the mean temperature. Cooling degree days (CDD) do the same for heat, for days above 24 °C, using 21 °C as the base.',
    text: '',
    url: 'https://ec.europa.eu/eurostat/cache/metadata/en/nrg_chdd_esms.htm',
    official: false,
  },
  {
    term: 'Consumption bands (energy prices)',
    aliases: ['consumption band', 'consumption bands', 'band dc', 'band d2', 'verbrauchsband', 'tranche de consommation'],
    summary:
      'Eurostat reports electricity and gas prices by annual consumption band. The standard household bands are DC (2 500 to 4 999 kWh of electricity per year) and D2 (20 to 199 GJ of gas per year); for non-household consumers the headline bands are ID (500 to 1 999 MWh) and I3 (10 000 to 99 999 GJ).',
    text: '',
    url: 'https://ec.europa.eu/eurostat/cache/metadata/en/nrg_pc_204_esmsip2.htm',
    official: false,
  },
  {
    term: 'Heat pump',
    aliases: ['heat pump', 'heat pumps', 'warmepumpe', 'warmepumpen', 'pompe a chaleur', 'pompes a chaleur'],
    summary:
      'A heat pump moves heat from a colder place (outside air, ground or water) to a warmer one, using electricity. The heat taken from the environment is counted by Eurostat as renewable "ambient heat" (SIEC RA600), which is why heat pumps raise the renewable share of heating.',
    text: '',
    url: 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Renewable_energy_statistics',
    official: false,
  },
]

/** Common wordings that should find an official entry under another name. */
const SYNONYMS: Record<string, string> = {
  ktoe: 'toe',
  mtoe: 'toe',
  'oil equivalent': 'toe',
  chp: 'co-generation',
  'combined heat and power': 'co-generation',
  cogeneration: 'co-generation',
  'import dependency': 'energy dependency rate',
  'energy import dependency': 'energy dependency rate',
  'dependency rate': 'energy dependency rate',
  importabhangigkeit: 'energy dependency rate',
  'dependance energetique': 'energy dependency rate',
  'gross inland consumption': 'gross inland energy consumption',
  'primary energy': 'primary energy consumption',
  'share of renewables': 'share of renewable energy in energy consumption',
  'renewables share': 'share of renewable energy in energy consumption',
  'renewable share': 'share of renewable energy in energy consumption',
  renewables: 'renewable energy sources',
  'renewable energy': 'renewable energy sources',
  gcv: 'gross calorific value',
  'calorific value': 'gross calorific value',
  'final consumption': 'final energy consumption',
  endenergieverbrauch: 'final energy consumption',
  'consommation finale': 'final energy consumption',
  energieintensitat: 'energy intensity',
  'intensite energetique': 'energy intensity',
  energieeffizienz: 'energy efficiency',
  'efficacite energetique': 'energy efficiency',
}

let official: GlossaryEntry[] = []
let loading: Promise<void> | null = null

/** Loads the official glossary (once). Until it has loaded, only curated entries are used. */
export function loadGlossary(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/eurostat/energy/glossary.json`)
    .then((r) => (r.ok ? (r.json() as Promise<GlossaryFile>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((file) => {
      official = file.entries.map((e) => ({ ...e, official: true }))
    })
    .catch(() => {
      loading = null
    })
  return loading ?? Promise.resolve()
}

const key = (s: string) => ` ${normalize(s).replace(/[^a-z0-9_-]+/g, ' ').trim()} `

/** Glossary entries whose name, alias or synonym appears in the text; longest match first. */
export function findEntries(text: string, limit = 2): GlossaryEntry[] {
  const t = key(text)
  const all = [...official, ...CURATED]
  const byName = new Map(all.flatMap((e) => [e.term, ...e.aliases].map((a) => [key(a), e] as const)))

  const hits: { entry: GlossaryEntry; length: number }[] = []
  const consider = (phrase: string, entry: GlossaryEntry | undefined) => {
    if (entry && t.includes(phrase) && !hits.some((h) => h.entry === entry)) hits.push({ entry, length: phrase.length })
  }
  for (const [phrase, entry] of byName) if (phrase.trim().length > 1) consider(phrase, entry)
  for (const [word, target] of Object.entries(SYNONYMS)) consider(key(word), byName.get(key(target)))

  // Prefer the most specific match ("energy dependency rate" over "energy").
  return hits
    .sort((a, b) => b.length - a.length)
    .slice(0, limit)
    .map((h) => h.entry)
}

/** Definitions for concepts in the text, formatted for the model's context. */
export function findDefinitions(text: string, limit = 2): string[] {
  return findEntries(text, limit).map((e) => {
    const body = e.text && e.text.length <= 700 ? e.text : e.summary
    return `${e.term}: ${body}${e.official ? ' (Eurostat glossary)' : ''}`
  })
}

const DEFINITION_QUESTION = /^(what|whats|define|definition|meaning|explain|was ist|was sind|was bedeutet|erklar|qu est|c est quoi|explique|definis|que signifie)\b/

/**
 * For "what is X?" questions about a glossary concept, the definition itself: answering with the
 * official text is more reliable than letting a 360M model paraphrase it. Null for other questions.
 */
export function directDefinition(question: string): GlossaryEntry | null {
  const q = normalize(question).replace(/[^a-z0-9' -]/g, ' ').replace(/'/g, ' ').replace(/\s+/g, ' ').trim()
  if (!DEFINITION_QUESTION.test(q)) return null
  // Only when the question is essentially "what is <concept>", not a data question.
  if (q.split(' ').length > 9 || /\b(19|20)\d\d\b/.test(q)) return null
  return findEntries(question, 1)[0] ?? null
}
