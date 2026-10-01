import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import type { ScopeVerdict } from '../llm/energyScope'
import { normalize } from '../llm/energyScope'
import { isExplainRequest } from './actions'
import { COMPARE, yearsBack } from './comparing'
import { planQuestion, refinePlan } from './planner'
import { prepareQuestion } from './prepare'
import { presetPlan } from './presets'
import { balancePlan, refineBalance } from './balance'
import { pricesPlan, refinePrices, toComponentsPlan } from './prices'
import { oilPlan, refineOil } from './oil'
import { profilePlan, refineProfile } from './profile'
import { refineSankey, sankeyPlan } from './sankey/sankeyDashboard'
import { refineTrade, tradePlan } from './trade'
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
  /** The known word an unknown one is a typing slip of (see Vocabulary.correct). */
  correct?: (word: string) => string | null
  previous: string[]
}

/**
 * The oil, balance, energy flow and country profile dashboards show one country at a time: "compare
 * with France" must not hand them two (they would build from "DE,FR"). They switch to the new
 * country; the views that can compare (trade, energy flow, profile) have their own follow-up rules.
 */
function oneCountryViews(plan: Plan | null, current: Plan): Plan | null {
  if (!plan || !(current.oil || current.balance || current.sankey || current.profile) || !Array.isArray(plan.filters.geo)) return plan
  const before = ([] as string[]).concat(current.filters.geo ?? [])
  const geo = plan.filters.geo.filter((g) => !before.includes(g)).at(-1) ?? plan.filters.geo.at(-1)
  return geo ? { ...plan, filters: { ...plan.filters, geo } } : plan
}

export function routeMessage(typed: string, ctx: RouteContext): Route {
  const { current, dict, codelists } = ctx
  // Lead-ins dropped, other EU languages as English keywords, typing slips corrected (prepare.ts).
  const text = prepareQuestion(typed, { unknownWords: ctx.unknownWords, correct: ctx.correct })
  if (current && isExplainRequest(text)) return { kind: 'explain' }
  const q = normalize(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (current && BACK.test(q)) return { kind: 'back' }
  // "Compare with last year": the energy flow diagram and the balance sheet set it against earlier years; the other dashboards already
  // show the change on the year before (the arrows of the key figures), which is what the explanation of the figures reports.
  if (current && !current.sankey && !current.balance && COMPARE.test(q) && yearsBack(q)) return { kind: 'explain' }
  // "Why did it rise in 2022?", "is that good?": about the figures on screen.
  if (current && ((WHY.test(q) && REFERS.test(q)) || JUDGE.test(q))) return { kind: 'explain' }

  // Energy balance sheets (enbal): a new sheet, or another country, year, unit or fuels for the
  // one on screen. Before the unknown-word check: "Total - main fuel families" is enbal's wording.
  if (dict && codelists) {
    const sheet = balancePlan(text, dict, codelists)
    if (sheet) return current?.balance ? { kind: 'refine', plan: { ...current, ...sheet, balance: sheet.balance } } : { kind: 'plan', plan: sheet }
    // Energy trade by partner (entrade): a new trade dashboard, or a change of the one on screen.
    // Before the balance's follow-ups: "show trade between Spain and Germany" is not "add Spain".
    const traded = current?.trade ? refineTrade(current, text, dict, codelists) : null
    if (traded) return { kind: 'refine', plan: traded }
    const trade = tradePlan(text, dict, codelists)
    if (trade) return { kind: 'plan', plan: trade }
    const changed = current?.balance ? refineBalance(current, text, dict, codelists) : null
    if (changed) return { kind: 'refine', plan: changed }
    // Energy price structure (enprices): a new breakdown, a change of the one on screen, or "now
    // in components"/"add all taxes" for the plain (non-decomposed) price dashboard on screen.
    const priced = current?.prices ? refinePrices(current, text, dict, codelists) : null
    if (priced) return { kind: 'refine', plan: priced }
    const prices = pricesPlan(text, dict, codelists)
    if (prices) return { kind: 'plan', plan: prices }
    // Oil security: a new dashboard, or another country for the one on screen.
    const oiled = current?.oil ? refineOil(current, text, dict, codelists) : null
    if (oiled) return { kind: 'refine', plan: oiled }
    const oil = oilPlan(text, dict, codelists)
    if (oil) return { kind: 'plan', plan: oil }
    // Energy flow diagram (ENSANKEY): a new diagram, or another country, year, unit or product for the one on screen.
    const flowed = current?.sankey ? refineSankey(current, text, dict, codelists) : null
    if (flowed) return { kind: 'refine', plan: flowed }
    const flow = sankeyPlan(text, dict, codelists)
    if (flow) return { kind: 'plan', plan: flow }
    // Energy profile of a country (ENDASH): a new profile, or another country or year for the one on screen.
    const profiled = current?.profile ? refineProfile(current, text, dict, codelists) : null
    if (profiled) return { kind: 'refine', plan: profiled }
    const profile = profilePlan(text, dict, codelists)
    if (profile) return { kind: 'plan', plan: profile }
    const decomposed = current ? toComponentsPlan(current, text, dict) : null
    if (decomposed) return { kind: 'refine', plan: decomposed }
  }

  const verdict = ctx.classify(text, ctx.previous)
  // Content words ENgenuidash does not know ("date" in "what is the date of oil?").
  const unknown = ctx.unknownWords(text)
  const refined = current && dict && codelists && unknown.length === 0 ? oneCountryViews(refinePlan(current, text, dict, codelists), current) : null

  // A starter topic typed in any language ("Endenergieverbrauch nach Sektor in der EU", "final
  // non-energy consumption by fuel in Germany", "energy poverty in Portugal"): its exact plan,
  // with the places and period asked. When the planner reaches the same dataset on its own, its
  // plan is kept: it follows the wording ("the import dependency of the EU": the total).
  const preset = !refined && dict && codelists && verdict !== 'small-talk' ? presetPlan(text, dict, codelists) : null
  if (preset) {
    const planned = planQuestion(text, dict!, codelists!)
    // The wording's plan may pick a selection without values (a dataset's full title read word by
    // word: "Gross and net production of electricity…" → net production of the product
    // electricity): the starter plan stands by.
    return { kind: 'plan', plan: planned.kind === 'plan' && planned.plan.dataset === preset.dataset ? { ...planned.plan, fallback: preset } : preset }
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
