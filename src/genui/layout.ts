import type { Plan, SectionKey, WidgetRole, WidgetSpec } from './types'

/**
 * The page is generated too, not only the charts: the question decides what comes first.
 *
 *   overview ("oil consumption in Spain")        → summary, insights, toolbar, KPIs, charts
 *   which ("which country is the most …?")        → the answer, then the ranking and the map
 *   change ("how has it changed since 2010?")     → the answer, then the change and evolution
 *
 * Focused questions open with the answer and its supporting charts; the key figures and insights
 * follow, and the suggested next questions close the page.
 */

export const OVERVIEW_LAYOUT: SectionKey[] = ['summary', 'insights', 'notes', 'toolbar', 'suggestions', 'kpis', 'charts', 'table']
const FOCUSED_LAYOUT: SectionKey[] = ['answer', 'notes', 'toolbar', 'charts', 'insights', 'kpis', 'suggestions', 'table']

/** Charts first for each focus; roles not listed keep the composer's order, after these. */
const PRIORITY: Record<string, WidgetRole[]> = {
  which: ['ranking', 'map', 'composition', 'headline', 'change', 'evolution', 'detail'],
  // Over time: the evolution shows the change best; for one period, the change chart.
  'change-trend': ['headline', 'evolution', 'change', 'ranking', 'map', 'composition', 'detail'],
  'change-compare': ['change', 'ranking', 'map', 'evolution', 'composition', 'detail'],
}

export function arrange(widgets: WidgetSpec[], plan: Plan): { widgets: WidgetSpec[]; layout: SectionKey[] } {
  const answered = widgets.some((w) => w.type === 'answer')
  if (!plan.focus || !answered) return { widgets, layout: OVERVIEW_LAYOUT }
  const key = plan.focus.kind === 'which' ? 'which' : plan.intent === 'compare' || plan.focusPeriod ? 'change-compare' : 'change-trend'
  const order = PRIORITY[key]
  const rank = (w: WidgetSpec) => {
    if (w.role === 'related') return order.length + 1 // other datasets stay last
    const i = w.role ? order.indexOf(w.role) : -1
    return i < 0 ? order.length : i
  }
  // Stable: widgets of the same rank keep the composer's order.
  const sorted = widgets.map((w, i) => ({ w, i })).sort((p, q) => rank(p.w) - rank(q.w) || p.i - q.i)
  return { widgets: sorted.map((x) => x.w), layout: FOCUSED_LAYOUT }
}
