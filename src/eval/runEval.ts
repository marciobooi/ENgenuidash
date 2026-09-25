import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { dashboardActions, scoreActions, rankByOverlap } from '../genui/actions'
import { routeMessage } from '../genui/route'
import type { Plan } from '../genui/types'
import { STRINGS } from '../i18n'
import { createScopeChecker } from '../llm/energyScope'
import type { ChatMessage } from '../llm/protocol'
import { buildVocabulary } from '../llm/vocabulary'
import { EVAL_CASES, EVAL_DASHBOARD } from './cases'

export type Choose = (messages: ChatMessage[], count: number) => Promise<number[]>

export interface CaseResult {
  text: string
  lang: string
  expect: string
  /** How the app routed the message (see src/genui/route.ts). */
  route: string
  /** What the rules did on their own: an action id, 'other' (a different change) or null. */
  rules: string | null
  /** Best option by word overlap (used while the model is loading). */
  fallback: string
  /** The model's pick, its probability and the time it took. */
  model?: string
  prob?: number
  ms?: number
  /** What the app does: an action id, 'other', 'none' (no change) or 'ask' (buttons). */
  outcome: string
  verdict: 'correct' | 'asked' | 'wrong'
  /** The expected action was not among the options offered. */
  missing: boolean
}

/**
 * Runs every labelled follow-up through the same steps as the app: routeMessage (topic guard,
 * vocabulary check, rules) → action menu (buttons). With `choose`, the model's pick from the
 * menu is measured too (the app does not apply it). `docFreq`: knowledge-base word frequencies (vocabulary check).
 */
export async function runEval(
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
  choose?: Choose,
  onResult?: (r: CaseResult, i: number) => void,
  docFreq?: Map<string, number>,
): Promise<CaseResult[]> {
  const scope = createScopeChecker(dict, codelists)
  const vocabulary = buildVocabulary(dict, codelists, scope.places)
  // The dashboard on screen came from this question (follow-ups are judged against it).
  const previous = ['What is the energy import dependency of the EU?']
  const results: CaseResult[] = []

  for (const [i, c] of EVAL_CASES.entries()) {
    const actions = dashboardActions(EVAL_DASHBOARD, c.text, dict, codelists, STRINGS[c.lang].actions, STRINGS.en.actions, c.lang)
    // The focus of the question (which answer card to show) is not part of the action.
    const key = (plan: Plan | undefined) => JSON.stringify(plan ? { ...plan, focus: undefined } : plan)
    const idOf = (plan: Plan) => actions.find((a) => key(a.plan) === key(plan))?.id ?? 'other'
    const route = routeMessage(c.text, {
      current: EVAL_DASHBOARD.plan,
      dict,
      codelists,
      classify: scope.classify,
      unknownWords: (x) => vocabulary.unknownWords(x, docFreq),
      previous,
    })
    const menu = (route.kind === 'off-topic' && route.tryActions) || route.kind === 'actions'
    const rules =
      route.kind === 'explain' ? 'explain' : route.kind === 'back' ? 'back' : route.kind === 'refine' ? idOf(route.plan) : route.kind === 'plan' ? 'other' : null
    const fallback = rankByOverlap(actions, c.text)[0]?.id ?? 'none'

    let model: string | undefined
    let prob: number | undefined
    let ms: number | undefined
    if (menu && choose && actions.length) {
      const started = performance.now()
      const { probs } = await scoreActions(choose, EVAL_DASHBOARD, c.text, actions, STRINGS.en.actions)
      ms = Math.round(performance.now() - started)
      const best = probs.indexOf(Math.max(...probs))
      model = best < actions.length ? actions[best].id : 'none'
      prob = probs[best]
    }

    // The app shows the menu as buttons; the model's pick is measured but never applied.
    const outcome = rules ?? (!menu || !actions.length ? 'none' : 'ask')
    const verdict: CaseResult['verdict'] =
      outcome === c.expect || (c.expect === 'none' && outcome === 'ask') ? 'correct' : outcome === 'ask' ? 'asked' : 'wrong'
    const missing = !['none', 'other'].includes(c.expect) && !actions.some((a) => a.id === c.expect)
    const r: CaseResult = { ...c, route: route.kind, rules, fallback, model, prob, ms, outcome, verdict, missing }
    results.push(r)
    onResult?.(r, i)
  }
  return results
}

export function summarize(results: CaseResult[]) {
  const count = (v: CaseResult['verdict']) => results.filter((r) => r.verdict === v).length
  const withModel = results.filter((r) => r.model !== undefined)
  const times = withModel.map((r) => r.ms ?? 0)
  return {
    total: results.length,
    correct: count('correct'),
    asked: count('asked'),
    wrong: count('wrong'),
    rulesOnly: results.filter((r) => r.rules === r.expect || (r.expect === 'none' && r.rules === null)).length,
    fallbackTop1: results.filter((r) => r.fallback === r.expect).length,
    modelTop1: withModel.length ? withModel.filter((r) => r.model === r.expect).length : undefined,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : undefined,
  }
}
