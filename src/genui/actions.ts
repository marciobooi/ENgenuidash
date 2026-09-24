import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { normalize } from '../llm/energyScope'
import { STRINGS } from '../i18n'
import { placesInText, refinePlan } from './planner'
import type { DashboardSpec, Plan } from './types'

/**
 * The menu of dashboard changes offered when the rules cannot tell what a message asks for.
 * Every option is a canonical command run through refinePlan, so the language model (which only
 * picks an option number) can never produce a plan the rules would not produce themselves.
 */

export interface ActionStrings {
  trend: string
  allCountries: string
  top: string
  bottom: string
  add: string
  only: string
  year: string
  bar: string
  line: string
  table: string
  pie: string
  mix: string
  monthly: string
  explain: string
  none: string
}

export interface DashboardAction {
  id: string
  /** Label in the UI language (buttons). */
  label: string
  /** Label in English (the model's prompt; SmolLM2 follows English best). */
  labelEn: string
  plan?: Plan
  explain?: boolean
}

/** At most 8 options, so "None of these" is still a single digit. */
export const MAX_ACTIONS = 8

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

export function dashboardActions(
  current: DashboardSpec,
  text: string,
  dict: EnergyDictionary,
  codelists: EnergyCodelists,
  s: ActionStrings,
  en: ActionStrings,
  lang: string,
): DashboardAction[] {
  const plan = current.plan
  const out: DashboardAction[] = []
  const seen = new Set<string>([JSON.stringify(plan)])
  const add = (id: string, command: string | null, label: (x: ActionStrings) => string) => {
    if (out.length >= MAX_ACTIONS) return
    if (command === null) {
      out.push({ id, label: label(s), labelEn: label(en), explain: true })
      return
    }
    const next = refinePlan(plan, command, dict, codelists)
    if (!next) return
    const key = JSON.stringify(next)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ id, label: label(s), labelEn: label(en), plan: next })
  }

  // 1. Options built from what the message mentions: places, years, a number.
  const q = normalize(text)
  const geoLabel = (code: string, l: string) => {
    const labels = codelists.codelists.GEO?.codes[code] as Record<string, string> | undefined
    return (labels?.[l] ?? labels?.en ?? code).replace(/\s*\(.*?\)/g, '')
  }
  const places = placesInText(text, codelists)
  for (const code of places.codes.slice(0, 2)) {
    const name = (x: ActionStrings) => geoLabel(code, x === en ? 'en' : lang)
    add(`add-${code}`, `add ${geoLabel(code, 'en')}`, (x) => fill(x.add, { place: name(x) }))
    add(`only-${code}`, `only ${geoLabel(code, 'en')}`, (x) => fill(x.only, { place: name(x) }))
  }
  const years = [...new Set(q.match(/\b(19[5-9]\d|20[0-4]\d)\b/g) ?? [])].slice(0, 2)
  for (const y of years) add(`year-${y}`, `in ${y}`, (x) => fill(x.year, { year: y }))
  const n = Number(q.match(/\b([1-9]|1\d|2[0-7])\b/)?.[1] ?? 5)

  // 2. Generic changes, most asked-for first.
  add('top', `top ${n}`, (x) => fill(x.top, { n: String(n) }))
  add('bottom', `bottom ${n}`, (x) => fill(x.bottom, { n: String(n) }))
  add('all', 'all countries', (x) => x.allCountries)
  add('trend', 'all time', (x) => x.trend)
  add('explain', null, (x) => x.explain)
  add('mix', 'mix', (x) => x.mix)
  add('monthly', 'monthly', (x) => x.monthly)
  add('bar', 'as bar chart', (x) => x.bar)
  add('line', 'as line chart', (x) => x.line)
  add('table', 'as table', (x) => x.table)
  add('pie', 'as pie chart', (x) => x.pie)
  return out
}

/** Prompt for the model: the dashboard, the request and the numbered options. */
export function choicePrompt(current: DashboardSpec, text: string, actions: DashboardAction[], en: ActionStrings) {
  const options = [...actions.map((a) => a.labelEn), en.none]
  return [
    {
      role: 'system' as const,
      content: 'You match a request about an energy statistics dashboard to one action from a numbered list. Answer with the number only.',
    },
    {
      role: 'user' as const,
      content: [
        `Dashboard on screen: ${current.title}${current.subtitle ? ` (${current.subtitle})` : ''}.`,
        `Request: "${text}"`,
        'Actions:',
        ...options.map((o, i) => `${i + 1}. ${o}`),
        'Which action matches the request? Answer with the number.',
      ].join('\n'),
    },
  ]
}

/**
 * Fallback order when the model is not available: options sharing more words with the message
 * first. Words found in many options ("show", "zeigen") count for little. Stable otherwise.
 */
export function rankByOverlap(actions: DashboardAction[], text: string): DashboardAction[] {
  const stems = (t: string) => new Set(normalize(t).split(/[^a-z0-9]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)))
  const options = actions.map((a) => stems(`${a.label} ${a.labelEn}`))
  const df = new Map<string, number>()
  for (const o of options) for (const w of o) df.set(w, (df.get(w) ?? 0) + 1)
  const q = stems(text)
  const score = (o: Set<string>) => [...o].filter((w) => q.has(w)).reduce((n, w) => n + Math.log(options.length / (df.get(w) ?? 1)), 0)
  return actions.map((a, i) => ({ a, i, s: score(options[i]) })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.a)
}

const plain = (t: string) => normalize(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const EXPLAIN_LABELS = new Set(Object.values(STRINGS).flatMap((t) => [plain(t.dSugExplain), plain(t.explainQuestion)]))

/** "Explain these figures" and typed variants ("what do these numbers mean?"), EN/DE/FR. */
export function isExplainRequest(text: string): boolean {
  const q = plain(text)
  if (EXPLAIN_LABELS.has(q)) return true
  // "can you interpret this?", "why is it so high?", "warum ist das so niedrig?", "pourquoi c'est si élevé ?"
  if (/\binterpret\w* (this|it|that|these|them)\b|\binterpretier|\binterpret\w* (ca|cela|ces)\b/.test(q)) return true
  if (/\b(why is (it|this|that)|why are (they|these)|warum ist (es|das|der wert)|pourquoi (est ce|c est|est il|est elle)) (so |si |aussi )?(high|low|higher|lower|hoch|niedrig|eleve|elevee|bas|basse|faible)\b/.test(q)) return true
  return (
    /\b(explain|describe|interpret|what do|what does|erklar|beschreib|was bedeut|expliqu|decri|interpret|que signifi)/.test(q) &&
    /\b(these|this|the|those) (figures|numbers|data|values|results|chart|charts|dashboard)\b|\bdiese[nrs]? (zahlen|daten|werte|grafik)\b|\b(ces|ce|les) (chiffres|donnees|valeurs|resultats|graphique)\b/.test(q)
  )
}

export type ChooseFn = (messages: ReturnType<typeof choicePrompt>, count: number) => Promise<number[]>

// Content-free baselines per menu: the model's answer when the request says nothing.
const baselines = new Map<string, Promise<number[]>>()

/**
 * Scores the menu with the model, corrected for its position bias (contextual calibration,
 * Zhao et al. 2021): a small model prefers option 1 whatever the request, so each probability is
 * divided by the one it gets for an empty request ("N/A") with the same options, then
 * renormalised. The baseline is computed once per distinct menu.
 */
export async function scoreActions(choose: ChooseFn, current: DashboardSpec, text: string, actions: DashboardAction[], en: ActionStrings) {
  const count = actions.length + 1
  const key = `${current.title}|${actions.map((a) => a.labelEn).join('|')}`
  let base = baselines.get(key)
  if (!base) {
    base = choose(choicePrompt(current, 'N/A', actions, en), count)
    baselines.set(key, base)
    base.catch(() => baselines.delete(key))
  }
  // One request at a time: the worker runs a single model call.
  const b = await base
  const raw = await choose(choicePrompt(current, text, actions, en), count)
  const scaled = raw.map((p, i) => p / Math.max(b[i] ?? 1, 1e-6))
  const sum = scaled.reduce((a, x) => a + x, 0) || 1
  return { raw, probs: scaled.map((x) => x / sum) }
}
