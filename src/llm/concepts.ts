import data from './concepts.json'
import { normalize } from './energyScope'
import { questionLanguage } from './crossLingual'
import { findEntries, type GlossaryEntry } from './glossary'

/**
 * Answers to "what is X?", "why is X important?", "how is X calculated?" and "where do the data on
 * X come from?" for energy concepts the Eurostat glossary does not cover, and to the "why", "how"
 * and "where from" questions the glossary does not answer. The texts are in concepts.json (written
 * from Eurostat's articles and metadata, each with its sources; German and French are translations).
 */

export type Lang = 'en' | 'de' | 'fr'
export type ConceptKind = 'what' | 'why' | 'how' | 'data'
type Texts = Record<Lang, string>

interface Concept {
  id: string
  name: Texts
  aliases: string[]
  what?: Texts
  why?: Texts
  how?: Texts
  data?: Texts
  sources: { title: string; url: string }[]
}

export interface ConceptAnswer {
  text: string
  concept: string
  kind: ConceptKind
  sources: { code: string; title: string; url: string }[]
}

const CONCEPTS = data.concepts as Concept[]

const clean = (s: string) => ` ${normalize(s).replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `

const WHAT = /^(what is|what are|what s|whats|what does \S+( \S+)? mean|define|definition of|meaning of|explain|tell me about|was ist|was sind|was bedeutet|erklar\w*|qu est ce|c est quoi|explique\w*|definis\w*|que signifie|que veut dire)\b/
const WHY = /^(why|warum|wieso|weshalb|pourquoi)\b|\b(importance|benefits?) of\b|\b(wichtigkeit|bedeutung|nutzen) (von|der|des)\b|\bimportance (de|des|du)\b/
const HOW =
  /^(how|wie|comment)\b.*\b(calculat\w*|comput\w*|measur\w*|deriv\w*|determin\w*|compil\w*|work\w* out|count\w*|defin\w*|estimat\w*|berechn\w*|gemessen|ermittelt|calcul\w*|mesur\w*)/
const DATA =
  /\b(where (do|does|did|can|is|are|would)\b.*\b(data|come|comes|get|got|find|collected|stem|originate)|(source|sources) (of|for)\b.*\b(data|statistics|figures|numbers)|data sources?|how (do|does|can|did) (we|you|i|they|eurostat|countries|one)\b.*\b(get|obtain|collect|gather|find|know|learn|receive)|who (reports?|collects?|provides?|sends?)|how (often|frequently)\b.*\bupdat\w*|woher|wo kommen|datenquelle\w*|quelle\w* (der|fur|von)\b.*\bdaten|wie (kommen|gelangen|erhalten|erhebt|erheben|bekommen)\b.*\bdaten|wie oft|d ou (viennent|vient|proviennent)|ou (trouve|obtient|recolte)\w*|source\w* des donnees|comment (obtient|obtenir|collecte|collecter|recolte|recupere|recuperer)|combien de fois|a quelle frequence)\b/

/** What a question asks about a concept, or null when it is none of the four. */
export function questionKind(q: string): ConceptKind | null {
  const t = clean(q).trim()
  if (DATA.test(t)) return 'data'
  if (HOW.test(t)) return 'how'
  if (WHY.test(t)) return 'why'
  if (WHAT.test(t)) return 'what'
  return null
}

const STOP = new Set(
  'a an the of in on for is are was were do does did to and or with by at as it its this that these those what which who how why where when about mean means me tell explain define definition meaning important importance matter matters calculated calculate measured measure come comes get got data from source sources der die das den dem des ein eine einer ist sind was wie warum wo wird werden berechnet gemessen wichtig le la les un une des du de est sont que qui comment pourquoi ou quoi importante importants ce qu l d s'.split(' '),
)

/** Concept whose name or alias is in the text (the longest wording wins). German compounds count ("Winddaten"). */
function findConcept(text: string): Concept | null {
  const t = clean(text)
  const german = questionLanguage(text, 'en') === 'de'
  let best: { concept: Concept; length: number } | null = null
  for (const concept of CONCEPTS) {
    for (const alias of [...concept.aliases, concept.name.en, concept.name.de, concept.name.fr]) {
      const a = clean(alias)
      const found = t.includes(a) || (german && a.trim().length >= 4 && new RegExp(` ${a.trim()}\\w{3,}`).test(t))
      if (a.trim().length > 1 && found && (!best || a.length > best.length)) best = { concept, length: a.length }
    }
  }
  return best?.concept ?? null
}

/** The words of a question that are neither the concept's own wording nor filler. */
function leftovers(text: string, concept: Concept): string[] {
  const own = new Set(clean([...concept.aliases, concept.name.en, concept.name.de, concept.name.fr].join(' ')).split(' ').filter(Boolean))
  return clean(text)
    .replace(WHAT, ' ')
    .split(' ')
    .filter(Boolean)
    .filter((w) => w.length > 1 && !STOP.has(w) && !own.has(w) && !/^\d{4}$/.test(w) && !['energy', 'power', 'eu', 'europe', 'european', 'source', 'sources', 'difference', 'between', 'versus', 'vs'].includes(w))
}

const sourcesOf = (c: Concept) => c.sources.map((s) => ({ code: 'Eurostat', title: s.title, url: s.url }))

/** "How is it calculated?" for a glossary term: the sentence or formula of its official text that says so. */
function howFromGlossary(entry: GlossaryEntry): string | null {
  const lines = (entry.text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const formula = lines.find((l) => /=/.test(l) && l.length < 300)
  const sentence = lines
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .find((s) => /\b(calculated|defined as|divided by|ratio|expressed as|measured|computed)\b/i.test(s) && s.length < 320)
  if (!formula && !sentence) return null
  const first = entry.summary.split(/(?<=[.!?])\s+/)[0]
  return [first, sentence && !first.includes(sentence) ? sentence : '', formula && !first.includes(formula) ? formula : ''].filter(Boolean).join(' ')
}

/**
 * The answer to a concept question, in the language asked: a concept's own text for its kind, or,
 * for "what is", the concepts.json definition when the glossary has none. Null when it is not such
 * a question or we have no text for it (the Eurostat documents and the model take it from there).
 */
export function conceptAnswer(questions: string[], lang: Lang): ConceptAnswer | null {
  for (const q of questions) {
    const kind = questionKind(q)
    if (!kind) continue
    const concept = findConcept(q)
    if (concept) {
      const texts = concept[kind]
      // "What is …?" only when the question is that concept and nothing else ("what is wind energy?").
      if (texts && (kind !== 'what' || (leftovers(q, concept).length === 0 && q.split(/\s+/).length <= 9))) {
        return { text: texts[lang] ?? texts.en, concept: concept.name[lang] ?? concept.name.en, kind, sources: sourcesOf(concept) }
      }
    }
    if (kind === 'how') {
      const entry = findEntries(q, 1)[0]
      const text = entry && howFromGlossary(entry)
      if (entry && text) return { text, concept: entry.term, kind, sources: entry.url ? [{ code: 'Glossary', title: entry.term, url: entry.url }] : [] }
    }
  }
  return null
}

export const conceptCount = () => CONCEPTS.length
