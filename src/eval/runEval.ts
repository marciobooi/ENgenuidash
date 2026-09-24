import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { dashboardActions, scoreActions, isExplainRequest, rankByOverlap } from '../genui/actions'
import { refinePlan } from '../genui/planner'
import { STRINGS } from '../i18n'
import { CHOICE_MIN_PROB } from '../llm/config'
import type { ChatMessage } from '../llm/protocol'
import { EVAL_CASES, EVAL_DASHBOARD } from './cases'

export type Choose = (messages: ChatMessage[], count: number) => Promise<number[]>

export interface CaseResult {
  text: string
  lang: string
  expect: string
  /** What the rules did on their own: an action id, 'other' (a different change) or null. */
  rules: string | null
  /** Best option by word overlap (used while the model is loading). */
  fallback: string
  /** The model's pick, its probability and the time it took. */
  model?: string
  prob?: number
  ms?: number
  /** What the app does: an action id, or 'ask' (shows the options as buttons). */
  outcome: string
  verdict: 'correct' | 'asked' | 'wrong'
  /** The expected action was not among the options offered. */
  missing: boolean
}

/**
 * Runs every labelled follow-up through the same steps as the app (rules → menu → model pick).
 * Without `choose` only the rules and the word-overlap fallback are measured.
 */
export async function runEval(
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
  choose?: Choose,
  onResult?: (r: CaseResult, i: number) => void,
): Promise<CaseResult[]> {
  const results: CaseResult[] = []
  for (const [i, c] of EVAL_CASES.entries()) {
    const actions = dashboardActions(EVAL_DASHBOARD, c.text, dict, codelists, STRINGS[c.lang].actions, STRINGS.en.actions, c.lang)
    const idOf = (plan: unknown) => actions.find((a) => JSON.stringify(a.plan) === JSON.stringify(plan))?.id ?? 'other'
    const refined = refinePlan(EVAL_DASHBOARD.plan, c.text, dict, codelists)
    const rules = isExplainRequest(c.text) ? 'explain' : refined ? idOf(refined) : null
    const fallback = rankByOverlap(actions, c.text)[0]?.id ?? 'none'

    let model: string | undefined
    let prob: number | undefined
    let ms: number | undefined
    if (choose && actions.length) {
      const started = performance.now()
      const { probs } = await scoreActions(choose, EVAL_DASHBOARD, c.text, actions, STRINGS.en.actions)
      ms = Math.round(performance.now() - started)
      const best = probs.indexOf(Math.max(...probs))
      model = best < actions.length ? actions[best].id : 'none'
      prob = probs[best]
    }

    const outcome = rules ?? (model && model !== 'none' && (prob ?? 0) >= CHOICE_MIN_PROB ? model : 'ask')
    const verdict: CaseResult['verdict'] =
      outcome === c.expect || (c.expect === 'none' && outcome === 'ask') ? 'correct' : outcome === 'ask' ? 'asked' : 'wrong'
    const r: CaseResult = { ...c, rules, fallback, model, prob, ms, outcome, verdict, missing: c.expect !== 'none' && !actions.some((a) => a.id === c.expect) }
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
