import { MAX_BARS } from './crowded'
import type { WidgetSpec } from './types'

/**
 * Rows without data are left out of a chart and named under it instead ("No data for Albania,
 * Estonia in this selection."), so the chart shows what there is. A row is empty when it has no
 * value in any series (in stacked charts, zeros draw nothing either); a change of 0 is a value.
 * Charts over time keep their periods (a missing year is a gap, not a row), and charts with
 * switchable views are left as they are.
 */
const PERIOD = /^\d{4}(-(S[12]|Q[1-4]|\d{2}))?$/

export function dropEmptyRows(w: WidgetSpec, noDataFor: string, zeroFor = ''): WidgetSpec {
  const note = (text: string, names: string[]) => [w.note, text.replace('{names}', names.join(', '))].filter(Boolean).join(' ')
  if (w.type === 'bar') {
    if (w.categories.some((c) => PERIOD.test(c))) return w
    const isNull = (i: number) => w.series.every((s) => s.data[i] == null || (!!w.stacked && s.data[i] === 0))
    // A ranking of values: a row that is zero everywhere draws nothing either (nobody produces
    // anthracite in 30 of the 37 countries): named under the chart, like the ones without data.
    const isZero = (i: number) => !!zeroFor && w.role === 'ranking' && !w.stacked && !w.signed && !isNull(i) && w.series.every((s) => s.data[i] == null || s.data[i] === 0)
    const empty = w.categories.map((_, i) => isNull(i))
    const zero = w.categories.map((_, i) => isZero(i))
    const drop = w.categories.map((_, i) => empty[i] || zero[i])
    if (!drop.some(Boolean) || drop.every(Boolean)) return w
    const keep = (_: unknown, i: number) => !drop[i]
    const noteText = [
      empty.some(Boolean) ? noDataFor.replace('{names}', w.categories.filter((_, i) => empty[i]).join(', ')) : '',
      zero.some(Boolean) ? zeroFor.replace('{names}', w.categories.filter((_, i) => zero[i]).join(', ')) : '',
    ].filter(Boolean)
    // Switchable views (changes compared with an earlier year): the countries with no change in a view
    // (no value then) are left out of that view too.
    const views = w.views?.map((v) => {
      const has = v.data.map((x) => x != null)
      return { ...v, categories: v.categories.filter((_, i) => has[i]), data: v.data.filter((_, i) => has[i]) }
    })
    return {
      ...w,
      categories: w.categories.filter(keep),
      series: w.series.map((x) => ({ ...x, data: x.data.filter(keep) })),
      ...(views ? { views } : {}),
      // (a chart that shrank to a few bars no longer needs the full row)
      ...(w.size === 'full' && w.categories.length > MAX_BARS && w.categories.filter(keep).length <= MAX_BARS ? { size: 'half' as const } : {}),
      note: [w.note, ...noteText].filter(Boolean).join(' '),
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
      note: note(noDataFor, w.categories.filter((_, i) => empty[i])),
    }
  }
  return w
}
