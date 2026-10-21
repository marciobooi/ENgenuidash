import type { DashboardSpec, WidgetSpec } from '../types'

/**
 * What the data on screen says, in words and figures, for the presentation: how the first time series changed, who is
 * highest and lowest in the first ranking, what the first breakdown is made of. Read from the spec itself (the same
 * numbers the charts draw), so the slides follow the view: prices, monthly data, trade and the rest each tell their own
 * numbers. Nothing here is written for a particular dashboard and nothing is invented.
 */
export interface StoryChange {
  measure: string
  unit: string
  from: { year: string; value: number }
  to: { year: string; value: number }
  peak: { year: string; value: number }
  low: { year: string; value: number }
  /** Change from the first to the last point, in %, or null when the first is zero. */
  pct: number | null
}
export interface StoryRanking {
  measure: string
  unit: string
  year?: string
  top: { name: string; value: number }[]
  bottom: { name: string; value: number }[]
  count: number
}
export interface StoryMakeup {
  measure: string
  unit: string
  parts: { name: string; value: number; share: number }[]
}
export interface Story {
  change?: StoryChange
  ranking?: StoryRanking
  makeup?: StoryMakeup
}

type Line = Extract<WidgetSpec, { type: 'line' | 'area' }>
type Bar = Extract<WidgetSpec, { type: 'bar' }>
type Pie = Extract<WidgetSpec, { type: 'pie' }>

const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

function changeOf(spec: DashboardSpec): StoryChange | undefined {
  const w = spec.widgets.find((x): x is Line => (x.type === 'line' || x.type === 'area') && x.categories.length >= 4 && x.series.length > 0)
  if (!w) return undefined
  // (the first series is the measure; later ones are paths to a target or the place compared with)
  const pts = w.categories.map((c, i) => ({ year: c, value: w.series[0].data[i] })).filter((p): p is { year: string; value: number } => num(p.value))
  if (pts.length < 3) return undefined
  const first = pts[0]
  const last = pts[pts.length - 1]
  const peak = pts.reduce((a, b) => (b.value > a.value ? b : a))
  const low = pts.reduce((a, b) => (b.value < a.value ? b : a))
  return { measure: w.title, unit: w.unit ?? spec.unit ?? '', from: first, to: last, peak, low, pct: first.value !== 0 ? ((last.value - first.value) / Math.abs(first.value)) * 100 : null }
}

function rankingOf(spec: DashboardSpec): StoryRanking | undefined {
  const w = spec.widgets.find((x): x is Bar => x.type === 'bar' && !x.stacked && x.categories.length >= 10 && x.series.length >= 1)
  if (!w) return undefined
  const rows = w.categories.map((name, i) => ({ name, value: w.series[0].data[i] })).filter((r): r is { name: string; value: number } => num(r.value) && !/^(eu|eu-27|total|all)$/i.test(r.name))
  if (rows.length < 6) return undefined
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const year = /\b(19|20)\d{2}\b/.exec(w.title)?.[0]
  return { measure: w.title, unit: w.unit ?? spec.unit ?? '', year, top: sorted.slice(0, 3), bottom: sorted.slice(-3).reverse(), count: rows.length }
}

function makeupOf(spec: DashboardSpec): StoryMakeup | undefined {
  const pie = spec.widgets.find((x): x is Pie => x.type === 'pie' && x.slices.length >= 2)
  let parts: { name: string; value: number }[] | undefined
  let measure = ''
  let unit = spec.unit ?? ''
  if (pie) {
    parts = pie.slices.filter((s) => s.y > 0).map((s) => ({ name: s.name, value: s.y }))
    measure = pie.title
    unit = pie.unit ?? unit
  } else {
    const bar = spec.widgets.find((x): x is Bar => x.type === 'bar' && !!x.stacked && x.series.length >= 2 && x.categories.length >= 1)
    if (bar) {
      const last = bar.categories.length - 1
      parts = bar.series.map((s) => ({ name: s.name, value: s.data[last] ?? 0 })).filter((p) => num(p.value) && p.value > 0)
      measure = `${bar.title} (${bar.categories[last]})`
      unit = bar.unit ?? unit
    }
  }
  if (!parts || parts.length < 2) return undefined
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (total <= 0) return undefined
  return { measure, unit, parts: parts.sort((a, b) => b.value - a.value).map((p) => ({ ...p, share: (100 * p.value) / total })) }
}

export function storyOf(spec: DashboardSpec): Story {
  return { change: changeOf(spec), ranking: rankingOf(spec), makeup: makeupOf(spec) }
}

/** Which "how to read this chart" sentence a chart gets. */
export function howKey(w: WidgetSpec): 'line' | 'rank' | 'stacked' | 'bars' | 'pie' | 'map' | 'table' | null {
  if (w.type === 'line' || w.type === 'area') return 'line'
  if (w.type === 'bar') return w.stacked ? 'stacked' : w.categories.length >= 10 ? 'rank' : 'bars'
  if (w.type === 'pie') return 'pie'
  if (w.type === 'map') return 'map'
  if (w.type === 'table') return 'table'
  return null
}
