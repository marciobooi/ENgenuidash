import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { routeMessage } from '../genui/route'
import { answerFromHits } from '../llm/answers'
import { searchQuery } from '../llm/crossLingual'
import { createScopeChecker, normalize } from '../llm/energyScope'
import { definitionText, directDefinition } from '../llm/glossary'
import { searchKnowledge } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { ANSWER_CASES, type AnswerCase, type AnswerRoute } from './answerCases'

export interface AnswerResult {
  case: AnswerCase
  route: AnswerRoute
  dataset?: string
  /** The written answer without the model (definition, quote or closest passage). */
  text: string
  ok: boolean
  problems: string[]
}

const has = (text: string, fact: string) => normalize(text).includes(normalize(fact))

/**
 * Runs the answer cases through the app's own steps without the model: routing (topic guard,
 * vocabulary, planner), glossary definitions, and quotes from the knowledge base.
 */
export async function runAnswerEval(dict: EnergyDictionary, codelists: EnergyCodelists, docFreq?: Map<string, number>): Promise<AnswerResult[]> {
  const scope = createScopeChecker(dict, codelists)
  const vocabulary = buildVocabulary(dict, codelists, scope.places)
  const out: AnswerResult[] = []
  for (const c of ANSWER_CASES) {
    const route = routeMessage(c.q, { current: null, dict, codelists, classify: scope.classify, unknownWords: (x) => vocabulary.unknownWords(x, docFreq), correct: (w) => vocabulary.correct(w, docFreq), previous: [] })
    let kind: AnswerRoute
    let text = ''
    let dataset: string | undefined
    if (route.kind === 'off-topic') kind = 'refuse'
    else if (route.kind === 'rephrase') kind = 'rephrase'
    else if (route.kind === 'plan' || route.kind === 'refine') {
      kind = 'plan'
      dataset = route.plan.dataset
    } else if (route.kind === 'clarify') kind = 'clarify'
    else if (route.kind === 'answer' && route.smallTalk) kind = 'smalltalk'
    else {
      const definition = directDefinition(c.q)
      if (definition) {
        kind = 'definition'
        text = definitionText(definition)
      } else {
        const query = searchQuery(c.q)
        const a = answerFromHits(await searchKnowledge(query, { limit: 2 }), query)
        kind = a.kind === 'quote' ? 'quote' : a.kind === 'model' ? (a.quote ? 'passage' : 'offer') : 'unclear'
        text = a.kind === 'quote' ? a.text : a.kind === 'model' ? (a.quote?.text ?? '') : ''
      }
    }
    const problems: string[] = []
    const routes = ([] as AnswerRoute[]).concat(c.expect.route)
    if (!routes.includes(kind)) problems.push(`route ${kind}, expected ${routes.join('|')}`)
    if (c.expect.dataset && dataset !== c.expect.dataset) problems.push(`dataset ${dataset}, expected ${c.expect.dataset}`)
    for (const f of c.expect.facts ?? []) if (!has(text, f)) problems.push(`missing "${f}"`)
    // Quality rules for every quoted text.
    if (/\b(article \d+|regulation \(|directive \(|communication from)/i.test(text)) problems.push('quotes a legal reference')
    if (/data are comparable between/i.test(text)) problems.push('quotes publication boilerplate')
    out.push({ case: c, route: kind, dataset, text, ok: !problems.length, problems })
  }
  return out
}

/** Checks a model answer against a case's `model` expectations. */
export function checkModelAnswer(c: AnswerCase, answer: string): string[] {
  if (!c.model) return []
  const problems: string[] = []
  if (!c.model.anyOf.some((w) => has(answer, w))) problems.push(`none of: ${c.model.anyOf.join(', ')}`)
  // "non renouvelable" / "not renewable" / "nicht erneuerbar" is the opposite of the claim.
  const affirmed = normalize(answer).replace(/\b(not|non|nicht|kein\w*|pas|ne)[ -]+(\w+)/g, ' ')
  for (const w of c.model.never ?? []) if (affirmed.includes(normalize(w))) problems.push(`says "${w}"`)
  if (/\((?=[^()]*\b(nrg|sdg|ten\d|dataset|daten)\b)[^()]*\)\s*\.?$/i.test(answer)) problems.push('ends with an invented source tag')
  return problems
}
