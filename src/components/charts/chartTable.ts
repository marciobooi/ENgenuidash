import type Highcharts from 'highcharts'

/** A chart's data as a table: one row per category (year, country, slice…), one column per series. */
export interface ChartTable {
  head: string[]
  rows: { label: string; cells: (number | null)[] }[]
}

interface PointLike {
  category?: string | number
  name?: string
  x?: number
  y?: number | null
  z?: number | null
  value?: number | null
  options?: { value?: number | null }
}

/** Rows become columns and columns rows (the first column header stays in place). */
export function transpose(t: ChartTable): ChartTable {
  return {
    head: [t.head[0], ...t.rows.map((r) => r.label)],
    rows: t.head.slice(1).map((label, j) => ({ label, cells: t.rows.map((r) => r.cells[j] ?? null) })),
  }
}

/**
 * The table the way it reads best: the longer dimension down the rows (a few countries over
 * thirty years lists the years, not thirty columns), so it scrolls vertically, not sideways.
 */
export function readable(t: ChartTable): ChartTable {
  return t.head.length - 1 > t.rows.length && t.rows.length > 0 ? transpose(t) : t
}

/**
 * Reads the table from the rendered chart, so it always matches what is drawn (views switched in
 * the chart, stacked parts, pie slices, heat map cells, bubbles). Decorative series (the thin
 * range of a dumbbell) are left out.
 */
export function chartTable(chart: Highcharts.Chart, rowHeader: string): ChartTable {
  const series = chart.series.filter(
    (s) => s.options.showInLegend !== false || s.type === 'pie' || s.type === 'heatmap' || s.type === 'map' || s.type === 'bubble',
  ).filter((s) => s.type !== 'columnrange' && (s.options as { enableMouseTracking?: boolean }).enableMouseTracking !== false)
  const points = (s: Highcharts.Series) => s.points as unknown as PointLike[]
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  // Heat map: rows are the y categories, columns the x categories.
  const heat = series.find((s) => s.type === 'heatmap')
  if (heat) {
    const xs = (chart.xAxis[0]?.categories ?? []) as string[]
    const ys = (chart.yAxis[0]?.categories ?? []) as string[]
    const rows = ys.map((label) => ({ label, cells: xs.map(() => null as number | null) }))
    for (const p of points(heat)) {
      const yi = num(p.y)
      const xi = num(p.x)
      if (yi != null && xi != null && rows[yi]) rows[yi].cells[xi] = num(p.value ?? p.options?.value)
    }
    return { head: [rowHeader, ...xs], rows }
  }

  // Bubble: one row per point, the three measures as columns (axis titles).
  const bubble = series.find((s) => s.type === 'bubble')
  if (bubble) {
    const title = (a: Highcharts.Axis | undefined) => (a?.options.title?.text as string | undefined) ?? ''
    return {
      head: [rowHeader, title(chart.xAxis[0]), title(chart.yAxis[0]), bubble.name],
      rows: points(bubble).map((p) => ({ label: p.name ?? '', cells: [num(p.x), num(p.y), num(p.z)] })),
    }
  }

  // Map and pie: one value per named point.
  const named = series.find((s) => s.type === 'map' || s.type === 'pie')
  if (named) {
    return {
      head: [rowHeader, named.name],
      rows: points(named)
        .filter((p) => p.name)
        .map((p) => ({ label: p.name as string, cells: [num(named.type === 'map' ? (p.value ?? p.options?.value) : p.y)] })),
    }
  }

  // Everything else: categories (years, countries…) as rows, series as columns.
  const categories = (chart.xAxis[0]?.categories ?? []) as string[]
  const labels: string[] = [...categories]
  const index = new Map(labels.map((c, i) => [c, i]))
  const keyOf = (p: PointLike) => {
    if (typeof p.category === 'string') return p.category
    if (p.name) return p.name
    return categories[p.x ?? -1] ?? String(p.x ?? '')
  }
  for (const s of series) {
    for (const p of points(s)) {
      const key = keyOf(p)
      if (!index.has(key)) {
        index.set(key, labels.length)
        labels.push(key)
      }
    }
  }
  const rows = labels.map((label) => ({ label, cells: series.map(() => null as number | null) }))
  series.forEach((s, si) => {
    for (const p of points(s)) rows[index.get(keyOf(p))!].cells[si] = num(p.y)
  })
  return { head: [rowHeader, ...series.map((s) => s.name)], rows: rows.filter((r) => r.cells.some((c) => c != null)) }
}
