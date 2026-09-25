import type { Source } from '../llm/grounding'

/** What the planner understood from a question. Everything needed to fetch and display data. */
export interface Plan {
  dataset: string
  /** Non-time filters; an array on one dimension makes that dimension the series. */
  filters: Record<string, string | string[]>
  time: TimeRange
  intent: 'trend' | 'compare' | 'mix' | 'snapshot'
  /**
   * What the question asks about, beyond the view ("which country is highest?", "how has it
   * changed?"): the dashboard then opens with a direct answer and the charts that support it.
   */
  focus?: QuestionFocus
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

export type QuestionFocus =
  /** The highest (or lowest) country, source… or, with `period`, year ("which year…?", "when…?"). */
  | { kind: 'which'; lowest?: boolean; period?: boolean }
  | { kind: 'change' }

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

/** The dataset a chart comes from, when it is not the dashboard's own. */
export interface WidgetSource {
  code: string
  url: string
}

/**
 * What a chart is for; the layout orders charts by the question's focus (ranking first for
 * "which…?", changes first for "how has it changed?").
 */
export type WidgetRole = 'headline' | 'ranking' | 'map' | 'change' | 'evolution' | 'composition' | 'detail' | 'related' | 'price'

/** The sections of a dashboard, in the order the spec lists them (see layout.ts). */
export type SectionKey = 'answer' | 'summary' | 'insights' | 'explainer' | 'notes' | 'toolbar' | 'suggestions' | 'kpis' | 'charts' | 'table'

/** A section, or sections side by side on wide screens (stacked on phones). */
export type LayoutItem = SectionKey | SectionKey[]

/** How the dashboard is presented (see layout.ts): chosen for the question, varied by topic. */
export interface Presentation {
  /** Which page template: the kind of question and one of its variants. */
  template: string
  /** Key figures as cards, or as a strip of big numbers with their change. */
  kpiStyle: 'cards' | 'big'
  /** Toolbar controls, most relevant first: 'period', 'year', 'unit' or a dimension ('geo'…). */
  controls: string[]
  /** How many toolbar controls show at once; the others are under "More filters". */
  primaryControls: number
  /** Accent of the page (ECL colours), so dashboards do not all look alike. */
  accent: 'blue' | 'teal' | 'violet' | 'orange'
  /** Who chose the variant: the topic (default) or the language model. */
  chosenBy?: 'topic' | 'model'
}

export type WidgetSpec = (
  | { type: 'kpis'; items: KpiSpec[] }
  | {
      /** The direct answer to the question, from the numbers ("Malta: 97.6% in 2023"). */
      type: 'answer'
      /** Full sentence, also read out and repeated in the chat. */
      text: string
      headline: string
      value?: string
      direction?: 'up' | 'down' | 'flat'
      facts?: { label: string; value: string }[]
    }
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
      /** A chart from another dataset than the dashboard's (see companions.ts). */
      source?: WidgetSource
      /** Stacked parts (price components, sources of a mix); 'percent' shows shares. */
      stacked?: boolean | 'percent'
    }
  | {
      type: 'pie'
      title: string
      subtitle?: string
      slices: { name: string; y: number }[]
      size?: WidgetSize
      centerLabel?: string
      unit?: string
      /** A chart from another dataset than the dashboard's (see companions.ts). */
      source?: WidgetSource
    }
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
      /** Explainer: Eurostat's own description of the indicator (from the local knowledge base). */
      type: 'text'
      title: string
      body: string
      source?: { code: string; title: string; url: string }
    }
  | {
      type: 'table'
      title: string
      columns: string[]
      rows: { label: string; values: (number | null)[]; flags?: (string | undefined)[] }[]
    }
) & { role?: WidgetRole }

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
  /** Year the period buttons count back from (a year or range end was asked for). */
  periodsTo?: string
  /** "Over time" in the year list: the latest ten years. */
  overTime?: Plan
  years?: { label: string; plan: Plan; active: boolean }[]
  units?: { label: string; plan: Plan; active: boolean }[]
  /** Comparisons of many countries: all of them, or the top / bottom 5 or 10. */
  ranks?: { label: string; plan: Plan; active: boolean }[]
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
  /** Order of the sections on the page, chosen for the question (see layout.ts). */
  layout: LayoutItem[]
  presentation: Presentation
  /** The question (or toolbar change) that produced this dashboard, for sharing it. */
  question?: string
  /** Codes actually shown per dimension (e.g. the 5 countries of a "top 5"), for the filters. */
  shown?: Record<string, string[]>
  source: Source
  unit?: string
  suggestions: Suggestion[]
  controls?: DashboardControls
  /** Compact plain-text version of the data, used when the model is asked to explain it. */
  context: string
  plan: Plan
}
