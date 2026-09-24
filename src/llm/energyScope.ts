import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'

/**
 * Topic guard: decides whether a question is about energy before it reaches the model.
 * A 360M model cannot reliably police its own scope, so off-topic questions never get to it.
 *
 * Signals (EN/DE/FR, accent-insensitive):
 *  1. Curated energy word stems ("electric", "strom", "énergi"…).
 *  2. Energy product and technology names from the Eurostat dictionary (SIEC, plant types…).
 *  3. Eurostat energy dataset codes (nrg_…, ten00124…).
 *  4. Short follow-ups ("and in Germany?", "what about 2020?") right after an energy question.
 */

// Word stems matched at the start of a word, so "electric" also matches "electricity".
// Stems of 4 letters or fewer only match the whole word (or its plural): "gas"/"gases",
// but not "gastronomy". Multi-word entries match as phrases.
const STEMS = [
  // energy / power
  'energ', 'énerg', 'power', 'strom', 'electric', 'elektri', 'électri', 'watt', 'kwh', 'mwh', 'gwh', 'twh',
  'joule', 'terajoule', 'toe', 'ktoe', 'mtoe', 'kilowatt', 'megawatt', 'gigawatt',
  // fossil fuels
  'fossil', 'fossile', 'coal', 'kohle', 'charbon', 'lignite', 'braunkohle', 'anthracite', 'coke', 'koks',
  'peat', 'torf', 'tourbe', 'oil', 'erdöl', 'petrol', 'pétrol', 'diesel', 'gasoline', 'benzin', 'kerosene',
  'kerosin', 'kérosène', 'naphtha', 'lpg', 'crude', 'rohöl', 'brut', 'gas', 'erdgas', 'gaz', 'lng', 'shale',
  // nuclear & renewables
  'nuclear', 'nuklear', 'kernkraft', 'kernenergie', 'nucléaire', 'uranium', 'uran', 'renewabl', 'erneuerbar',
  'renouvelable', 'solar', 'solaire', 'photovolta', 'wind', 'éolien', 'eolien', 'hydro', 'wasserkraft',
  'hydraul', 'geotherm', 'géotherm', 'tidal', 'gezeiten', 'marée', 'biomass', 'biomasse', 'biofuel',
  'biokraftstoff', 'biocarburant', 'biogas', 'biogaz', 'biodiesel', 'bioethanol', 'bioéthanol', 'pellet',
  'hydrogen', 'wasserstoff', 'hydrogène', 'ammonia', 'ammoniak', 'ammoniac', 'e-fuel',
  // heat, grid, infrastructure
  'heat', 'heating', 'wärme', 'chaleur', 'heizung', 'chauffage', 'cooling', 'kühl', 'refroid', 'degree day', 'gradtag',
  'degré-jour', 'fuel', 'brennstoff', 'kraftstoff', 'carburant', 'combustible', 'grid', 'stromnetz',
  'réseau électrique', 'power plant', 'kraftwerk', 'centrale', 'turbine', 'battery', 'batterie', 'heat pump',
  'wärmepumpe', 'pompe à chaleur', 'chp', 'cogeneration', 'kraft-wärme', 'cogénération', 'refiner',
  'raffiner', 'pipeline', 'interconnector',
  // policy & statistics
  'eurostat', 'siec', 'nrg_bal', 'energy balance', 'energiebilanz', 'bilan energetique', 'ktoe', 'import dependency', 'importabhängigkeit', 'dépendance énergétique', 'energy mix', 'efficien',
  'effizienz', 'efficacité', 'decarbon', 'dekarbon', 'décarbon', 'emission', 'co2', 'kohlenstoff',
  'tariff', 'tarif', 'kilowattstunde',
]

// Greetings and thanks are allowed through; the system prompt steers the reply back to energy.
const SMALL_TALK = /^(hi|hello|hey|hallo|guten (tag|morgen|abend)|bonjour|bonsoir|salut|thanks?( you)?|thank you|danke( schön)?|merci( beaucoup)?|ok(ay)?|help|hilfe|aide)[!.?\s]*$/i

const CODE_PATTERN = /\b(nrg_[a-z0-9_]+|ten\d{5}|sdg_07_\d{2}|tai\d{2})\b/i

// Codelists whose labels are energy terms (not countries, units or generic sectors).
const ENERGY_CODELISTS = ['SIEC', 'PLANT_TEC', 'PLANTS', 'GEN_TECH', 'HP_TECH', 'NRG_TECH', 'CRUDEOIL']

const GENERIC = new Set([
  'total', 'other', 'others', 'insgesamt', 'andere', 'sonstige', 'autres', 'autre', 'not', 'elsewhere',
  'specified', 'products', 'product', 'produkte', 'produits', 'and', 'und', 'et', 'of', 'the', 'des', 'der',
  'die', 'das', 'les', 'la', 'le', 'du', 'de', 'from', 'aus', 'with', 'mit', 'avec', 'non', 'nicht',
])

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const NORMALIZED_STEMS = STEMS.map(normalize)

export interface EnergyLexicon {
  /** Multi-word energy terms from the dictionary, normalised. */
  phrases: Set<string>
}

/** Builds extra vocabulary from the Eurostat dictionary (energy products, technologies). */
export function buildLexicon(codelists: EnergyCodelists | null): EnergyLexicon {
  const phrases = new Set<string>()
  if (!codelists) return { phrases }
  for (const id of ENERGY_CODELISTS) {
    for (const labels of Object.values(codelists.codelists[id]?.codes ?? {})) {
      for (const label of [labels.en, labels.de, labels.fr]) {
        if (!label) continue
        const clean = normalize(label).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\s-]/g, ' ')
        const words = clean.split(/\s+/).filter((w) => w && !GENERIC.has(w))
        // Whole labels only ("motor gasoline", "blast furnace gas", "anthracite"): single generic
        // words such as "motor" or "waste" would let unrelated questions through.
        if (words.length > 1) phrases.add(words.join(' '))
        else if (words[0]?.length > 4) phrases.add(words[0])
      }
    }
  }
  return { phrases }
}

export type ScopeVerdict = 'energy' | 'small-talk' | 'follow-up' | 'off-topic'

export function hasEnergySignal(text: string, lexicon?: EnergyLexicon): boolean {
  const t = normalize(text)
  if (CODE_PATTERN.test(t)) return true
  const words = t.split(/[^a-z0-9-]+/).filter(Boolean)
  const joined = ` ${words.join(' ')} `
  const matchesStem = (stem: string) => {
    if (stem.includes(' ')) return joined.includes(` ${stem}`)
    if (stem.length <= 4) return words.some((w) => w === stem || w === `${stem}s` || w === `${stem}es`)
    return words.some((w) => w.startsWith(stem))
  }
  if (NORMALIZED_STEMS.some(matchesStem)) return true
  if (lexicon) {
    for (const phrase of lexicon.phrases) if (joined.includes(` ${phrase} `)) return true
  }
  return false
}

// Tasks outside the tool's purpose, blocked even when they mention energy ("a poem about oil"):
// ENgenuidash answers questions about energy statistics, it does not write creative or other content.
const OUT_OF_SCOPE_TASK =
  /\b(poem|poems|poetry|haiku|limerick|sonnet|rhymes?|short story|bedtime story|fairy tale|novel|jokes?|pun|riddle|songs?|lyrics|rap|essay|love letter|cover letter|tweet|slogan|recipe|write (a |some )?(code|program|script)|in python|in javascript|translate|translation|horoscope|gedichte?|reim|erzahl (mir )?eine geschichte|marchen|witze?|lied|songtext|aufsatz|rezept|ubersetze|ubersetzung|poemes?|poesie|raconte (moi )?une histoire|conte|blagues?|chanson|paroles|dissertation|recette|traduis|traduction)\b/

// A follow-up may contain only places, years, numbers and these connecting/time words
// ("and in Germany?", "what about 2020?", "only France", "since 2015", "und Österreich?").
// Any other content word ("What is the capital of France?") makes the message off-topic.
const FOLLOW_UP_WORDS = new Set(
  (
    'and also what about how the a an in for of from to since until till only just except without with compare ' +
    'same but instead please show me now then too last past previous next year years month months data values ' +
    'is it there vs versus or ' +
    'und auch was ist mit wie der die das im in fur von bis seit nur ohne mit vergleiche gleiche zeige mir jetzt ' +
    'letzten jahr jahre jahren monat monate monaten daten oder ' +
    'et aussi quoi pour le la les en au aux du de des depuis jusqu seulement uniquement sans avec compare meme ' +
    'montre moi maintenant dernier derniers dernieres annee annees mois donnees ou'
  ).split(' '),
)

/** Classifies a user message, taking the previous user message into account for follow-ups. */
export function classifyScope(
  text: string,
  previousUserMessages: string[],
  lexicon?: EnergyLexicon,
  placeNames?: Set<string>,
): ScopeVerdict {
  if (OUT_OF_SCOPE_TASK.test(normalize(text))) return 'off-topic'
  if (hasEnergySignal(text, lexicon)) return 'energy'
  if (SMALL_TALK.test(text.trim())) return 'small-talk'

  const last = previousUserMessages.at(-1)
  let rest = ` ${normalize(text).replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim()} `
  // Remove place names (longest first, e.g. "european union" before "union"), then check the rest.
  for (const place of [...(placeNames ?? [])].sort((a, b) => b.length - a.length)) {
    if (rest.includes(` ${place} `)) rest = rest.split(` ${place} `).join(' ')
  }
  const leftover = rest.split(' ').filter((w) => w && !/^\d+$/.test(w) && !FOLLOW_UP_WORDS.has(w))
  const onlyContext = text.trim().length > 0 && leftover.length === 0
  if (onlyContext && last && hasEnergySignal(last, lexicon)) return 'follow-up'

  return 'off-topic'
}

/** Useful for grounding: dictionary-aware scope check with a lazily built lexicon. */
export function createScopeChecker(dict: EnergyDictionary | null, codelists: EnergyCodelists | null) {
  const lexicon = buildLexicon(codelists)
  // Country names (EN/DE/FR) of the countries in the energy datasets, for follow-ups like "and Spain?".
  const places = new Set<string>()
  const geoCodes = new Set(dict ? Object.values(dict.datasets).flatMap((d) => d.dimensions.find((x) => x.id === 'geo')?.codes ?? []) : [])
  for (const code of geoCodes) {
    if (code.length !== 2 && !code.startsWith('EU')) continue // countries and the EU, not regions
    for (const label of Object.values(codelists?.codelists.GEO?.codes[code] ?? {})) {
      if (typeof label === 'string') places.add(normalize(label.replace(/\(.*?\)/g, '')).replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim())
    }
  }
  places.add('eu')
  return {
    lexicon,
    places,
    datasetCount: dict ? Object.keys(dict.datasets).length : 0,
    classify: (text: string, previous: string[]) => classifyScope(text, previous, lexicon, places),
  }
}
