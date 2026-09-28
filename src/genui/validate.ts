import { OVERVIEW_LAYOUT } from './layout'
import type { DashboardSpec, SectionKey, WidgetSpec } from './types'

/**
 * Checks a DashboardSpec at runtime, whoever produced it (the composer today; a model or a shared
 * link later): each widget must be drawable (known type, series as long as the categories, finite
 * numbers…). A widget that is not is left out instead of breaking the page; the problems are
 * returned so they can be logged. The layout falls back to the overview when it is not valid.
 */

const SECTIONS: SectionKey[] = ['answer', 'summary', 'insights', 'explainer', 'notes', 'toolbar', 'suggestions', 'kpis', 'charts', 'table']

const num = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)
const numOrNull = (v: unknown): boolean => v === null || num(v)
const text = (v: unknown): boolean => typeof v === 'string'
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const values = (v: unknown, length: number): boolean => Array.isArray(v) && v.length === length && v.every(numOrNull)

/**
 * Beyond these a chart is a runaway (a plan that asked for every code of a big dimension), not a
 * reading: it is left out, and the rest of the dashboard stays. Monthly data over 20 years is 240.
 */
export const MAX_CATEGORIES = 400
export const MAX_SERIES = 60

/** Why a widget cannot be drawn, or null when it can. */
export function widgetProblem(w: WidgetSpec): string | null {
  const categories = 'categories' in w && Array.isArray(w.categories) ? w.categories.length : 0
  const series = 'series' in w && Array.isArray(w.series) ? w.series.length : 0
  if (categories > MAX_CATEGORIES || series > MAX_SERIES) return `${w.type}: too large (${categories} categories, ${series} series)`
  switch (w.type) {
    case 'kpis':
      return Array.isArray(w.items) && w.items.every((k) => text(k.label) && num(k.value)) ? null : 'KPI without a label or value'
    case 'answer':
      return text(w.text) && w.text && text(w.headline) && w.headline ? null : 'answer without text'
    case 'line':
    case 'area':
    case 'bar':
      if (!texts(w.categories)) return `${w.type}: categories`
      if (!Array.isArray(w.series) || !w.series.length) return `${w.type}: no series`
      if (!w.series.every((x) => text(x.name) && values(x.data, w.categories.length))) return `${w.type}: series do not match the categories`
      if (w.type === 'bar' && w.views && !w.views.every((v) => text(v.label) && text(v.title) && texts(v.categories) && values(v.data, v.categories.length)))
        return 'bar: views do not match their categories'
      return null
    case 'pie':
      return Array.isArray(w.slices) && w.slices.length > 0 && w.slices.every((x) => text(x.name) && num(x.y) && x.y >= 0) ? null : 'pie: slices'
    case 'hero':
      if (!texts(w.categories) || !values(w.data, w.categories.length)) return 'hero: data do not match the categories'
      return Number.isInteger(w.highlightIndex) && w.highlightIndex >= 0 && w.highlightIndex < w.categories.length ? null : 'hero: highlight'
    case 'heatmap':
      if (!texts(w.xCategories) || !texts(w.yCategories)) return 'heatmap: categories'
      return Array.isArray(w.values) && w.values.length === w.yCategories.length && w.values.every((r) => values(r, w.xCategories.length))
        ? null
        : 'heatmap: values do not match the categories'
    case 'dumbbell':
      if (!texts(w.categories) || !w.categories.length) return 'dumbbell: categories'
      return text(w.from?.name) && text(w.to?.name) && values(w.from.data, w.categories.length) && values(w.to.data, w.categories.length)
        ? null
        : 'dumbbell: values do not match the categories'
    case 'bubble':
      if (!text(w.x?.label) || !text(w.y?.label) || !text(w.z?.label)) return 'bubble: axes'
      return Array.isArray(w.points) && w.points.length >= 2 && w.points.every((p) => text(p.name) && num(p.x) && num(p.y) && num(p.z) && p.z >= 0)
        ? null
        : 'bubble: points'
    case 'map':
      return Array.isArray(w.data) && w.data.every((d) => /^[A-Z]{2}$/.test(d.code) && text(d.name) && num(d.value)) ? null : 'map: data'
    case 'breakdown':
      return Array.isArray(w.items) && w.items.every((i) => text(i.name) && text(i.value)) ? null : 'breakdown: items'
    case 'text':
      return text(w.title) && text(w.body) && w.body.length > 0 ? null : 'text without a body'
    case 'balance':
      if (!text(w.query?.geo) || !text(w.query?.unit) || !text(w.query?.year)) return 'balance: query'
      if (!Array.isArray(w.columns) || !w.columns.every((c) => text(c.code) && text(c.label))) return 'balance: columns'
      return Array.isArray(w.rows) && w.rows.length > 0 && w.rows.every((r) => text(r.code) && text(r.label) && Number.isInteger(r.level) && values(r.values, w.columns.length))
        ? null
        : 'balance: rows do not match the columns'
    case 'table':
      if (!texts(w.columns)) return 'table: columns'
      return Array.isArray(w.rows) && w.rows.every((r) => text(r.label) && values(r.values, w.columns.length)) ? null : 'table: rows do not match the columns'
    default:
      return `unknown widget type ${(w as { type?: unknown }).type}`
  }
}

export function sanitizeSpec(spec: DashboardSpec): { spec: DashboardSpec; problems: string[] } {
  const problems: string[] = []
  const widgets = spec.widgets.filter((w) => {
    const problem = widgetProblem(w)
    if (problem) problems.push(problem)
    return !problem
  })
  const keys = Array.isArray(spec.layout) ? spec.layout.flat() : []
  const layoutOk =
    Array.isArray(spec.layout) &&
    spec.layout.every((item) => (Array.isArray(item) ? item.length > 0 && item.length <= 3 : true)) &&
    keys.every((k) => SECTIONS.includes(k)) &&
    new Set(keys).size === keys.length
  if (!layoutOk) problems.push('layout')
  const accents = ['blue', 'teal', 'violet', 'orange']
  const p = spec.presentation
  const presentationOk =
    !!p && ['cards', 'big'].includes(p.kpiStyle) && accents.includes(p.accent) && texts(p.controls) && Number.isInteger(p.primaryControls) && p.primaryControls >= 1
  if (!presentationOk) problems.push('presentation')
  return {
    spec: {
      ...spec,
      widgets,
      layout: layoutOk ? spec.layout : OVERVIEW_LAYOUT,
      presentation: presentationOk ? p : { template: 'default', kpiStyle: 'cards', controls: [], primaryControls: 3, accent: 'blue' },
    },
    problems,
  }
}
