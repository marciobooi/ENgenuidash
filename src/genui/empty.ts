import type { WidgetSpec } from './types'

/**
 * Rows without data are left out of a chart and named under it instead ("No data for Albania,
 * Estonia in this selection."), so the chart shows what there is. A row is empty when it has no
 * value in any series (in stacked charts, zeros draw nothing either); a change of 0 is a value.
 * Charts over time keep their periods (a missing year is a gap, not a row), and charts with
 * switchable views are left as they are.
 */
const PERIOD = /^\d{4}(-(S[12]|Q[1-4]|\d{2}))?$/

export function dropEmptyRows(w: WidgetSpec, noDataFor: string): WidgetSpec {
  const note = (names: string[]) => [w.note, noDataFor.replace('{names}', names.join(', '))].filter(Boolean).join(' ')
  if (w.type === 'bar' && !w.views) {
    if (w.categories.some((c) => PERIOD.test(c))) return w
    const empty = w.categories.map((_, i) => w.series.every((s) => s.data[i] == null || (!!w.stacked && s.data[i] === 0)))
    if (!empty.some(Boolean) || empty.every(Boolean)) return w
    const keep = (_: unknown, i: number) => !empty[i]
    return {
      ...w,
      categories: w.categories.filter(keep),
      series: w.series.map((s) => ({ ...s, data: s.data.filter(keep) })),
      note: note(w.categories.filter((_, i) => empty[i])),
    }
  }
  if (w.type === 'dumbbell') {
    const empty = w.categories.map((_, i) => w.from.data[i] == null && w.to.data[i] == null)
    if (!empty.some(Boolean) || empty.every(Boolean)) return w
    const keep = (_: unknown, i: number) => !empty[i]
    return {
      ...w,
      categories: w.categories.filter(keep),
      from: { ...w.from, data: w.from.data.filter(keep) },
      to: { ...w.to, data: w.to.data.filter(keep) },
      note: note(w.categories.filter((_, i) => empty[i])),
    }
  }
  return w
}
