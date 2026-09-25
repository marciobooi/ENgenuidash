import type { LayoutItem, Plan, Presentation, WidgetRole, WidgetSpec } from './types'

/**
 * The page is generated too, not only the charts. Each kind of question has its own templates:
 *
 *   which   "which country is the most …?"   → the answer, then the ranking and the map
 *   change  "how has it changed since 2010?"  → the answer, then the change and the evolution
 *   compare several countries for a period    → map and ranking first, key figures after
 *   trend   several series over time          → big numbers with their change, then the lines
 *   single  one series                        → the headline card, its change, the explainer
 *   mix     parts of a whole                  → donut and stacked shares
 *   price   energy prices                     → what the price is made of, first
 *
 * Each kind has two variants (section order, key figures as cards or big numbers, which charts
 * lead, stacked areas or stacked bars…). The variant and the accent colour come from the topic
 * (dataset, product, kind of question), not from chance: the same question always gives the same
 * page, and changing the year or a country in the toolbar does not rearrange it, while different
 * topics look different. The model may choose the variant instead (see `withVariant`).
 */

export type Kind = 'which' | 'change' | 'compare' | 'trend' | 'single' | 'mix' | 'price'

interface Template {
  layout: LayoutItem[]
  kpiStyle: Presentation['kpiStyle']
  charts: WidgetRole[]
  /** Shares over time as stacked (percent) columns instead of areas. */
  stackedBars?: boolean
}

const TEMPLATES: Record<Kind, [Template, Template]> = {
  which: [
    { layout: ['answer', 'notes', 'toolbar', 'charts', ['insights', 'explainer'], 'kpis', 'suggestions', 'table'], kpiStyle: 'cards', charts: ['ranking', 'map', 'composition', 'headline', 'change', 'evolution', 'detail'] },
    { layout: ['answer', 'notes', 'toolbar', 'charts', 'kpis', ['insights', 'explainer'], 'suggestions', 'table'], kpiStyle: 'big', charts: ['map', 'ranking', 'composition', 'headline', 'change', 'evolution', 'detail'] },
  ],
  change: [
    { layout: ['answer', 'notes', 'toolbar', 'charts', ['insights', 'explainer'], 'kpis', 'suggestions', 'table'], kpiStyle: 'cards', charts: ['headline', 'evolution', 'change', 'ranking', 'map', 'composition', 'detail'] },
    { layout: ['answer', 'kpis', 'notes', 'toolbar', 'charts', 'insights', 'explainer', 'suggestions', 'table'], kpiStyle: 'big', charts: ['headline', 'change', 'evolution', 'ranking', 'map', 'composition', 'detail'] },
  ],
  compare: [
    { layout: ['summary', 'notes', 'toolbar', 'charts', 'kpis', ['insights', 'explainer'], 'suggestions', 'table'], kpiStyle: 'cards', charts: ['map', 'ranking', 'change', 'composition', 'evolution', 'detail'] },
    { layout: [['summary', 'insights'], 'notes', 'toolbar', 'kpis', 'charts', 'explainer', 'suggestions', 'table'], kpiStyle: 'big', charts: ['ranking', 'map', 'change', 'evolution', 'composition', 'detail'] },
  ],
  trend: [
    { layout: ['summary', 'kpis', 'notes', 'toolbar', 'charts', ['insights', 'explainer'], 'suggestions', 'table'], kpiStyle: 'big', charts: ['evolution', 'ranking', 'change', 'map', 'detail'] },
    { layout: ['kpis', 'notes', 'toolbar', ['summary', 'insights'], 'charts', 'explainer', 'suggestions', 'table'], kpiStyle: 'big', charts: ['evolution', 'change', 'ranking', 'map', 'detail'] },
  ],
  single: [
    { layout: ['summary', 'notes', 'toolbar', 'charts', ['insights', 'explainer'], 'kpis', 'suggestions', 'table'], kpiStyle: 'cards', charts: ['headline', 'change', 'detail', 'evolution'] },
    { layout: ['explainer', 'notes', 'toolbar', 'charts', 'kpis', ['summary', 'insights'], 'suggestions', 'table'], kpiStyle: 'big', charts: ['headline', 'detail', 'change', 'evolution'] },
  ],
  mix: [
    { layout: ['summary', 'notes', 'toolbar', 'charts', ['insights', 'explainer'], 'kpis', 'suggestions', 'table'], kpiStyle: 'cards', charts: ['composition', 'evolution', 'detail'] },
    { layout: ['kpis', 'notes', 'toolbar', 'charts', ['summary', 'insights'], 'explainer', 'suggestions', 'table'], kpiStyle: 'big', charts: ['composition', 'evolution', 'detail'], stackedBars: true },
  ],
  price: [
    { layout: ['summary', 'notes', 'toolbar', 'charts', ['insights', 'explainer'], 'kpis', 'suggestions', 'table'], kpiStyle: 'cards', charts: ['price', 'headline', 'change', 'ranking', 'map', 'evolution', 'detail'] },
    { layout: ['kpis', 'notes', 'toolbar', 'charts', 'insights', 'explainer', 'suggestions', 'table'], kpiStyle: 'big', charts: ['headline', 'price', 'change', 'ranking', 'map', 'evolution', 'detail'] },
  ],
}

/** Toolbar controls, most relevant first, per kind of question. */
const CONTROLS: Record<Kind, string[]> = {
  which: ['rank', 'year', 'geo', 'siec', 'period'],
  change: ['period', 'geo', 'siec', 'year'],
  compare: ['rank', 'geo', 'year', 'siec', 'period'],
  trend: ['period', 'rank', 'geo', 'siec', 'year'],
  single: ['period', 'year', 'geo', 'siec'],
  mix: ['siec', 'year', 'geo', 'period'],
  price: ['nrg_cons', 'tax', 'geo', 'period', 'currency', 'year'],
}

const ACCENTS: Presentation['accent'][] = ['blue', 'teal', 'violet', 'orange']

export const OVERVIEW_LAYOUT: LayoutItem[] = TEMPLATES.single[0].layout

/** A small, stable hash (FNV-1a) of the topic: the same topic always gets the same variant. */
export function topicSeed(plan: Plan, kind: Kind): number {
  const siec = ([] as string[]).concat(plan.filters.siec ?? []).join()
  const key = `${plan.dataset}|${siec}|${kind}`
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return h >>> 0
}

/** The kind of question, from the plan and the view the composer chose. */
export function kindOf(plan: Plan, view: 'compare' | 'mix' | 'trend' | 'single', answered: boolean): Kind {
  if (answered && plan.focus) return plan.focus.kind
  if (plan.dataset.startsWith('nrg_pc_')) return 'price'
  return view
}

export function arrange(
  widgets: WidgetSpec[],
  plan: Plan,
  view: 'compare' | 'mix' | 'trend' | 'single',
  /** Template variant chosen elsewhere (the model), else the topic's. */
  variant?: 0 | 1,
): { widgets: WidgetSpec[]; layout: LayoutItem[]; presentation: Presentation } {
  const answered = widgets.some((w) => w.type === 'answer')
  const kind = kindOf(plan, view, answered)
  const seed = topicSeed(plan, kind)
  const v = variant ?? ((seed & 1) as 0 | 1)
  const t = TEMPLATES[kind][v]

  const rank = (w: WidgetSpec) => {
    const i = w.role ? t.charts.indexOf(w.role) : -1
    if (i >= 0) return i
    return w.role === 'related' ? t.charts.length + 1 : t.charts.length // other datasets stay last
  }
  // Stable: widgets of the same rank keep the composer's order.
  let sorted = widgets
    .map((w, i) => ({ w, i }))
    .sort((p, q) => rank(p.w) - rank(q.w) || p.i - q.i)
    .map((x) => x.w)
  if (t.stackedBars) sorted = sorted.map(toStackedBars)

  return {
    widgets: sorted,
    layout: t.layout,
    presentation: {
      template: `${kind}-${v === 0 ? 'a' : 'b'}`,
      kpiStyle: t.kpiStyle,
      controls: CONTROLS[kind],
      primaryControls: kind === 'price' ? 3 : 2,
      accent: ACCENTS[(seed >>> 1) % ACCENTS.length],
      chosenBy: variant === undefined ? 'topic' : 'model',
    },
  }
}

const SECTION_TEXT: Record<string, string> = {
  answer: 'the direct answer',
  summary: 'a short summary',
  insights: 'key insights',
  explainer: 'what the indicator means',
  kpis: 'key figures',
  charts: 'the charts',
}
const ROLE_TEXT: Record<string, string> = {
  ranking: 'a ranking',
  map: 'a map of Europe',
  change: 'the change',
  evolution: 'the evolution over time',
  headline: 'the headline value over time',
  composition: 'the shares of the total',
  price: 'what the price is made of',
  detail: 'the details',
}

/** The two variants of a kind, described in words (for the model's choice). */
export function describeVariants(kind: Kind): [string, string] {
  const describe = (t: Template) => {
    const first = t.layout
      .flat()
      .filter((k) => SECTION_TEXT[k])
      .slice(0, 2)
      .map((k) => SECTION_TEXT[k])
    const figures = t.kpiStyle === 'big' ? 'key figures as big numbers' : 'key figures as small cards'
    return `Starts with ${first.join(' and ')}; first chart: ${ROLE_TEXT[t.charts[0]] ?? t.charts[0]}; ${figures}${t.stackedBars ? '; shares as stacked columns' : ''}.`
  }
  return [describe(TEMPLATES[kind][0]), describe(TEMPLATES[kind][1])]
}

/** Prompt for the model: which of the two page variants fits the question better. */
export function variantPrompt(question: string, kind: Kind) {
  const [a, b] = describeVariants(kind)
  return [
    {
      role: 'system' as const,
      content: 'You choose the layout of an energy statistics dashboard. Answer with the number only.',
    },
    {
      role: 'user' as const,
      content: [`Question: "${question}"`, 'Layouts:', `1. ${a}`, `2. ${b}`, 'Which layout answers the question better? Answer with the number.'].join('\n'),
    },
  ]
}

/** Shares over time (stacked percent areas) as stacked percent columns: easier to read per year. */
function toStackedBars(w: WidgetSpec): WidgetSpec {
  if (w.type !== 'area' || w.stacked !== 'percent' || w.categories.length > 20) return w
  return { type: 'bar', title: w.title, subtitle: w.subtitle, categories: w.categories, series: w.series, stacked: 'percent', size: w.size, unit: w.unit, role: w.role }
}
