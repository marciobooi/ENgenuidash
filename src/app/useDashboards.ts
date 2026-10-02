import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilterControl } from '../components/filters'
import { notify } from '../components/toast'
import { EurostatUnavailableError, type EnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import { recordMiss } from '../eval/missLog'
import { intentOfPlan } from '../genui/intent'
import { buildDashboard, NoDataError, type ChooseVariant } from '../genui/execute'
import { variantPrompt } from '../genui/layout'
import { applyFilter, filterControls } from '../genui/filters'
import { sankeyAtYear } from '../genui/sankey/sankeyDashboard'
import { planQuestion } from '../genui/planner'
import { dashStrings } from '../genui/strings'
import type { DashboardSpec, Plan } from '../genui/types'
import type { Lang, Strings } from '../i18n'
import type { Assistant } from './useAssistant'
import { fill } from './text'
import { track } from './visitPing'

/**
 * The dashboards of the conversation (JSON specs, kept in order) and which one is on screen:
 * building one from a plan (with the retry on datasets without values), toolbar filters, going
 * back, clearing. Each build is recorded in the chat thread as a message with a dashboard card.
 */
export function useDashboards({
  dict,
  codelists,
  lang,
  t,
  assistant,
  announce,
  onShown,
}: {
  dict: EnergyDictionary | null
  codelists: EnergyCodelists | null
  lang: Lang
  t: Strings
  assistant: Assistant
  announce: (text: string) => void
  /** A dashboard was built: close the chat and move focus to it. */
  onShown: () => void
}) {
  const { llm } = assistant
  const [dashboards, setDashboards] = useState<DashboardSpec[]>([])
  const [active, setActive] = useState(0)
  const [building, setBuilding] = useState(false)
  const current = dashboards[active] as DashboardSpec | undefined
  // Language each dashboard was built in: its titles, labels and sentences are in that language.
  const builtIn = useRef<Lang[]>([])
  const hasDashboard = dashboards.length > 0

  // Toolbar filters for the dashboard on screen (countries, products, flows…).
  const filters = useMemo(
    () => (current && dict && codelists ? filterControls(current.plan, dict, codelists, lang, t.filters, current.shown) : []),
    [current, dict, codelists, lang, t.filters],
  )

  /**
   * When the language model is already loaded, it may pick one of the two page variants for the
   * question (a small, checked choice between valid templates). Only a clear preference given
   * quickly counts; otherwise the topic's variant stays. Never downloads or waits for the model.
   */
  const modelVariant = (question: string): ChooseVariant | undefined =>
    assistant.ready && !llm.generating
      ? async (kind) => {
          const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500))
          const probs = await Promise.race([llm.choose(variantPrompt(question, kind), 2), timeout])
          if (!probs || probs.length < 2) return undefined
          const best = probs[1] > probs[0] ? 1 : 0
          return probs[best] >= 0.7 ? best : undefined
        }
      : undefined

  async function runPlan(plan: Plan, question: string) {
    if (!dict) return
    setBuilding(true)
    llm.append({ role: 'user', content: question }, { role: 'assistant', content: t.buildingDashboard, pending: true })
    announce(t.buildingDashboard)
    try {
      let spec: DashboardSpec | undefined
      // A dataset chosen by the dictionary search may have no values for this selection: plan
      // the question again without it (at most twice) before saying there is no data.
      for (let attempt = 0; !spec; attempt++) {
        try {
          spec = await buildDashboard(plan, dict, lang, dashStrings(t), undefined, modelVariant(question))
        } catch (err) {
          // The starter dashboard of the topic the question names, if the wording's plan is empty.
          if (err instanceof NoDataError && plan.fallback) {
            plan = plan.fallback
            continue
          }
          if (!(err instanceof NoDataError) || !plan.retry || attempt >= 2 || !codelists) throw err
          // Next best datasets about the same product ("wood pellets" in the biomass supply, not
          // electricity use in the wood industry); unrelated ones are skipped.
          const tried = [...plan.retry.tried, plan.dataset]
          let next: Plan | null = null
          for (let skip = 0; skip < 4 && !next; skip++) {
            const r = planQuestion(plan.retry.question, dict, codelists, { exclude: tried })
            if (r.kind !== 'plan') break
            const sameProduct = !plan.filters.siec || JSON.stringify(r.plan.filters.siec) === JSON.stringify(plan.filters.siec)
            if (sameProduct && r.plan.dataset !== plan.dataset) next = r.plan
            else tried.push(r.plan.dataset)
          }
          if (!next) throw err
          plan = next
        }
      }
      const index = dashboards.length
      // A focused question ("which country…?") also gets its answer in the chat.
      const answer = spec.widgets.find((w) => w.type === 'answer')
      const message = [fill(hasDashboard ? t.dashboardUpdated : t.dashboardReady, { title: spec.title }), answer?.text].filter(Boolean).join(' ')
      builtIn.current[index] = lang
      track('dash', intentOfPlan(plan) === 'other' ? 'dataset' : intentOfPlan(plan))
      if (plan.trade?.compare || plan.oil?.compare || plan.balance?.compare || plan.profile?.compare || plan.sankey?.compare) track('compare')
      setDashboards((d) => [...d, { ...spec, question }])
      setActive(index)
      llm.updateLast((m) => !!m.pending, { content: message, pending: false, card: { index, title: spec.title } })
      announce(answer ? message : `${message} ${spec.summary.join(' ')}`)
      onShown()
    } catch (err) {
      const message = err instanceof NoDataError ? err.message : err instanceof EurostatUnavailableError ? t.eurostatDown : t.dashboardError
      llm.updateLast((m) => !!m.pending, { content: message, pending: false, kind: 'error' })
      announce(message)
      if (err instanceof NoDataError) recordMiss({ text: question, lang, kind: 'nodata', followUp: hasDashboard })
      if (err instanceof EurostatUnavailableError) notify.warning(t.eurostatDownTitle, { description: t.eurostatDown })
      else if (!(err instanceof NoDataError)) notify.error(t.dashboardError, { description: (err as Error).message })
    } finally {
      setBuilding(false)
    }
  }

  /** A toolbar filter changed: rebuild the dashboard, as if the change had been typed. */
  const onFilter = (f: FilterControl, codes: string[]) => {
    if (building || llm.generating || !current || !dict) return
    track('filter')
    const names = codes.map((c) => f.options.find((o) => o.code === c)?.label ?? c)
    void runPlan(applyFilter(current.plan, f.dim, codes, dict), `${f.label}: ${names.join(', ')}`)
  }

  /** "Go back": the previous dashboard of the conversation; false when this is the first one. */
  const back = (): { ok: boolean; title?: string } => {
    if (active === 0) return { ok: false }
    setActive(active - 1)
    return { ok: true, title: dashboards[active - 1].title }
  }

  // The language changed: build the dashboard on screen again from its plan, so every title,
  // label, sentence and number is in the new language (the others follow when shown).
  useEffect(() => {
    if (!current || !dict || building || (builtIn.current[active] ?? lang) === lang) return
    const index = active
    const controller = new AbortController()
    buildDashboard(current.plan, dict, lang, dashStrings(t), controller.signal)
      .then((spec) => {
        builtIn.current[index] = lang
        setDashboards((d) => d.map((old, i) => (i === index ? { ...spec, question: old.question } : old)))
      })
      .catch(() => {
        // Keeps the dashboard as it was (Eurostat unreachable, switched again meanwhile…).
      })
    return () => controller.abort()
  }, [lang, active, current, dict, building, t])

  const clear = () => {
    builtIn.current = []
    setDashboards([])
    setActive(0)
  }

  /**
   * A saved conversation is reopened: its dashboards are built again from their plans, all at
   * once. A dashboard that cannot be built (no data, Eurostat unreachable) is left out; the
   * result says where each saved one went (its new index, or -1) so the chat cards follow.
   */
  async function restore(saved: { plan: Plan; question: string }[], activeIndex: number): Promise<number[]> {
    if (!dict) return saved.map(() => -1)
    setBuilding(true)
    try {
      const built = await Promise.all(saved.map((s) => buildDashboard(s.plan, dict, lang, dashStrings(t)).then((spec) => ({ ...spec, question: s.question }), () => null)))
      const kept = built.filter((b) => !!b) as DashboardSpec[]
      let next = 0
      const map = built.map((b) => (b ? next++ : -1))
      builtIn.current = kept.map(() => lang)
      setDashboards(kept)
      setActive(Math.max(0, Math.min(map[activeIndex] ?? kept.length - 1, kept.length - 1)))
      return map
    } finally {
      setBuilding(false)
    }
  }

  /** The year of the energy flow diagram moved on its timeline: the dashboard follows in the browser, without a rebuild. */
  const setLiveYear = (year: string) => setDashboards((d) => d.map((old, i) => (i === active ? { ...sankeyAtYear(old, year, t.sankey), question: old.question } : old)))

  return { dashboards, active, setActive, current, hasDashboard, building, filters, runPlan, onFilter, back, clear, restore, setLiveYear }
}

export type Dashboards = ReturnType<typeof useDashboards>
