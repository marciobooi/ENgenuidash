import type { QuestionFocus, WidgetSpec } from './types'

/**
 * The direct answer to a focused question, computed from the numbers on screen (never written by
 * the model): "which country is the most dependent?" → the leader and its value; "which source is
 * the largest?" → the largest part and its share; "which year was the highest?" (one series) → the
 * peak; "how has it changed?" → the change over the period shown, or who changed the most.
 */

export interface AnswerStrings {
  title: string
  highest: string
  lowest: string
  mixTop: string
  mixBottom: string
  peak: string
  trough: string
  change: string
  changeMost: string
  next: string
}

export interface AnswerInput {
  focus: QuestionFocus
  /** Parts of one whole (a mix): the answer is a share of the total. */
  mix: boolean
  series: { name: string; data: (number | null)[] }[]
  euRef?: { name: string; data: (number | null)[] }
  periodLabels: string[]
  /** The period the dashboard is about (the year asked for, or the latest). */
  focusIndex: number
  /** A single year was asked for: changes are measured from the period before it. */
  singleYear: boolean
  isPercent: boolean
  unit?: string
  fmt: {
    value: (v: number, unit?: string) => string
    number: (v: number, decimals?: number) => string
    signed: (v: number, unit: string) => string
  }
}

type Answer = Extract<WidgetSpec, { type: 'answer' }>

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
const direction = (v: number): 'up' | 'down' | 'flat' => (Math.abs(v) < 0.05 ? 'flat' : v > 0 ? 'up' : 'down')

export function answerFor(a: AnswerInput, s: AnswerStrings): Answer | null {
  if (!a.series.length) return null
  return a.focus.kind === 'which' ? which(a, !!a.focus.lowest, s) : change(a, s)
}

function which(a: AnswerInput, lowest: boolean, s: AnswerStrings): Answer | null {
  const { series, focusIndex: at, periodLabels, fmt, unit } = a
  const period = periodLabels[at]

  // One series: the year (month…) with the highest or lowest value, when that was asked.
  if (series.length === 1) {
    if (!(a.focus.kind === 'which' && a.focus.period)) return null
    const values = series[0].data
    let best = -1
    values.forEach((v, k) => {
      if (v != null && (best < 0 || (lowest ? v < (values[best] as number) : v > (values[best] as number)))) best = k
    })
    if (best < 0) return null
    const value = fmt.value(values[best] as number, unit)
    const latest = values.findLastIndex((v) => v != null)
    return {
      type: 'answer',
      text: fill(lowest ? s.trough : s.peak, { period: periodLabels[best], value }),
      headline: periodLabels[best],
      value,
      facts: latest !== best ? [{ label: periodLabels[latest], value: fmt.value(values[latest] as number, unit) }] : [],
    }
  }

  const ranked = series
    .filter((x) => x.data[at] != null)
    .map((x) => ({ name: x.name, v: x.data[at] as number }))
    .sort((p, q) => (lowest ? p.v - q.v : q.v - p.v))
  if (!ranked.length) return null
  const [first, ...rest] = ranked

  // Parts of one whole: the share of the total.
  if (a.mix) {
    const total = ranked.reduce((n, r) => n + Math.max(r.v, 0), 0)
    if (total <= 0) return null
    const share = (v: number) => `${fmt.number((v / total) * 100, 1)}%`
    return {
      type: 'answer',
      text: fill(lowest ? s.mixBottom : s.mixTop, { name: first.name, share: share(first.v), value: fmt.value(first.v, unit), period }),
      headline: first.name,
      value: share(first.v),
      facts: rest.length ? [{ label: s.next, value: rest.slice(0, 2).map((r) => `${r.name} · ${share(r.v)}`).join(', ') }] : [],
    }
  }

  const eu = a.euRef?.data[at]
  const value = fmt.value(first.v, unit)
  return {
    type: 'answer',
    text: fill(lowest ? s.lowest : s.highest, { name: first.name, value, period }),
    headline: first.name,
    value,
    facts: [
      ...(eu != null && a.euRef ? [{ label: a.euRef.name, value: fmt.value(eu, unit) }] : []),
      ...(rest.length ? [{ label: s.next, value: rest.slice(0, 2).map((r) => `${r.name} · ${fmt.value(r.v, unit)}`).join(', ') }] : []),
    ],
  }
}

function change(a: AnswerInput, s: AnswerStrings): Answer | null {
  const { series, periodLabels, fmt, unit, isPercent } = a
  const changeUnit = isPercent ? 'pp' : '%'
  const valid = (k: number) => series.filter((x) => x.data[k] != null).length
  // The period measured: from the period before the year asked for, or from the first period
  // most series have, to the period the dashboard is about.
  const to = a.focusIndex
  const half = Math.ceil(series.length / 2)
  let from = -1
  if (a.singleYear) {
    for (let k = to - 1; k >= 0 && from < 0; k--) if (valid(k) >= half) from = k
  } else {
    for (let k = 0; k < to && from < 0; k++) if (valid(k) >= half) from = k
  }
  if (from < 0 || from >= to) return null
  const between = (d: (number | null)[]) => {
    const x = d[from]
    const y = d[to]
    if (x == null || y == null) return null
    return isPercent ? y - x : x !== 0 ? ((y - x) / Math.abs(x)) * 100 : null
  }
  const changes = series
    .map((x) => ({ x, c: between(x.data) }))
    .filter((r): r is { x: (typeof series)[number]; c: number } => r.c != null)
  if (!changes.length) return null
  const fromLabel = periodLabels[from]
  const toLabel = periodLabels[to]

  if (changes.length === 1) {
    const { x, c } = changes[0]
    const text = fmt.signed(c, changeUnit)
    return {
      type: 'answer',
      text: fill(s.change, {
        series: x.name,
        change: text,
        from: fromLabel,
        to: toLabel,
        fromValue: fmt.value(x.data[from] as number, unit),
        toValue: fmt.value(x.data[to] as number, unit),
      }),
      headline: text,
      value: `${fromLabel}–${toLabel}`,
      direction: direction(c),
      facts: [
        { label: fromLabel, value: fmt.value(x.data[from] as number, unit) },
        { label: toLabel, value: fmt.value(x.data[to] as number, unit) },
      ],
    }
  }

  // Several series: who changed the most (in either direction), then the others.
  const sorted = [...changes].sort((p, q) => Math.abs(q.c) - Math.abs(p.c))
  const top = sorted[0]
  const text = fmt.signed(top.c, changeUnit)
  return {
    type: 'answer',
    text: fill(s.changeMost, { name: top.x.name, from: fromLabel, to: toLabel, change: text }),
    headline: top.x.name,
    value: text,
    direction: direction(top.c),
    facts: sorted.slice(1, 4).map((r) => ({ label: r.x.name, value: fmt.signed(r.c, changeUnit) })),
  }
}
