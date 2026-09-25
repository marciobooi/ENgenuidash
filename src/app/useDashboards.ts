import { useMemo, useState } from 'react'
import type { FilterControl } from '../components/filters'
import { notify } from '../components/toast'
import { EurostatUnavailableError, type EnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import { recordMiss } from '../eval/missLog'
import { buildDashboard, NoDataError, type ChooseVariant } from '../genui/execute'
import { variantPrompt } from '../genui/layout'
import { applyFilter, filterControls } from '../genui/filters'
import { planQuestion } from '../genui/planner'
import { dashStrings } from '../genui/strings'
import type { DashboardSpec, Plan } from '../genui/types'
import type { Lang, Strings } from '../i18n'
import type { Assistant } from './useAssistant'
import { fill } from './text'

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
    const names = codes.map((c) => f.options.find((o) => o.code === c)?.label ?? c)
    void runPlan(applyFilter(current.plan, f.dim, codes, dict), `${f.label}: ${names.join(', ')}`)
  }

  /** "Go back": the previous dashboard of the conversation; false when this is the first one. */
  const back = (): { ok: boolean; title?: string } => {
    if (active === 0) return { ok: false }
    setActive(active - 1)
    return { ok: true, title: dashboards[active - 1].title }
  }

  const clear = () => {
    setDashboards([])
    setActive(0)
  }

  return { dashboards, active, setActive, current, hasDashboard, building, filters, runPlan, onFilter, back, clear }
}

export type Dashboards = ReturnType<typeof useDashboards>
