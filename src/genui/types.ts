import type { Source } from '../llm/grounding'

/** What the planner understood from a question. Everything needed to fetch and display data. */
export interface Plan {
  dataset: string
  /** Non-time filters; an array on one dimension makes that dimension the series. */
  filters: Record<string, string | string[]>
  time: TimeRange
  intent: 'trend' | 'compare' | 'mix' | 'snapshot'
  /** Year shown in snapshot views (annual data). */
  focusPeriod?: string
  /** Set when the user asked for every EU country. */
  allCountries?: boolean
  /** "Top 5" / "bottom 3": keep only the n highest (or lowest) countries in the focus period. */
  top?: { n: number; lowest?: boolean }
  /** Monthly variant of the dataset, if one exists (for the "Show monthly" suggestion). */
  monthlyDataset?: string
  /** Planner notes shown under the summary, e.g. "Monthly data is not available for this topic". */
  notes?: NoteKey[]
  /** Chart type the user asked for ("show as bar chart"); overrides the automatic choice. */
  chart?: ChartKind
  /**
   * Set when the dataset came from the dictionary search: if Eurostat has no values there for
   * this selection, the question is planned again without the datasets already tried.
   */
  retry?: { question: string; tried: string[] }
}

export type ChartKind = 'line' | 'bar' | 'area' | 'pie' | 'table'

export type TimeRange = { kind: 'all' } | { kind: 'last'; n: number } | { kind: 'range'; since?: string; until?: string }

export type NoteKey = 'noMonthly' | 'assumedHouseholds' | 'assumedEu'

/** A question the assistant asks back, with one-click answers. */
export interface Clarification {
  question: 'whichPrices'
  options: { label: string; query: string }[]
}

/** Layout hint: 'full' spans the whole dashboard width, 'half' sits next to another chart. */
export type WidgetSize = 'full' | 'half'

export type WidgetSpec =
  | { type: 'kpis'; items: KpiSpec[] }
  | {
      type: 'line' | 'area'
      title: string
      subtitle?: string
      categories: string[]
      series: SeriesSpec[]
      stacked?: boolean | 'percent'
      size?: WidgetSize
      /** Dashed reference line, e.g. the average over the period. */
      reference?: { value: number; label: string }
      /** Category to highlight (the year the question asked about). */
      highlight?: string
      /** Overrides the dashboard unit (e.g. "%" for share-over-time charts). */
      unit?: string
    }
  | {
      type: 'bar'
      title: string
      subtitle?: string
      categories: string[]
      series: SeriesSpec[]
      horizontal?: boolean
      size?: WidgetSize
      /** Dashed reference line, e.g. the EU-27 value. */
      reference?: { value: number; label: string }
      /** Values can be negative (changes): colour decreases differently from increases. */
      signed?: boolean
      unit?: string
      decimals?: number
    }
  | { type: 'pie'; title: string; subtitle?: string; slices: { name: string; y: number }[]; size?: WidgetSize; centerLabel?: string }
  | {
      type: 'hero'
      title: string
      subtitle?: string
      categories: string[]
      data: (number | null)[]
      highlightIndex: number
      value: string
      change?: { text: string; direction: 'up' | 'down' | 'flat'; label: string }
      chips?: { label: string; text: string; direction: 'up' | 'down' | 'flat' }[]
      reference?: { value: number; label: string }
      size?: WidgetSize
    }
  | {
      type: 'heatmap'
      title: string
      subtitle?: string
      xCategories: string[]
      yCategories: string[]
      values: (number | null)[][]
      size?: WidgetSize
    }
  | { type: 'map'; title: string; subtitle?: string; data: { code: string; name: string; value: number }[]; size?: WidgetSize; height?: number }
  | {
      type: 'breakdown'
      title: string
      subtitle?: string
      /** Headline (e.g. a total or the leading item). */
      headline?: { label: string; value: string }
      items: { name: string; value: string; change?: { text: string; direction: 'up' | 'down' | 'flat' } }[]
      /** Small area chart under the list. */
      trend?: { label: string; categories: string[]; data: (number | null)[] }
      size?: WidgetSize
    }
  | {
      type: 'table'
      title: string
      columns: string[]
      rows: { label: string; values: (number | null)[]; flags?: (string | undefined)[] }[]
    }

export interface KpiSpec {
  label: string
  value: number
  unit?: string
  delta?: number
  deltaUnit?: string
  deltaLabel?: string
  caption?: string
  goodDirection?: 'up' | 'down' | 'neutral'
  decimals?: number
  /** Values over time for a sparkline in the card. */
  trend?: (number | null)[]
}

import type { InsightItem, InsightPart } from '../components/insights'

export type Insight = InsightItem
export type { InsightPart }

export interface SeriesSpec {
  name: string
  data: (number | null)[]
}

export interface Suggestion {
  /** Translated chip label; also shown as the user's message when clicked. */
  label: string
  /** Either a new plan to run directly… */
  plan?: Plan
  /** …or a request for the language model to explain the current figures. */
  explain?: boolean
}

/** Dashboard toolbar: each option carries the plan it switches to. */
export interface DashboardControls {
  periods?: { label: string; plan: Plan; active: boolean }[]
  years?: { label: string; plan: Plan; active: boolean }[]
  units?: { label: string; plan: Plan; active: boolean }[]
}

export interface DashboardSpec {
  title: string
  subtitle: string
  /** Deterministic, translated summary built from the numbers themselves. */
  summary: string[]
  /** Key insights computed from the numbers (see insights.ts). */
  insights: Insight[]
  notes: string[]
  widgets: WidgetSpec[]
  source: Source
  unit?: string
  suggestions: Suggestion[]
  controls?: DashboardControls
  /** Compact plain-text version of the data, used when the model is asked to explain it. */
  context: string
  plan: Plan
}
