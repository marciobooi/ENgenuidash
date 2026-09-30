import type { EnergyCodelists } from '../data/eurostat'
import type { ChatMessage } from '../llm/protocol'
import { prepareQuestion } from './prepare'
import { detectGeos, parse } from './planner/parse'
import type { Route } from './route'
import type { Plan } from './types'

/**
 * When the rules cannot read a question ("how is Spain doing?", "gas from where, Italy"), the
 * on-device model may say which kind of dashboard it most likely asks for, out of this fixed
 * list. It does not build anything and does not pick countries: the rules still read the places
 * and the period from the question, and build the dashboard from the question plus the words of
 * the chosen kind. The user confirms with a button (see useChatFlow); nothing runs on the model's
 * word alone unless its measured accuracy allows it (AUTO_PROB, src/eval/IntentEval.tsx).
 */
export type IntentId = 'profile' | 'flow' | 'households' | 'oil' | 'trade' | 'prices' | 'balance' | 'renewables'

interface Intent {
  id: IntentId
  /** How the choice is described to the model. */
  describe: string
  /** Words the rules know, added to the question so they build this dashboard. */
  suffix: string
}

export const INTENTS: Intent[] = [
  { id: 'profile', describe: 'Country profile: the overall picture and main indicators of a country\'s energy', suffix: 'energy profile' },
  { id: 'flow', describe: 'Energy flow diagram: how energy moves from supply to final use', suffix: 'energy flow diagram' },
  { id: 'households', describe: 'Household energy flow: what homes use energy for', suffix: 'household energy flow diagram' },
  { id: 'oil', describe: 'Oil security: oil imports, Russian oil, oil stocks, supply risk', suffix: 'oil security' },
  { id: 'trade', describe: 'Energy trade: which countries gas, oil, coal or electricity is bought from or sold to', suffix: 'imports by partner' },
  { id: 'prices', describe: 'Energy prices: what electricity or gas costs', suffix: 'electricity prices' },
  { id: 'balance', describe: 'Energy balance table: production, imports and consumption by product', suffix: 'energy balance' },
  { id: 'renewables', describe: 'Renewables: the share of green energy and the targets', suffix: 'renewable energy share' },
]

/** The number of the "none of these" option (after the eight kinds). */
export const NONE_OPTION = INTENTS.length + 1

/** One worked example per kind, and for "none" (in the prompt: none of them is in the evaluation sets). */
const EXAMPLES: [string, number][] = [
  ['Norway, key figures', 1],
  ['trace energy through the Dutch economy', 2],
  ['what do Swiss homes use the heating for', 3],
  ['could we survive without Russian crude', 4],
  ['who sells Finland its gas', 5],
  ['how much is a kilowatt hour in Latvia', 6],
  ['supply and use table for Malta', 7],
  ["how much of Ireland's power is renewable", 8],
  ['Lettland: die wichtigsten Daten', 1],
  ['Erzeugung und Verbrauch nach Energieträger für Norwegen', 7],
  ['production et consommation par produit pour la Grèce', 7],
  ["part d'énergie verte en Grèce et objectifs", 8],
  ['tell me a joke', NONE_OPTION],
]

/** The model's choice: the question, the kinds of dashboard, and "none of these". */
export function intentMessages(question: string): ChatMessage[] {
  return [
    { role: 'system', content: "You route a user's question to one dashboard of an energy statistics app. Reply with one number only." },
    {
      role: 'user',
      content: [
        'Dashboards:',
        ...INTENTS.map((i, n) => `${n + 1}. ${i.describe}`),
        `${NONE_OPTION}. None: not about these (a definition, a greeting, another topic)`,
        '',
        'Examples:',
        ...EXAMPLES.map(([q, n]) => `"${q}" -> ${n}`),
        '',
        `Question: "${question}"`,
        'Answer with the number.',
      ].join('\n'),
    },
  ]
}

export interface Candidate {
  id: IntentId
  prob: number
}

/** The probabilities the model gave (one per option, "none" last) as the kinds it favours, best first. */
export function rankIntents(probs: number[], minProb = MIN_PROB): Candidate[] {
  return INTENTS.map((i, n) => ({ id: i.id, prob: probs[n] ?? 0 }))
    .filter((c) => c.prob >= minProb)
    .sort((a, b) => b.prob - a.prob)
}

/** Kinds below this probability are not offered. */
export const MIN_PROB = 0.15
/** At most this many buttons. */
export const MAX_BUTTONS = 3
/** Above this the dashboard would open without asking. Off (above 1) until an evaluation says it is safe. */
export const AUTO_PROB = 1.01

/** Words that say what a dashboard is about, kept from the question besides places and years. */
const TOPIC_WORDS = /^(households?|homes?|industry|industrial|gas|oil|coal|electricity|power|petrol|diesel|crude|russia|russian|per|capita|exports?|imports?|2\d{3}|19\d{2})$/

/**
 * The parts of a question the rules can read: its places, years and a few topic words (the rest,
 * "is my bill going to be high", would keep them from reading the words of the kind).
 */
export function readableParts(question: string, codelists: EnergyCodelists): string {
  const words = prepareQuestion(question).split(' ').filter(Boolean)
  return words
    .filter((w) => TOPIC_WORDS.test(w) || detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
    .join(' ')
}

/** The dashboard of a kind for a question: its places and period plus the kind's words, read by the rules. */
export function planForIntent(id: IntentId, question: string, route: (text: string) => Route, codelists: EnergyCodelists): Plan | null {
  const intent = INTENTS.find((i) => i.id === id)
  if (!intent) return null
  const r = route(`${readableParts(question, codelists)} ${intent.suffix}`.trim())
  return r.kind === 'plan' ? r.plan : null
}

/** The view a plan is (for tests and the evaluation). */
export function intentOfPlan(p: Plan): IntentId | 'other' {
  if (p.profile) return 'profile'
  if (p.sankey) return p.sankey.scope === 'households' ? 'households' : 'flow'
  if (p.oil) return 'oil'
  if (p.trade) return 'trade'
  if (p.prices || /^nrg_pc_/.test(p.dataset)) return 'prices'
  if (p.balance) return 'balance'
  if (/^nrg_ind_ren|^sdg_07_40|^nrg_ind_share/.test(p.dataset)) return 'renewables'
  return 'other'
}
