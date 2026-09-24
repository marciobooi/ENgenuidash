import type { Insight, InsightPart, Plan } from './types'

/**
 * Key insights: short findings computed from the fetched numbers (records, streaks, leaders,
 * gaps, fastest movers, EU-average comparisons, mix shifts). Deterministic and translated, so
 * every sentence can be traced back to the data table — the language model is not involved.
 * Which findings are picked depends on the question: a year comparison talks about ranks and
 * gaps in that year, a trend about growth and convergence, a mix about shares and shifts.
 */

export interface InsightStrings {
  record: string
  recordLow: string
  streakUp: string
  streakDown: string
  sinceStart: string
  cagr: string
  vsAverage: string
  vsAverageBelow: string
  biggestJump: string
  biggestDrop: string
  leader: string
  gapRatio: string
  gapPoints: string
  aboveEu: string
  topRiser: string
  topFaller: string
  fastestGrowth: string
  steepestDecline: string
  leaderChanged: string
  converged: string
  diverged: string
  mixTop: string
  mixConcentration: string
  mixGainer: string
  mixLoser: string
}

interface Series {
  code: string
  name: string
  data: (number | null)[]
}

export interface InsightInput {
  intent: Plan['intent']
  multi: boolean
  focusPeriod?: string
  series: Series[]
  euRef?: Series
  periodLabels: string[]
  focusIndex: number
  perYear: number
  isPercent: boolean
  unit?: string
  fmt: {
    value: (v: number, unit?: string) => string
    number: (v: number, d?: number) => string
    signed: (v: number, unit: string) => string
  }
}

const MAX_INSIGHTS = 4

/** Fills a template; placeholder values become emphasised parts. */
function parts(template: string, values: Record<string, string>): InsightPart[] {
  const out: InsightPart[] = []
  let last = 0
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) out.push(template.slice(last, m.index))
    out.push({ strong: values[m[1]] ?? '' })
    last = m.index + m[0].length
  }
  if (last < template.length) out.push(template.slice(last))
  return out
}

const nonNull = (data: (number | null)[]) => data.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)

export function computeInsights(input: InsightInput, s: InsightStrings): Insight[] {
  const { series, periodLabels: P, fmt, unit, isPercent } = input
  const changeUnit = isPercent ? 'pp' : '%'
  const change = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : isPercent ? b - a : a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null
  const val = (v: number) => fmt.value(v, unit)
  const out: Insight[] = []
  const add = (tone: Insight['tone'], template: string, values: Record<string, string>) => out.push({ tone, parts: parts(template, values) })

  if (!input.multi) {
    // ---------- one series over time ----------
    const x = series[0]
    const pts = nonNull(x.data)
    if (pts.length < 3) return out
    const at = input.focusPeriod ? input.focusIndex : pts[pts.length - 1].i
    const cur = x.data[at]
    if (cur == null) return out
    const upTo = pts.filter((p) => p.i <= at)
    const max = Math.max(...pts.map((p) => p.v))
    const min = Math.min(...pts.map((p) => p.v))
    if (cur === max) add('record', s.record, { period: P[at], value: val(cur), since: P[pts[0].i] })
    else if (cur === min) add('down', s.recordLow, { period: P[at], value: val(cur), since: P[pts[0].i] })

    // Consecutive rises / falls ending at the period shown.
    let streak = 0
    let dir = 0
    for (let k = upTo.length - 1; k > 0; k--) {
      const d = Math.sign(upTo[k].v - upTo[k - 1].v)
      if (d === 0 || (dir && d !== dir)) break
      dir = d
      streak++
    }
    if (streak >= 3) add(dir > 0 ? 'up' : 'down', dir > 0 ? s.streakUp : s.streakDown, { n: String(streak), period: P[at] })

    // Long-term change and average growth per year.
    const first = upTo[0]
    const years = (at - first.i) / input.perYear
    const total = change(first.v, cur)
    if (total != null && at !== first.i) {
      if (!isPercent && first.v > 0 && cur > 0 && years >= 3) {
        const rate = (Math.pow(cur / first.v, 1 / years) - 1) * 100
        add(rate >= 0 ? 'up' : 'down', s.cagr, { change: fmt.signed(total, '%'), since: P[first.i], rate: fmt.signed(rate, '%') })
      } else {
        add(total >= 0 ? 'up' : 'down', s.sinceStart, { change: fmt.signed(total, changeUnit), since: P[first.i] })
      }
    }

    // Against the average of the period.
    const avg = pts.reduce((n, p) => n + p.v, 0) / pts.length
    const vsAvg = change(avg, cur)
    if (vsAvg != null && Math.abs(vsAvg) >= 1) {
      add('neutral', vsAvg > 0 ? s.vsAverage : s.vsAverageBelow, {
        period: P[at],
        diff: fmt.signed(Math.abs(vsAvg), changeUnit).replace(/^[+-]/, ''),
        average: val(avg),
      })
    }

    // Largest single-period move.
    let best: { d: number; i: number } | null = null
    for (let k = 1; k < pts.length; k++) {
      const d = change(pts[k - 1].v, pts[k].v)
      if (d != null && (!best || Math.abs(d) > Math.abs(best.d))) best = { d, i: pts[k].i }
    }
    if (best && Math.abs(best.d) >= 0.1) {
      add(best.d > 0 ? 'up' : 'down', best.d > 0 ? s.biggestJump : s.biggestDrop, { change: fmt.signed(best.d, changeUnit), period: P[best.i] })
    }
    return out.slice(0, MAX_INSIGHTS)
  }

  if (input.intent === 'mix') {
    // ---------- composition ----------
    const at = input.focusIndex
    const slices = series
      .map((x) => ({ x, v: x.data[at] ?? 0 }))
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v)
    const total = slices.reduce((n, r) => n + r.v, 0)
    if (!slices.length || !total) return out
    add('record', s.mixTop, { name: slices[0].x.name, share: `${fmt.number((slices[0].v / total) * 100, 1)}%`, period: P[at] })
    if (slices.length >= 3) {
      const top2 = ((slices[0].v + slices[1].v) / total) * 100
      add('neutral', s.mixConcentration, { a: slices[0].x.name, b: slices[1].x.name, share: `${fmt.number(top2, 1)}%` })
    }
    // Share shift since the first period with data.
    const start = Math.min(...series.map((x) => x.data.findIndex((v) => v != null)).filter((k) => k >= 0))
    const totalAt = (k: number) => series.reduce((n, x) => n + Math.max(x.data[k] ?? 0, 0), 0)
    const t0 = totalAt(start)
    if (start < at && t0 > 0) {
      const shifts = series
        .map((x) => ({ name: x.name, d: ((x.data[at] ?? 0) / total - (x.data[start] ?? 0) / t0) * 100 }))
        .sort((a, b) => b.d - a.d)
      const gain = shifts[0]
      const loss = shifts[shifts.length - 1]
      if (gain && gain.d >= 0.5) add('up', s.mixGainer, { name: gain.name, change: fmt.signed(gain.d, 'pp'), since: P[start] })
      if (loss && loss.d <= -0.5) add('down', s.mixLoser, { name: loss.name, change: fmt.signed(loss.d, 'pp'), since: P[start] })
    }
    return out.slice(0, MAX_INSIGHTS)
  }

  if (input.intent === 'compare') {
    // ---------- countries (or products) in one period ----------
    const at = input.focusIndex
    const ranked = series
      .map((x) => ({ x, v: x.data[at] }))
      .filter((r): r is { x: Series; v: number } => r.v != null)
      .sort((a, b) => b.v - a.v)
    if (ranked.length < 2) return out
    const top = ranked[0]
    const bottom = ranked[ranked.length - 1]
    add('record', s.leader, { name: top.x.name, value: val(top.v), period: P[at] })
    if (isPercent || bottom.v <= 0 || top.v / bottom.v < 1.5) {
      add('neutral', s.gapPoints, { a: top.x.name, b: bottom.x.name, gap: fmt.value(top.v - bottom.v, isPercent ? 'pp' : unit) })
    } else {
      add('neutral', s.gapRatio, { a: top.x.name, b: bottom.x.name, ratio: `${fmt.number(top.v / bottom.v, 1)}×` })
    }
    const eu = input.euRef?.data[at]
    if (eu != null && ranked.length >= 3) {
      const above = ranked.filter((r) => r.v > eu).length
      add('neutral', s.aboveEu, { n: String(above), total: String(ranked.length), eu: val(eu) })
    }
    const moves = ranked
      .map((r) => {
        const prev = r.x.data.slice(0, at).findLastIndex((v) => v != null)
        return { name: r.x.name, d: prev >= 0 ? change(r.x.data[prev], r.v) : null, prev }
      })
      .filter((m): m is { name: string; d: number; prev: number } => m.d != null)
      .sort((a, b) => b.d - a.d)
    const riser = moves[0]
    const faller = moves[moves.length - 1]
    if (riser && riser.d > 0) add('up', s.topRiser, { name: riser.name, change: fmt.signed(riser.d, changeUnit), period: P[riser.prev] })
    if (faller && faller.d < 0 && faller !== riser) add('down', s.topFaller, { name: faller.name, change: fmt.signed(faller.d, changeUnit), period: P[faller.prev] })
    return out.slice(0, MAX_INSIGHTS + 1)
  }

  // ---------- several series over time ----------
  const growth = series
    .map((x) => {
      const pts = nonNull(x.data)
      if (pts.length < 2) return null
      return { name: x.name, d: change(pts[0].v, pts[pts.length - 1].v), from: pts[0].i }
    })
    .filter((g): g is { name: string; d: number; from: number } => g?.d != null)
    .sort((a, b) => b.d - a.d)
  const latest = Math.max(...series.map((x) => x.data.findLastIndex((v) => v != null)))
  const start = Math.min(...series.map((x) => x.data.findIndex((v) => v != null)).filter((k) => k >= 0))
  const rankAt = (k: number) =>
    series
      .map((x) => ({ name: x.name, v: x.data[k] }))
      .filter((r): r is { name: string; v: number } => r.v != null)
      .sort((a, b) => b.v - a.v)
  const now = rankAt(latest)
  const then = rankAt(start)
  if (now[0]) add('record', s.leader, { name: now[0].name, value: val(now[0].v), period: P[latest] })
  if (growth[0] && growth[0].d > 0) add('up', s.fastestGrowth, { name: growth[0].name, change: fmt.signed(growth[0].d, changeUnit), since: P[growth[0].from] })
  const worst = growth[growth.length - 1]
  if (worst && worst.d < 0) add('down', s.steepestDecline, { name: worst.name, change: fmt.signed(worst.d, changeUnit), since: P[worst.from] })
  if (then[0] && now[0] && then[0].name !== now[0].name && start < latest) {
    add('neutral', s.leaderChanged, { a: now[0].name, b: then[0].name, since: P[start] })
  }
  // Spread between highest and lowest: are the series converging?
  if (now.length >= 3 && then.length >= 3 && start < latest) {
    const spread = (r: { v: number }[]) => r[0].v - r[r.length - 1].v
    const a = spread(then)
    const b = spread(now)
    if (a > 0 && Math.abs(b - a) / a >= 0.1) {
      add('neutral', b < a ? s.converged : s.diverged, { since: P[start], from: fmt.value(a, isPercent ? 'pp' : unit), to: fmt.value(b, isPercent ? 'pp' : unit) })
    }
  }
  return out.slice(0, MAX_INSIGHTS + 1)
}
