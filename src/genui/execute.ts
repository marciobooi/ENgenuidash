import {
  fetchEurostatData,
  pick,
  type EnergyDictionary,
  type EurostatResult,
} from '../data/eurostat'
import { ELECTRICITY_MIX, ENERGY_MIX, EU27 } from './concepts'
import { computeInsights, type InsightStrings } from './insights'
import { monthlyFilters } from './planner'
import type { DashboardControls, DashboardSpec, KpiSpec, Plan, Suggestion, WidgetSpec } from './types'

/**
 * Executes a Plan: fetches the data from Eurostat and composes a DashboardSpec (plain JSON)
 * that <Dashboard> mounts. All numbers in the spec come straight from the API response.
 */

export interface DashStrings {
  latest: string
  highest: string
  lowest: string
  total: string
  vs: string
  dataTable: string
  summaryLatest: string
  summaryChange: string
  summaryRange: string
  summaryCompare: string
  summaryMix: string
  noData: string
  noteNoMonthly: string
  noteAssumedHouseholds: string
  noteAssumedEu: string
  sugAllCountries: string
  sugWithEu: string
  sugHistory: string
  sugMonthly: string
  sugMix: string
  sugExplain: string
  sugUnit: string
  noteCached: string
  evolution: string
  rankingIn: string
  changeVs: string
  changeSince: string
  shareOfTotal: string
  yearOnYear: string
  average: string
  selectionAverage: string
  sharesOverTime: string
  mixRanking: string
  heatmapTitle: string
  yearsShort: string
  allYears: string
  noteTop: string
  noteBottom: string
  insights: InsightStrings
}

const MAX_SERIES = 6

/** Friendlier labels for codes whose official name is technical (e.g. SIEC N900H "Nuclear heat"). */
const FRIENDLY: Record<string, Record<string, string>> = {
  N900H: { en: 'Nuclear', de: 'Kernenergie', fr: 'Nucléaire' },
  'C0000X0350-0370': { en: 'Coal', de: 'Kohle', fr: 'Charbon' },
  O4000XBIO: { en: 'Oil', de: 'Öl', fr: 'Pétrole' },
  RA000: { en: 'Renewables', de: 'Erneuerbare', fr: 'Renouvelables' },
}

export class NoDataError extends Error {}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
}

export async function buildDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: DashStrings,
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const ds = dict.datasets[plan.dataset]
  const geoCodes = ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []

  // In country comparisons also fetch the EU aggregate as a reference value.
  const filters = { ...plan.filters }
  const withEuReference = plan.intent === 'compare' && Array.isArray(filters.geo) && geoCodes.includes('EU27_2020')
  if (withEuReference && !(filters.geo as string[]).includes('EU27_2020')) {
    filters.geo = [...(filters.geo as string[]), 'EU27_2020']
  }

  const result = await fetchEurostatData(plan.dataset, {
    filters,
    ...(plan.time.kind === 'last' ? { lastTimePeriod: plan.time.n } : {}),
    ...(plan.time.kind === 'range' ? { sinceTimePeriod: plan.time.since, untilTimePeriod: plan.time.until } : {}),
    lang,
    signal,
  })

  const fmt = numberFormat(lang, plan, result)
  const unitCode = result.dimensions.unit?.codes[0]?.code
  const currency = result.dimensions.currency?.codes[0]?.code
  // Unit symbols come from the dictionary (e.g. KTOE → "ktoe"); prices combine currency + unit.
  const unitInfo = unitCode ? dict.units[unitCode] : undefined
  const unit =
    unitCode === 'KWH' && currency
      ? `${currency}/kWh`
      : unitCode === 'GJ_GCV' && currency
        ? `${currency}/GJ`
        : unitCode === 'NR'
          ? undefined
          : (unitInfo?.symbol ?? result.dimensions.unit?.codes[0]?.label)
  const isPercent = unitCode === 'PC'

  // Which dimension varies? That one becomes the series (countries, products…).
  const seriesDim = result.dimensionIds.find((id) => id !== 'time' && (result.dimensions[id]?.codes.length ?? 0) > 1)
  const periods = result.dimensions.time?.codes ?? []
  const lookup = new Map(result.observations.map((o) => [`${seriesDim ? o.keys[seriesDim] : ''}|${o.keys.time}`, o]))

  // Long or technical labels read badly in charts; use the common short form.
  const shortName = (code: string | undefined, label: string | undefined) =>
    code === 'EU27_2020' ? 'EU-27' : code === 'EA20' ? 'Euro area' : code && FRIENDLY[code]?.[lang] ? FRIENDLY[code][lang] : label
  const geo0 = result.dimensions.geo?.codes[0]
  let series = (seriesDim ? result.dimensions[seriesDim].codes : [{ code: '', label: '' }]).map((sc) => ({
    code: sc.code,
    name: (seriesDim ? shortName(sc.code, sc.label) : shortName(geo0?.code, geo0?.label)) || pick(ds.title, lang, ds.code),
    data: periods.map((p) => lookup.get(`${sc.code}|${p.code}`)?.value ?? null),
    flags: periods.map((p) => lookup.get(`${sc.code}|${p.code}`)?.flag),
  }))
  series = series.filter((x) => x.data.some((v) => v != null))
  if (!series.length) throw new NoDataError(s.noData)

  const euRef = withEuReference ? series.find((x) => x.code === 'EU27_2020') : undefined
  if (euRef) series = series.filter((x) => x !== euRef)

  const periodLabels = periods.map((p) => p.label)
  const latestIndex = (data: (number | null)[]) => data.findLastIndex((v) => v != null)
  const focusIndex = plan.focusPeriod
    ? Math.max(periods.findIndex((p) => p.code === plan.focusPeriod), 0)
    : Math.max(...series.map((x) => latestIndex(x.data)))

  // "Top 5" / "bottom 3": keep the n highest (lowest) countries in the period shown.
  let topNote: string | undefined
  if (plan.top && seriesDim === 'geo' && series.length > plan.top.n) {
    const { n, lowest } = plan.top
    const total = series.filter((x) => x.data[focusIndex] != null).length
    series = series
      .filter((x) => x.data[focusIndex] != null)
      .sort((a, b) => ((lowest ? 1 : -1) * ((a.data[focusIndex] as number) - (b.data[focusIndex] as number))))
      .slice(0, n)
    topNote = fill(lowest ? s.noteBottom : s.noteTop, { n: String(series.length), total: String(total), period: periods[focusIndex]?.label ?? '' })
  }

  // ---------- titles ----------
  const selectionLabels = result.dimensionIds
    .filter((id) => !['time', 'freq', 'unit', 'currency', 'geo', seriesDim].includes(id))
    .map((id) => result.dimensions[id].codes[0]?.label)
    .filter((l): l is string => !!l && !/^total$|^insgesamt$/i.test(l))
  const singleGeo = seriesDim !== 'geo' ? shortName(geo0?.code, geo0?.label) : undefined
  const title = pick(ds.title, lang, ds.code)
  const subtitle = [...selectionLabels, singleGeo, unit].filter(Boolean).join(' · ')

  const widgets: WidgetSpec[] = []
  const summary: string[] = []
  const deltaOf = (data: (number | null)[], i: number) => {
    const prev = data.slice(0, i).findLastIndex((v) => v != null)
    if (prev < 0 || data[i] == null || data[prev] == null) return null
    const a = data[prev] as number
    const b = data[i] as number
    return {
      value: isPercent ? b - a : a !== 0 ? ((b - a) / Math.abs(a)) * 100 : 0,
      unit: isPercent ? 'pp' : '%',
      period: periodLabels[prev],
    }
  }
  const kpi = (label: string, data: (number | null)[], i: number, caption?: string): KpiSpec | null => {
    if (data[i] == null) return null
    const d = deltaOf(data, i)
    return {
      label,
      value: data[i] as number,
      unit,
      decimals: fmt.decimals,
      caption: caption ?? periodLabels[i],
      goodDirection: 'neutral',
      ...(d ? { delta: d.value, deltaUnit: d.unit, deltaLabel: `${s.vs} ${d.period}` } : {}),
    }
  }

  // ---------- compose by intent ----------
  // Each kind of question gets its own set of views:
  //   single  → KPIs, hero card (value, change chips, highlighted period, average), period change
  //   trend   → KPIs with sparklines, evolution, latest breakdown, change since start, map, heatmap
  //   compare → KPIs, Europe map + ranking, change vs previous period, share (donut) or breakdown
  //   mix     → KPIs, donut with total + sources breakdown, stacked evolution, shares over time
  const multi = series.length > 1
  const period = periodLabels[focusIndex]
  const byCountry = seriesDim === 'geo'
  // Quantities that can be summed (ktoe, GWh, m³, t) get "share of total" views; rates and prices don't.
  const additive = !isPercent && ['energy', 'volume', 'mass'].includes(unitInfo?.kind ?? '')
  const changeUnit = isPercent ? 'pp' : '%'
  const changeBetween = (data: (number | null)[], from: number, to: number): number | null => {
    const a = data[from]
    const b = data[to]
    if (from < 0 || a == null || b == null) return null
    return isPercent ? b - a : a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null
  }
  const firstIndex = (data: (number | null)[]) => data.findIndex((v) => v != null)
  const previousIndex = (data: (number | null)[], i: number) => data.slice(0, i).findLastIndex((v) => v != null)
  const mean = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null)
    return v.length ? v.reduce((acc, x) => acc + x, 0) / v.length : null
  }
  const direction = (v: number | null): 'up' | 'down' | 'flat' => (v == null || Math.abs(v) < 0.05 ? 'flat' : v > 0 ? 'up' : 'down')
  const changeText = (v: number | null) => (v == null ? '' : fmt.signed(v, changeUnit))
  const withPeriod = (text: string) => [text, period].filter(Boolean).join(' · ')
  const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10)
  const freq = result.dimensions.freq?.codes[0]?.code ?? 'A'
  const perYear = freq === 'M' ? 12 : freq === 'S' ? 2 : freq === 'Q' ? 4 : 1

  /** Breakdown items: value and change vs the previous period, sorted by value. */
  const breakdownItems = (list: typeof series, at: number) =>
    list
      .map((x) => ({ x, v: x.data[at] }))
      .filter((r): r is { x: (typeof series)[number]; v: number } => r.v != null)
      .sort((p, q) => q.v - p.v)
      .slice(0, 8)
      .map(({ x, v }) => {
        const c = changeBetween(x.data, previousIndex(x.data, at), at)
        return { name: x.name, value: fmt.value(v, unit), ...(c != null ? { change: { text: changeText(c), direction: direction(c) } } : {}) }
      })

  const mapOf = (list: typeof series, at: number): Extract<WidgetSpec, { type: 'map' }> | null => {
    const data = list
      .filter((x) => x.code.length === 2 && x.data[at] != null)
      .map((x) => ({ code: x.code, name: x.name, value: x.data[at] as number }))
    return data.length >= 3 ? { type: 'map', title: withPeriod(title), subtitle, data, size: 'half' } : null
  }

  const heatmapOf = (list: typeof series): WidgetSpec | null => {
    if (list.length < 3 || periods.length < 4) return null
    const rows = [...list].sort((p, q) => (q.data[latestIndex(q.data)] ?? 0) - (p.data[latestIndex(p.data)] ?? 0))
    const cols = periods.length > 15 ? periods.slice(-15).map((_, k) => periods.length - 15 + k) : periods.map((_, k) => k)
    return {
      type: 'heatmap',
      title: s.heatmapTitle,
      subtitle,
      xCategories: cols.map((k) => periodLabels[k]),
      yCategories: rows.map((r) => r.name),
      values: rows.map((r) => cols.map((k) => r.data[k])),
      size: 'full',
    }
  }

  if (plan.intent === 'compare' && multi) {
    const ranked = series
      .map((x) => ({ x, value: x.data[focusIndex] }))
      .filter((r): r is { x: (typeof series)[number]; value: number } => r.value != null)
      .sort((p, q) => q.value - p.value)
    const euValue = euRef?.data[focusIndex] ?? null
    const avg = mean(ranked.map((r) => r.value))

    const kpis: KpiSpec[] = []
    if (euRef) {
      const k = kpi(euRef.name, euRef.data, focusIndex)
      if (k) kpis.push({ ...k, trend: euRef.data })
    }
    if (ranked[0]) kpis.push({ label: s.highest, value: ranked[0].value, unit, decimals: fmt.decimals, caption: ranked[0].x.name, trend: ranked[0].x.data })
    if (ranked.length > 1) {
      const last = ranked[ranked.length - 1]
      kpis.push({ label: s.lowest, value: last.value, unit, decimals: fmt.decimals, caption: last.x.name, trend: last.x.data })
    }
    if (avg != null && ranked.length > 2) kpis.push({ label: s.selectionAverage, value: avg, unit, decimals: fmt.decimals, caption: period })
    widgets.push({ type: 'kpis', items: kpis })

    // 1. Europe map + ranking (same height, side by side).
    const map = byCountry ? mapOf(ranked.map((r) => r.x), focusIndex) : null
    if (map) widgets.push({ ...map, height: Math.max(420, ranked.length * 28 + 90) })
    widgets.push({
      type: 'bar',
      title: fill(s.rankingIn, { period }),
      subtitle,
      categories: ranked.map((r) => r.x.name),
      series: [{ name: period, data: ranked.map((r) => r.value) }],
      horizontal: true,
      size: 'half',
      ...(euValue != null ? { reference: { value: euValue, label: 'EU-27' } } : {}),
    })
    // 2. Change vs previous period + share of total (summable) or breakdown list.
    // Many countries: the change gets the full width (columns sorted by change) and the ranking
    // already lists every value; few countries: change and share/breakdown side by side.
    const many = ranked.length > 8
    const prev = previousIndex(ranked[0]?.x.data ?? [], focusIndex)
    if (prev >= 0) {
      const changes = ranked
        .map((r) => ({ name: r.x.name, value: round1(changeBetween(r.x.data, prev, focusIndex)) }))
        .sort((p, q) => (many ? (q.value ?? -Infinity) - (p.value ?? -Infinity) : 0))
      if (changes.some((c) => c.value != null)) {
        widgets.push({
          type: 'bar',
          title: fill(s.changeVs, { period: periodLabels[prev] }),
          subtitle: `${changeUnit} · ${period}`,
          categories: changes.map((c) => c.name),
          series: [{ name: fill(s.changeVs, { period: periodLabels[prev] }), data: changes.map((c) => c.value) }],
          horizontal: false,
          signed: true,
          unit: changeUnit,
          decimals: 1,
          size: many ? 'full' : 'half',
        })
      }
    }
    if (many && !additive) {
      // (ranking + map already show every value)
    } else if (additive && ranked.length > 1) {
      const total = ranked.reduce((n, r) => n + r.value, 0)
      widgets.push({
        type: 'pie',
        title: fill(s.shareOfTotal, { period }),
        subtitle,
        slices: ranked.map((r) => ({ name: r.x.name, y: r.value })),
        centerLabel: fmt.compact(total),
        size: 'half',
      })
    } else if (prev >= 0) {
      // Not summable: the two periods side by side per country (the ranking already lists the values).
      widgets.push({
        type: 'bar',
        title: `${periodLabels[prev]} – ${period}`,
        subtitle,
        categories: ranked.map((r) => r.x.name),
        series: [prev, focusIndex].map((i) => ({ name: periodLabels[i], data: ranked.map((r) => r.x.data[i] ?? null) })),
        horizontal: false,
        size: 'half',
      })
    } else {
      widgets.push({ type: 'breakdown', title: withPeriod(title), subtitle, items: breakdownItems(ranked.map((r) => r.x), focusIndex), size: 'half' })
    }
    // 3. Evolution (only when no single year was asked for): heatmap for many series, else lines.
    if (!plan.focusPeriod && periods.length > 2) {
      const heat = heatmapOf(series)
      if (heat) widgets.push(heat)
      else widgets.push({ type: 'line', title: s.evolution, subtitle, categories: periodLabels, series: series.map(({ name, data }) => ({ name, data })), size: 'full' })
    }
    if (ranked.length >= 2) {
      summary.push(
        fill(s.summaryCompare, {
          period,
          top: ranked[0].x.name,
          topValue: fmt.value(ranked[0].value, unit),
          bottom: ranked[ranked.length - 1].x.name,
          bottomValue: fmt.value(ranked[ranked.length - 1].value, unit),
        }),
      )
    }
  } else if (plan.intent === 'mix' && multi) {
    const slices = series
      .map((x) => ({ x, y: x.data[focusIndex] ?? 0 }))
      .filter((r) => r.y > 0)
      .sort((p, q) => q.y - p.y)
    const totalShown = slices.reduce((n, r) => n + r.y, 0)
    const totalSeries = periods.map((_, k) => {
      const vals = series.map((x) => x.data[k])
      return vals.every((v) => v == null) ? null : vals.reduce<number>((n, v) => n + (v ?? 0), 0)
    })
    widgets.push({
      type: 'kpis',
      items: [
        { label: `${s.total} · ${period}`, value: totalShown, unit, decimals: fmt.decimals, trend: totalSeries },
        ...slices.slice(0, 3).map((r) => ({
          label: r.x.name,
          value: r.y,
          unit,
          decimals: fmt.decimals,
          caption: `${fmt.number((r.y / totalShown) * 100, 1)}%`,
          trend: r.x.data,
        })),
      ],
    })
    // 1. Composition (donut with total) + sources breakdown.
    widgets.push({
      type: 'pie',
      title: withPeriod(title),
      subtitle,
      slices: slices.map((r) => ({ name: r.x.name, y: r.y })),
      centerLabel: fmt.compact(totalShown),
      size: 'half',
    })
    widgets.push({
      type: 'breakdown',
      title: fill(s.mixRanking, { period }),
      subtitle,
      headline: { label: `${s.total} · ${period}`, value: fmt.value(totalShown, unit) },
      items: breakdownItems(slices.map((r) => r.x), focusIndex),
      ...(periods.length > 2 ? { trend: { label: s.total, categories: periodLabels, data: totalSeries } } : {}),
      size: 'half',
    })
    // 2. Stacked evolution and shares over time (only for a view over time).
    if (!plan.focusPeriod && periods.length > 2) {
      const mixSeries = series.slice(0, MAX_SERIES).map(({ name, data }) => ({ name, data }))
      widgets.push({ type: 'area', title: s.evolution, subtitle, categories: periodLabels, series: mixSeries, stacked: true, size: 'full' })
      widgets.push({ type: 'area', title: s.sharesOverTime, subtitle: '%', categories: periodLabels, series: mixSeries, stacked: 'percent', size: 'full', unit: '%' })
    }
    if (slices[0]) {
      summary.push(fill(s.summaryMix, { period, top: slices[0].x.name, share: fmt.number((slices[0].y / totalShown) * 100, 1) }))
    }
  } else if (multi) {
    // Several series over time.
    const shown = [...series]
      .sort((p, q) => (q.data[latestIndex(q.data)] ?? 0) - (p.data[latestIndex(p.data)] ?? 0))
      .slice(0, MAX_SERIES)
    const kpis: KpiSpec[] = []
    for (const x of shown.slice(0, 4)) {
      const k = kpi(x.name, x.data, latestIndex(x.data))
      if (k) kpis.push({ ...k, trend: x.data })
    }
    widgets.push({ type: 'kpis', items: kpis })
    // 1. Evolution.
    widgets.push({ type: 'line', title: s.evolution, subtitle, categories: periodLabels, series: shown.map(({ name, data }) => ({ name, data })), size: 'full' })
    // 2. Latest values (breakdown) + change since the start of the period.
    const latest = Math.max(...series.map((x) => latestIndex(x.data)))
    widgets.push({
      type: 'breakdown',
      title: fill(s.rankingIn, { period: periodLabels[latest] }),
      subtitle,
      items: breakdownItems(series, latest),
      trend: { label: shown[0].name, categories: periodLabels, data: shown[0].data },
      size: 'half',
    })
    const start = Math.min(...series.map((x) => firstIndex(x.data)).filter((k) => k >= 0))
    const since = [...series]
      .map((x) => ({ name: x.name, value: round1(changeBetween(x.data, firstIndex(x.data), latestIndex(x.data))) }))
      .sort((p, q) => (q.value ?? 0) - (p.value ?? 0))
    if (since.some((c) => c.value != null)) {
      widgets.push({
        type: 'bar',
        title: fill(s.changeSince, { period: periodLabels[start] }),
        subtitle: changeUnit,
        categories: since.map((c) => c.name),
        series: [{ name: fill(s.changeSince, { period: periodLabels[start] }), data: since.map((c) => c.value) }],
        horizontal: since.length > 6,
        signed: true,
        unit: changeUnit,
        decimals: 1,
        size: 'half',
      })
    }
    // 3. Map of the latest period and 4. country × period heatmap (patterns across many series).
    const map = byCountry ? mapOf(series, latest) : null
    if (map) widgets.push({ ...map, size: 'full' })
    const heat = heatmapOf(series)
    if (heat) widgets.push(heat)
    summary.push(
      ...shown.slice(0, 3).map((x) => {
        const k = latestIndex(x.data)
        const d = deltaOf(x.data, k)
        return (
          fill(s.summaryLatest, { series: x.name, value: fmt.value(x.data[k] as number, unit), period: periodLabels[k] }) +
          (d ? ' ' + fill(s.summaryChange, { change: fmt.signed(d.value, d.unit), period: d.period }) : '')
        )
      }),
    )
  } else {
    // A single series: its value (for the year asked, or the latest) in context.
    const x = series[0]
    const values = x.data
    const i = plan.focusPeriod ? focusIndex : latestIndex(values)
    const first = firstIndex(values)
    const max = values.reduce<number>((m, v, k) => (v != null && (values[m] == null || v > (values[m] as number)) ? k : m), first)
    const min = values.reduce<number>((m, v, k) => (v != null && (values[m] == null || v < (values[m] as number)) ? k : m), first)
    const avg = mean(values)
    const kpis: KpiSpec[] = []
    const main = kpi(plan.focusPeriod ? period : s.latest, values, i)
    if (main) kpis.push({ ...main, trend: values })
    if (periods.length > 2) {
      kpis.push({ label: s.highest, value: values[max] as number, unit, decimals: fmt.decimals, caption: periodLabels[max] })
      kpis.push({ label: s.lowest, value: values[min] as number, unit, decimals: fmt.decimals, caption: periodLabels[min] })
      const since = changeBetween(values, first, i)
      if (since != null && first !== i) {
        kpis.push({
          label: fill(s.changeSince, { period: periodLabels[first] }),
          value: Math.round(since * 10) / 10,
          unit: changeUnit,
          decimals: 1,
          caption: `${periodLabels[first]}–${periodLabels[i]}`,
        })
      }
    }
    widgets.push({ type: 'kpis', items: kpis })

    // 1. Hero card: the value, its change, 1/5/10-year change chips, the period highlighted.
    const prevI = previousIndex(values, i)
    const prevChange = changeBetween(values, prevI, i)
    const chips = [1, 5, 10]
      .map((years) => {
        const j = i - years * perYear
        const c = j >= 0 ? changeBetween(values, j, i) : null
        return c == null ? null : { label: fill(s.yearsShort, { n: String(years) }), text: changeText(c), direction: direction(c) }
      })
      .filter((c): c is NonNullable<typeof c> => c != null)
    if (values[i] != null) {
      widgets.push({
        type: 'hero',
        title,
        subtitle,
        categories: periodLabels,
        data: values,
        highlightIndex: i,
        value: fmt.value(values[i] as number, unit),
        ...(prevChange != null ? { change: { text: changeText(prevChange), direction: direction(prevChange), label: `${s.vs} ${periodLabels[prevI]}` } } : {}),
        chips,
        ...(avg != null && periods.length > 2 ? { reference: { value: avg, label: `${s.average} ${fmt.value(avg, unit)}` } } : {}),
        size: 'full',
      })
    }
    // 2. Period-on-period change.
    if (periods.length > 2) {
      const yoy = periods.map((_, k) => (k === 0 ? null : changeBetween(values, k - 1, k)))
      if (yoy.some((v) => v != null)) {
        widgets.push({
          type: 'bar',
          title: s.yearOnYear,
          subtitle: changeUnit,
          categories: periodLabels.slice(1),
          series: [{ name: s.yearOnYear, data: yoy.slice(1).map(round1) }],
          signed: true,
          unit: changeUnit,
          decimals: 1,
          size: 'full',
        })
      }
      summary.push(
        fill(s.summaryRange, {
          max: fmt.value(values[max] as number, unit),
          maxPeriod: periodLabels[max],
          min: fmt.value(values[min] as number, unit),
          minPeriod: periodLabels[min],
        }),
      )
    }
    const d = deltaOf(values, i)
    summary.unshift(
      fill(s.summaryLatest, { series: x.name, value: fmt.value(values[i] as number, unit), period: periodLabels[i] }) +
        (d ? ' ' + fill(s.summaryChange, { change: fmt.signed(d.value, d.unit), period: d.period }) : ''),
    )
  }

  if (plan.chart) applyChartOverride(widgets, plan.chart)

  // Data table: every series; for a single-year comparison or mix only that year's column,
  // otherwise every period.
  const tableSeries = euRef ? [euRef, ...series] : series
  const oneYear = !!plan.focusPeriod && plan.intent !== 'snapshot'
  const cols = oneYear ? [focusIndex] : periods.map((_, i) => i)
  widgets.push({
    type: 'table',
    title: s.dataTable,
    columns: cols.map((i) => periodLabels[i]),
    rows: tableSeries.map((x) => ({ label: x.name, values: cols.map((i) => x.data[i]), flags: cols.map((i) => x.flags[i]) })),
  })

  const insights = computeInsights(
    { intent: plan.intent, multi, ranked: !!topNote, focusPeriod: plan.focusPeriod, series, euRef, periodLabels, focusIndex, perYear, isPercent, unit, fmt },
    s.insights,
  )

  return {
    title,
    subtitle,
    summary,
    insights,
    notes: [
      ...(topNote ? [topNote] : []),
      ...(result.cachedAt
        ? [fill(s.noteCached, { date: new Date(result.cachedAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) })]
        : []),
      ...(plan.notes ?? []).map((n) => s[`note${n[0].toUpperCase()}${n.slice(1)}` as keyof DashStrings] as string),
    ],
    widgets,
    unit,
    source: {
      code: ds.code,
      title,
      url: `https://ec.europa.eu/eurostat/databrowser/view/${ds.code}/default/table?lang=${lang}`,
    },
    suggestions: suggest(plan, dict, s),
    controls: controlsFor(plan, dict, s, lang),
    context: toContext(title, subtitle, unit, periodLabels, tableSeries),
    plan,
  }
}

// ---------- "show as …" overrides ----------

type ChartWidget = Extract<WidgetSpec, { type: 'line' | 'area' | 'bar' | 'pie' }>
const isChart = (w: WidgetSpec): w is ChartWidget => ['line', 'area', 'bar', 'pie'].includes(w.type)

/** Converts the main chart to the chart type the user asked for; 'table' removes the charts. */
function applyChartOverride(widgets: WidgetSpec[], kind: NonNullable<Plan['chart']>) {
  const index = widgets.findIndex(isChart)
  if (index < 0) return
  if (kind === 'table') {
    for (let i = widgets.length - 1; i >= 0; i--) if (isChart(widgets[i])) widgets.splice(i, 1)
    return
  }
  const w = widgets[index] as ChartWidget
  if (w.type === kind) return

  const categories = w.type === 'pie' ? w.slices.map((x) => x.name) : w.categories
  const series = w.type === 'pie' ? [{ name: w.title, data: w.slices.map((x): number | null => x.y) }] : w.series

  let next: WidgetSpec
  if (kind === 'pie') {
    // One value per slice: the latest value of each series, or the single series' categories.
    const slices =
      series.length > 1
        ? series.map((x) => ({ name: x.name, y: x.data.findLast((v) => v != null) ?? 0 }))
        : categories.map((c, i) => ({ name: c, y: series[0]?.data[i] ?? 0 }))
    next = { type: 'pie', title: w.title, subtitle: w.subtitle, slices: slices.filter((x) => x.y > 0) }
  } else if (kind === 'bar') {
    next = { type: 'bar', title: w.title, subtitle: w.subtitle, categories, series, horizontal: categories.length > 8 && series.length === 1 }
  } else {
    next = { type: kind, title: w.title, subtitle: w.subtitle, categories, series, ...(kind === 'area' && series.length > 1 ? { stacked: true } : {}) }
  }
  widgets[index] = next
}

// ---------- formatting ----------

function numberFormat(lang: string, plan: Plan, result: EurostatResult) {
  const values = result.observations.map((o) => Math.abs(o.value ?? 0))
  const max = Math.max(0, ...values)
  const decimals = plan.dataset.startsWith('nrg_pc_') ? 4 : result.dimensions.unit?.codes[0]?.code === 'PC' ? 1 : max >= 100 ? 0 : max >= 10 ? 1 : 2
  const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })
  return {
    decimals,
    number: (v: number, d = decimals) => nf(d).format(v),
    value: (v: number, unit?: string) => `${nf(decimals).format(v)}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}`,
    /** Short form for tight spaces (donut centre): 597 544 → "598k". */
    compact: (v: number) => new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(v),
    signed: (v: number, unit: string) =>
      `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' }).format(v)}${unit === '%' ? '%' : ` ${unit}`}`,
  }
}

function toContext(title: string, subtitle: string, unit: string | undefined, periods: string[], series: { name: string; data: (number | null)[] }[]) {
  const lines = series.slice(0, 8).map((x) => {
    const pts = periods
      .map((p, i) => (x.data[i] == null ? null : `${p}: ${x.data[i]}`))
      .filter(Boolean)
      .slice(-10)
    return `- ${x.name}: ${pts.join('; ')}`
  })
  return [`Eurostat: ${title}`, subtitle ? `Selection: ${subtitle}` : '', unit ? `Unit: ${unit}` : '', ...lines].filter(Boolean).join('\n')
}

// ---------- toolbar controls ----------

/**
 * Period, year and unit controls for the dashboard toolbar. Each option carries the plan it
 * switches to, so the toolbar and the chat change the dashboard the same way.
 */
function controlsFor(plan: Plan, dict: EnergyDictionary, s: DashStrings, lang: string): DashboardControls {
  const ds = dict.datasets[plan.dataset]
  const freq = ds.defaults.freq ?? 'A'
  const controls: DashboardControls = {}
  const overTime = plan.intent === 'snapshot' || plan.intent === 'compare' ? 'trend' : plan.intent

  // Period (a view over time).
  const spans =
    freq === 'M' ? [[1, 12], [2, 24], [5, 60]] : freq === 'S' ? [[2, 4], [5, 10], [10, 20]] : [[5, 5], [10, 10], [20, 20]]
  controls.periods = [
    ...spans.map(([years, n]) => ({
      label: fill(s.yearsShort, { n: String(years) }),
      plan: { ...plan, time: { kind: 'last' as const, n }, focusPeriod: undefined, intent: overTime, notes: [] },
      active: !plan.focusPeriod && plan.time.kind === 'last' && plan.time.n === n,
    })),
    {
      label: s.allYears,
      plan: { ...plan, time: { kind: 'all' as const }, focusPeriod: undefined, intent: overTime, notes: [] },
      active: !plan.focusPeriod && plan.time.kind === 'all',
    },
  ]

  // Single year (annual data): the latest years available.
  const end = Number(ds.dataEnd)
  const start = Number(ds.dataStart)
  if (freq === 'A' && end && start) {
    const several = Object.values(plan.filters).some((v) => Array.isArray(v) && v.length > 1)
    controls.years = Array.from({ length: Math.min(15, end - start + 1) }, (_, k) => end - k).map((y) => {
      const intent: Plan['intent'] = plan.intent === 'mix' ? 'mix' : several ? 'compare' : 'snapshot'
      return {
        label: String(y),
        plan: {
          ...plan,
          intent,
          focusPeriod: String(y),
          time: { kind: 'range' as const, since: String(intent === 'snapshot' ? y - 9 : y - 1), until: String(y) },
          chart: plan.chart === 'line' || plan.chart === 'area' ? undefined : plan.chart,
          notes: [],
        },
        active: plan.focusPeriod === String(y),
      }
    })
  }

  // Unit (only codes the dataset has).
  if (ds.multipleUnits) {
    controls.units = ds.units.map((code) => {
      const info = dict.units[code]
      return {
        label: ds.unitsAreAlternatives ? (info?.symbol ?? code) : pick(info?.label, lang, info?.symbol ?? code),
        plan: { ...plan, filters: { ...plan.filters, unit: code }, notes: [] },
        active: plan.filters.unit === code,
      }
    })
  }
  return controls
}

// ---------- follow-up suggestions ----------

function suggest(plan: Plan, dict: EnergyDictionary, s: DashStrings): Suggestion[] {
  const ds = dict.datasets[plan.dataset]
  const geoCodes = ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const geo = plan.filters.geo
  const out: Suggestion[] = []
  // A dashboard shows one varying dimension: when products already vary (a mix), don't also
  // offer to vary countries.
  const productsVary = Object.entries(plan.filters).some(([dim, v]) => dim !== 'geo' && Array.isArray(v) && v.length > 1)

  if (geoCodes.length && !plan.allCountries && !productsVary) {
    out.push({
      label: s.sugAllCountries,
      plan: {
        ...plan,
        filters: { ...plan.filters, geo: EU27.filter((c) => geoCodes.includes(c)) },
        allCountries: true,
        intent: 'compare',
        time: plan.focusPeriod ? plan.time : { kind: 'last', n: 2 },
        notes: [],
      },
    })
  }
  if (typeof geo === 'string' && geo !== 'EU27_2020' && geoCodes.includes('EU27_2020') && !productsVary) {
    out.push({ label: s.sugWithEu, plan: { ...plan, filters: { ...plan.filters, geo: ['EU27_2020', geo] }, intent: 'trend', focusPeriod: undefined, notes: [] } })
  }
  // Period and unit changes live in the dashboard toolbar (controlsFor), not in the chips.
  if (plan.monthlyDataset && dict.datasets[plan.monthlyDataset]) {
    out.push({
      label: s.sugMonthly,
      plan: { dataset: plan.monthlyDataset, filters: monthlyFilters(plan, dict), time: { kind: 'last', n: 24 }, intent: 'trend', notes: [] },
    })
  }
  if ((plan.dataset === 'nrg_bal_c' || plan.dataset === 'nrg_bal_peh') && plan.intent !== 'mix' && !Array.isArray(geo)) {
    const mix = plan.dataset === 'nrg_bal_peh' ? ELECTRICITY_MIX : ENERGY_MIX
    out.push({
      label: s.sugMix,
      plan: { ...plan, filters: { ...plan.filters, siec: mix }, intent: 'mix', time: plan.focusPeriod ? plan.time : { kind: 'last', n: 15 }, notes: [] },
    })
  }
  out.push({ label: s.sugExplain, explain: true })
  return out
}
