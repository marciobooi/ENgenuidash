import { FLOWS, METRICS, PRODUCTS, type Concept } from '../genui/concepts'
import { normalize } from './energyScope'

/**
 * English search terms for a German or French question. The knowledge base and glossary are in
 * English (Eurostat publishes them in English), so "Warum ist Erdgas für die Stromerzeugung
 * wichtig?" would match nothing. The planner's multilingual concepts (products, flows, metrics)
 * and a short list of common question words give the English terms, which are appended to the
 * search query only; the question the model sees is unchanged.
 */

const PRODUCT_EN: Record<string, string> = {
  diesel: 'diesel', gasoline: 'gasoline petrol', jet: 'jet fuel kerosene', crude: 'crude oil', lignite: 'lignite',
  solar: 'solar photovoltaic', wind: 'wind', hydro: 'hydro hydropower', geothermal: 'geothermal', biogas: 'biogas',
  bioenergy: 'bioenergy biomass', renewables: 'renewable energy', nuclear: 'nuclear', gas: 'natural gas',
  oil: 'oil petroleum', coal: 'coal', fossil: 'fossil fuels', electricity: 'electricity', heat: 'heat',
}
const FLOW_EN: Record<string, string> = {
  households: 'households', industry: 'industry', transport: 'transport', services: 'services', imports: 'imports',
  exports: 'exports', production: 'production generation', grossConsumption: 'gross inland consumption', supply: 'supply',
  consumption: 'consumption',
}
const METRIC_EN: Record<string, string> = {
  price: 'price', dependency: 'import dependency', intensity: 'energy intensity', perCapita: 'per capita',
  degreeDays: 'degree days', primary: 'primary energy', share: 'share',
}

// Common question and topic words (normalised: no accents or umlauts) → English.
const WORDS: Record<string, string> = {
  warum: 'why', wieso: 'why', pourquoi: 'why', wie: 'how', comment: 'how',
  wichtig: 'important', importante: 'important', important: 'important', bedeutung: 'importance role', role: 'role',
  funktioniert: 'works', fonctionne: 'works', berechnet: 'calculated', calcule: 'calculated', gemessen: 'measured', mesure: 'measure',
  steigt: 'increase', gestiegen: 'increase', anstieg: 'increase', hausse: 'increase', augmentation: 'increase',
  sinkt: 'decrease', gesunken: 'decrease', ruckgang: 'decrease', baisse: 'decrease', diminution: 'decrease',
  versorgungssicherheit: 'security of supply', sicherheit: 'security', securite: 'security',
  klima: 'climate', klimawandel: 'climate change', climat: 'climate', emissionen: 'emissions', emission: 'emissions',
  effizienz: 'efficiency', efficacite: 'efficiency', speicher: 'storage', stockage: 'storage', netz: 'grid', reseau: 'grid',
  kraftwerk: 'power plant', kraftwerke: 'power plants', centrale: 'power plant', centrales: 'power plants',
  produire: 'production generation', produisent: 'production generation', erzeugen: 'production generation',
  stromerzeugung: 'electricity generation', energieerzeugung: 'energy production', energieverbrauch: 'energy consumption',
  stromverbrauch: 'electricity consumption', energiemix: 'energy mix', strommix: 'electricity mix', abhangigkeit: 'dependency',
  dependance: 'dependency', waermepumpe: 'heat pump', warmepumpe: 'heat pump', pac: 'heat pump', energie: 'energy',
  kernenergie: 'nuclear energy', atomkraft: 'nuclear', nucleaire: 'nuclear', erneuerbare: 'renewable', renouvelables: 'renewable',
}

function matches(words: string[], text: string, stem: string): boolean {
  const s = normalize(stem).trim()
  if (s.endsWith('$')) return words.includes(s.slice(0, -1))
  if (s.includes(' ')) return text.includes(` ${s} `) || text.includes(` ${s}`)
  if (s.length <= 4) return words.some((w) => w === s || w === `${s}s`)
  return words.some((w) => w.startsWith(s))
}

export function englishTerms(question: string): string[] {
  const words = normalize(question).replace(/[’']/g, ' ').split(/[^a-z0-9]+/).filter(Boolean)
  const text = ` ${words.join(' ')} `
  const out = new Set<string>()
  const add = (list: Concept[], labels: Record<string, string>) => {
    for (const c of list) if (labels[c.id] && c.stems.some((st) => matches(words, text, st))) out.add(labels[c.id])
  }
  add(PRODUCTS, PRODUCT_EN)
  add(FLOWS, FLOW_EN)
  add(METRICS, METRIC_EN)
  for (const w of words) if (WORDS[w]) out.add(WORDS[w])
  return [...out]
}

/** The question plus its English terms, for searching the English knowledge base and glossary. */
export function searchQuery(question: string): string {
  // English questions are searched as they are (expanding them only adds noise).
  if (questionLanguage(question, 'en') === 'en') return question
  // Only terms the question does not already contain in English (an English question stays as is).
  const words = new Set(normalize(question).split(/[^a-z0-9]+/))
  const extra = englishTerms(question).filter((t) => !t.split(' ').some((w) => words.has(w)))
  return extra.length ? `${question} ${extra.join(' ')}` : question
}

const LANG_WORDS: Record<'en' | 'de' | 'fr', Set<string>> = {
  en: new Set('the is are and or not a an why how what which who does do for with of to in on by this that'.split(' ')),
  de: new Set('der die das den dem des ist sind und oder nicht ein eine einer warum wie was welche wird werden fur mit von auf auch im zum zur'.split(' ')),
  fr: new Set('le la les des du est sont et ou pas un une pourquoi comment que quel quelle quels quelles qui dans pour avec sur au aux ce cette'.split(' ')),
}

/**
 * Language of a question (en/de/fr), from its function words; `fallback` (the UI language) when
 * unclear. Used to tell the model which language to answer in, since its background documents
 * are English.
 */
export function questionLanguage(question: string, fallback: string): 'en' | 'de' | 'fr' {
  const words = normalize(question).replace(/[’']/g, ' ').split(/[^a-z0-9]+/).filter(Boolean)
  const count = (l: 'en' | 'de' | 'fr') => words.filter((w) => LANG_WORDS[l].has(w)).length
  const scores = { en: count('en'), de: count('de'), fr: count('fr') }
  const best = (Object.keys(scores) as ('en' | 'de' | 'fr')[]).sort((a, b) => scores[b] - scores[a])[0]
  const tied = Object.values(scores).filter((v) => v === scores[best]).length > 1
  if (scores[best] > 0 && !tied) return best
  return fallback === 'de' || fallback === 'fr' ? fallback : 'en'
}

/** Energy products the question names (planner concepts, EN/DE/FR), e.g. [{ id: 'gas', siec: 'G3000' }]. */
export function productsIn(question: string): { id: string; siec: string }[] {
  const words = normalize(question).replace(/[’']/g, ' ').split(/[^a-z0-9]+/).filter(Boolean)
  const text = ` ${words.join(' ')} `
  return PRODUCTS.filter((c) => c.stems.some((st) => matches(words, text, st))).map(({ id, siec }) => ({ id, siec }))
}
