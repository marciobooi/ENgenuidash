import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import type { ScopeVerdict } from '../llm/energyScope'
import { normalize } from '../llm/energyScope'
import { isExplainRequest } from './actions'
import { planQuestion, refinePlan } from './planner'
import { presetPlan } from './presets'
import type { Clarification, Plan } from './types'

/**
 * What to do with a chat message: the decision the app takes before any answer is written.
 * Pure (no UI, no model), so the app and the evaluation (src/eval) run exactly the same steps.
 *
 *   explain    "Explain these figures", or a "why…?" about the dashboard on screen
 *   back       "go back", "undo": the previous dashboard
 *   off-topic  not about energy: offer the action menu if a dashboard is on screen and every word
 *              is understood (`tryActions`), otherwise refuse
 *   rephrase   energy words, but asking about something unknown ("the date of oil")
 *   refine     a change to the dashboard on screen
 *   plan       a new dashboard
 *   actions    a follow-up the rules cannot map ("which ones are highest?"): the action menu
 *   clarify    the planner needs one more detail (which prices?)
 *   answer     a written answer (definition, documents or the model); `conceptual` for "what is…"
 */
export type Route =
  | { kind: 'explain' }
  | { kind: 'back' }
  | { kind: 'off-topic'; tryActions: boolean }
  | { kind: 'rephrase'; unknown: string[] }
  | { kind: 'refine'; plan: Plan }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'actions' }
  | { kind: 'clarify'; clarification: Clarification }
  | { kind: 'answer'; conceptual: boolean; smallTalk: boolean }

const BACK = /^(go back|back|undo|previous|previous dashboard|zuruck|ruckgangig|vorheriges|retour|annuler|precedent)$/
const WHY = /\b(why|warum|wieso|weshalb|pourquoi)\b/
// Words that point at the dashboard ("it", "this", "das", "ça"…).
const REFERS = /\b(it|this|that|these|they|es|das|dies|sie|ca|cela|ce|il|elle|ils)\b/
const JUDGE = /^(is (that|this|it) (good|bad|high|low|normal|a lot|much)|ist (das|es) (gut|schlecht|hoch|niedrig|viel)|est ce (bien|bon|eleve|beaucoup|normal)|c est (bien|bon|eleve|beaucoup|normal))\b/

export interface RouteContext {
  current: Plan | null
  dict: EnergyDictionary | null
  codelists: EnergyCodelists | null
  classify: (text: string, previous: string[]) => ScopeVerdict
  unknownWords: (text: string) => string[]
  previous: string[]
}

export function routeMessage(text: string, ctx: RouteContext): Route {
  const { current, dict, codelists } = ctx
  if (current && isExplainRequest(text)) return { kind: 'explain' }
  const q = normalize(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (current && BACK.test(q)) return { kind: 'back' }
  // "Why did it rise in 2022?", "is that good?": about the figures on screen.
  if (current && ((WHY.test(q) && REFERS.test(q)) || JUDGE.test(q))) return { kind: 'explain' }

  const verdict = ctx.classify(text, ctx.previous)
  // Content words ENgenuidash does not know ("date" in "what is the date of oil?").
  const unknown = ctx.unknownWords(text)
  const refined = current && dict && codelists && unknown.length === 0 ? refinePlan(current, text, dict, codelists) : null

  // A starter topic typed in any language ("Endenergieverbrauch nach Sektor in der EU", "final
  // non-energy consumption by fuel in Germany", "energy poverty in Portugal"): its exact plan,
  // with the places and period asked. When the planner reaches the same dataset on its own, its
  // plan is kept: it follows the wording ("the import dependency of the EU": the total).
  const preset = !refined && dict && codelists && verdict !== 'small-talk' ? presetPlan(text, dict, codelists) : null
  if (preset) {
    const planned = planQuestion(text, dict!, codelists!)
    return { kind: 'plan', plan: planned.kind === 'plan' && planned.plan.dataset === preset.dataset ? planned.plan : preset }
  }

  // Off-topic questions never reach the model or the planner. A dashboard change such as
  // "show as bar chart" has no energy word but is fine when every word is understood.
  if (verdict === 'off-topic' && !refined) return { kind: 'off-topic', tryActions: !!current && unknown.length === 0 }

  // Energy words, but asking about something unknown ("colour of natural gas") → rephrase.
  if (unknown.length && verdict !== 'small-talk') return { kind: 'rephrase', unknown }

  let conceptual = false
  if (dict && codelists && verdict !== 'small-talk') {
    if (refined) return { kind: 'refine', plan: refined }
    const result = planQuestion(text, dict, codelists)
    if (result.kind === 'plan') return { kind: 'plan', plan: result.plan }
    if (current && verdict === 'follow-up' && result.kind === 'none') return { kind: 'actions' }
    if (result.kind === 'clarify') return { kind: 'clarify', clarification: result.clarification }
    conceptual = result.kind === 'explain'
  }
  return { kind: 'answer', conceptual, smallTalk: verdict === 'small-talk' }
}
