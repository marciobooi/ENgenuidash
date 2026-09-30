import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { INTENTS, MAX_BUTTONS, intentMessages, rankIntents, type Candidate, type IntentId } from '../genui/intent'
import { routeMessage } from '../genui/route'
import { createScopeChecker } from '../llm/energyScope'
import { buildVocabulary } from '../llm/vocabulary'
import type { Choose } from './runEval'
import type { IntentCase } from './intentCases'

export interface IntentResult {
  case: IntentCase
  /** The rules already build a dashboard: not a case for the model. */
  handledByRules: boolean
  probs?: number[]
  top?: IntentId | 'none'
  prob?: number
  ms?: number
  offered?: Candidate[]
}

const topOf = (probs: number[]): { id: IntentId | 'none'; prob: number } => {
  const i = probs.indexOf(Math.max(...probs))
  return { id: i >= INTENTS.length ? 'none' : INTENTS[i].id, prob: probs[i] }
}

/** Runs the cases through the rules and, for those they cannot read, through the model's choice. */
export async function runIntentEval(
  cases: IntentCase[],
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
  choose: Choose,
  docFreq: Map<string, number>,
  onResult?: (r: IntentResult) => void,
): Promise<IntentResult[]> {
  const scope = createScopeChecker(dict, codelists)
  const vocabulary = buildVocabulary(dict, codelists, scope.places)
  const unknownWords = (x: string) => vocabulary.unknownWords(x, docFreq)
  const correct = (w: string) => vocabulary.correct(w, docFreq)
  const out: IntentResult[] = []
  for (const c of cases) {
    const r = routeMessage(c.text, { current: null, dict, codelists, classify: scope.classify, unknownWords, correct, previous: [] })
    let result: IntentResult = { case: c, handledByRules: r.kind === 'plan' }
    if (!result.handledByRules) {
      const started = performance.now()
      const probs = await choose(intentMessages(c.text), INTENTS.length + 1)
      const { id, prob } = topOf(probs)
      result = { ...result, probs, top: id, prob, ms: Math.round(performance.now() - started), offered: rankIntents(probs).slice(0, MAX_BUTTONS) }
    }
    out.push(result)
    onResult?.(result)
  }
  return out
}

export interface IntentSummary {
  /** Cases the rules cannot read (what the model is for). */
  population: number
  handledByRules: number
  /** The model's first choice is the label ("none": it favours "none of these"). */
  top1: number
  /** Real questions: the right kind is among the buttons offered. */
  offeredRecall: number
  realQuestions: number
  /** "None" cases where buttons would still be offered (should be 0). */
  falseOffers: number
  noneCases: number
  /** If the first choice above a probability opened the dashboard: how many, how many right. */
  thresholds: { p: number; opened: number; right: number }[]
  avgMs: number
}

export function summarizeIntent(results: IntentResult[]): IntentSummary {
  const pop = results.filter((r) => !r.handledByRules)
  const real = pop.filter((r) => r.case.intent !== 'none')
  const none = pop.filter((r) => r.case.intent === 'none')
  const right = (r: IntentResult) => r.top === r.case.intent || (!!r.top && !!r.case.alt?.includes(r.top as IntentId))
  return {
    population: pop.length,
    handledByRules: results.length - pop.length,
    top1: pop.filter(right).length,
    offeredRecall: real.filter((r) => r.offered?.some((c) => c.id === r.case.intent || r.case.alt?.includes(c.id))).length,
    realQuestions: real.length,
    falseOffers: none.filter((r) => (r.offered?.length ?? 0) > 0).length,
    noneCases: none.length,
    thresholds: [0.5, 0.7, 0.8, 0.9, 0.95].map((p) => {
      const opened = pop.filter((r) => r.top && r.top !== 'none' && (r.prob ?? 0) >= p)
      return { p, opened: opened.length, right: opened.filter(right).length }
    }),
    avgMs: pop.length ? Math.round(pop.reduce((a, r) => a + (r.ms ?? 0), 0) / pop.length) : 0,
  }
}
