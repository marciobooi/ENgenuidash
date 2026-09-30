import { fetchEurostatData, type EnergyDictionary } from '../../data/eurostat'
import { NoDataError } from '../execute'
import type { DashboardSpec, Insight, KpiSpec, Plan, WidgetSpec } from '../types'
import { sanitizeSpec } from '../validate'
import labels from './labels.json'
import { FUEL_COLORS } from './model'
import { UNIT_TABLE } from './state'
import type { SankeyStrings } from './sankeyDashboard'
import { sankeyControls } from './sankeyDashboard'

/**
 * The households view of the energy flow diagram: which products households use, and what for (space
 * heating, water heating, cooking…). The data are Eurostat's own (nrg_d_hhq, energy consumption in
 * households by use and product); nothing is attributed or assumed. Households' share of all final
 * consumption comes from the balance (nrg_bal_c).
 */

const DATASET = 'nrg_d_hhq'
const TJ_PER_KTOE = 41.868
export const USES = ['FC_OTH_HH_E_SH', 'FC_OTH_HH_E_WH', 'FC_OTH_HH_E_CK', 'FC_OTH_HH_E_SC', 'FC_OTH_HH_E_LE', 'FC_OTH_HH_E_OE']
/** The products of the data, as the families of the main diagram (its colours), in its order. */
export const HOUSEHOLD_PRODUCTS: { family: string; siec: string }[] = [
  { family: 'SFF_P1000', siec: 'SFF_P1000_S2000' },
  { family: 'O4000', siec: 'O4000' },
  { family: 'G3000_C0350-370', siec: 'G3000' },
  { family: 'RA000', siec: 'RA000' },
  { family: 'E7000', siec: 'E7000' },
  { family: 'H8000', siec: 'H8000' },
]
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

export interface HouseholdData {
  years: string[]
  values: Record<string, (number | null)[]>
  total?: (number | null)[]
}

export interface HouseholdContext {
  data: HouseholdData
  geoName: string
  lang: string
  symbol: string
  factor: number
  source: { code: string; title: string; url: string }
  t: SankeyStrings
}

/** What the data say about one year: figures, pies, trends and insights. */
export function composeHouseholds(c: HouseholdContext, year: string): { kpis: KpiSpec[]; summary: string[]; insights: Insight[]; around: WidgetSpec[] } {
  const { data, geoName, lang, symbol, factor, source, t } = c
  const names = (labels as Record<string, Record<string, string>>)[lang] ?? labels.en
  const at = data.years.indexOf(year)
  const before = data.years[at - 1]
  const digits = factor < 1 ? 10 : 1
  const show = (v: number) => Math.round(v * factor * digits) / digits
  const cell = (family: string, use: string, y = year) => data.values[`${family}|${use}`]?.[data.years.indexOf(y)] ?? 0
  const sumUse = (use: string, y = year) => HOUSEHOLD_PRODUCTS.reduce((s, p) => s + cell(p.family, use, y), 0)
  const sumFamily = (family: string, y = year) => USES.reduce((s, u) => s + cell(family, u, y), 0)
  const totalAt = (y: string) => USES.reduce((s, u) => s + sumUse(u, y), 0)
  const total = totalAt(year)
  const fmt = (v: number) => `${new Intl.NumberFormat(lang, { maximumFractionDigits: factor < 1 ? 1 : 0 }).format(show(v))} ${symbol}`
  const pct1 = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 })
  const finalAt = (y: string) => data.total?.[data.years.indexOf(y)] ?? null
  const share = (y: string) => {
    const f = finalAt(y)
    return f && f > 0 ? (100 * totalAt(y)) / f : null
  }
  const shown = data.years.slice(-30)

  const kpi = (label: string, value: (y: string) => number, extra?: Partial<KpiSpec>): KpiSpec => ({
    label,
    value: show(value(year)),
    unit: symbol,
    decimals: 0,
    ...(before && value(before) > 0 ? { delta: show(value(year) - value(before)), deltaUnit: symbol, deltaLabel: before } : {}),
    trend: shown.map((y) => show(value(y))),
    goodDirection: 'neutral',
    ...extra,
  })
  const kpis: KpiSpec[] = [kpi(t.hhKpiTotal, totalAt), kpi(names.FC_OTH_HH_E_SH, (y) => sumUse('FC_OTH_HH_E_SH', y))]
  const s = share(year)
  if (s != null) {
    const sb = before ? share(before) : null
    kpis.push({ label: t.hhKpiShare, value: Math.round(s * 10) / 10, unit: '%', decimals: 1, ...(sb != null ? { delta: Math.round((s - sb) * 10) / 10, deltaUnit: '%', deltaLabel: before } : {}), trend: shown.map((y) => share(y)), goodDirection: 'neutral' })
  }

  const topUse = USES.map((u) => ({ u, v: sumUse(u) })).sort((a, b) => b.v - a.v)[0]
  const topFamily = HOUSEHOLD_PRODUCTS.map((p) => ({ f: p.family, v: sumFamily(p.family) })).sort((a, b) => b.v - a.v)[0]
  const summary = total > 0 && topUse && topFamily ? [fill(t.hhSummary, { geo: geoName, year, total: fmt(total), use: (names[topUse.u] ?? topUse.u).toLowerCase(), pct: pct1.format((100 * topUse.v) / total), product: (names[topFamily.f] ?? topFamily.f).toLowerCase(), fpct: pct1.format((100 * topFamily.v) / total) })] : []

  const pie = (title: string, list: { name: string; v: number }[]): WidgetSpec | null => {
    const slices = list.map((x) => ({ name: x.name, y: Math.max(0, show(x.v)) })).filter((x) => x.y > 0)
    return slices.length > 1 ? { type: 'pie', title, subtitle: `${geoName} · ${year} · ${symbol}`, slices, unit: symbol, size: 'half', source } : null
  }
  const around: WidgetSpec[] = []
  const add = (w: WidgetSpec | null) => w && around.push(w)
  add(pie(t.hhPieUses, USES.map((u) => ({ name: names[u] ?? u, v: sumUse(u) }))))
  add(pie(t.hhPieProducts, HOUSEHOLD_PRODUCTS.map((p) => ({ name: names[p.family] ?? p.family, v: sumFamily(p.family) }))))
  const area = (title: string, list: { name: string; get: (y: string) => number }[]): WidgetSpec | null => {
    const series = list.map((x) => ({ name: x.name, data: shown.map((y) => show(x.get(y))) })).filter((x) => x.data.some((v) => v > 0))
    return series.length > 1 ? ({ type: 'area', title, subtitle: `${geoName} · ${symbol}`, categories: shown, series, stacked: true, unit: symbol, size: 'half', highlight: year, source } as WidgetSpec) : null
  }
  add(area(t.hhAreaUses, USES.map((u) => ({ name: names[u] ?? u, get: (y: string) => sumUse(u, y) }))))
  add(area(t.hhAreaProducts, HOUSEHOLD_PRODUCTS.map((p) => ({ name: names[p.family] ?? p.family, get: (y: string) => sumFamily(p.family, y) }))))

  const insights: Insight[] = []
  if (topUse && total > 0) insights.push({ tone: 'up', parts: [fill(t.hhTopUse, { use: names[topUse.u] ?? topUse.u, pct: pct1.format((100 * topUse.v) / total), year })] })
  if (s != null) insights.push({ tone: 'up', parts: [fill(t.hhShare, { pct: pct1.format(s), year })] })
  const first = data.years.find((y) => y <= String(Number(year) - 10)) ?? data.years[0]
  if (first !== year && totalAt(first) > 0) {
    const d = (100 * (total - totalAt(first))) / totalAt(first)
    insights.push({ tone: d > 0 ? 'up' : 'down', parts: [fill(d > 0 ? t.hhRose : t.hhFell, { pct: pct1.format(Math.abs(d)), first, year })] })
  }
  const solid = sumFamily('SFF_P1000') + sumFamily('O4000') + sumFamily('G3000_C0350-370')
  if (total > 0) insights.push({ tone: 'down', parts: [fill(t.hhFossil, { pct: pct1.format((100 * solid) / total), year })] })
  return { kpis, summary, insights, around }
}

export async function buildHouseholdsDashboard(plan: Plan, dict: EnergyDictionary, lang: string, s: { sankey: SankeyStrings; sugExplain: string }, signal?: AbortSignal): Promise<DashboardSpec> {
  const t = s.sankey
  const ds = dict.datasets[DATASET]
  if (!ds) throw new NoDataError(DATASET)
  const geo = String(plan.filters.geo ?? 'EU27_2020')
  const unit = String(plan.filters.unit ?? 'KTOE') in UNIT_TABLE ? String(plan.filters.unit ?? 'KTOE') : 'KTOE'
  const factor = UNIT_TABLE[unit].factor
  const result = await fetchEurostatData(DATASET, { filters: { geo, unit: 'TJ', nrg_bal: USES, siec: HOUSEHOLD_PRODUCTS.map((p) => p.siec) }, lang, signal })
  const finalConsumption = await fetchEurostatData('nrg_bal_c', { filters: { geo, unit: 'KTOE', nrg_bal: 'FC_E', siec: 'TOTAL' }, lang, signal }).catch(() => null)
  const years = [...new Set(result.observations.filter((o) => o.value != null && o.value > 0).map((o) => o.keys.time))].sort()
  if (!years.length) throw new NoDataError(DATASET)
  const values: Record<string, (number | null)[]> = {}
  for (const o of result.observations) {
    if (o.value == null) continue
    const family = HOUSEHOLD_PRODUCTS.find((p) => p.siec === o.keys.siec)?.family
    const i = years.indexOf(o.keys.time)
    if (!family || i < 0) continue
    ;(values[`${family}|${o.keys.nrg_bal}`] ??= years.map(() => null))[i] = o.value / TJ_PER_KTOE
  }
  const total = finalConsumption ? years.map((y) => finalConsumption.observations.find((o) => o.keys.time === y)?.value ?? null) : undefined
  const year = plan.focusPeriod && years.includes(plan.focusPeriod) ? plan.focusPeriod : years.at(-1)!
  const yearNote = plan.focusPeriod && year !== plan.focusPeriod ? [fill(t.yearFallback, { asked: plan.focusPeriod, year })] : []
  const geoName = (result.dimensions.geo?.codes.find((c) => c.code === geo)?.label ?? geo).replace(/\s*\(.*?\)\s*$/, '')
  const symbol = UNIT_TABLE[unit].symbol
  const source = { code: DATASET, title: result.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${DATASET}/default/table?lang=${lang}` }
  const outLang = ['de', 'fr'].includes(lang) ? lang : 'en'
  const data: HouseholdData = { years, values, total }
  const { kpis, summary, insights, around } = composeHouseholds({ data, geoName, lang: outLang, symbol, factor, source, t }, year)
  const title = fill(t.hhTitle, { geo: geoName, year })
  const { spec } = sanitizeSpec({
    title,
    subtitle: '',
    summary,
    insights,
    notes: yearNote,
    widgets: [
      { type: 'kpis', items: kpis },
      {
        type: 'sankey',
        title: fill(t.hhDiagramTitle, { geo: geoName }),
        subtitle: t.hhSubtitle,
        geo,
        geoName,
        unit: symbol,
        factor,
        lang: outLang,
        years,
        year,
        fuel: 'TOTAL',
        byFuel: true,
        table: {},
        scope: { kind: 'households', left: HOUSEHOLD_PRODUCTS.map((p) => p.family), right: USES, values, total },
        size: 'full',
      },
      ...around,
    ],
    layout: ['summary', 'notes', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'sankey', kpiStyle: 'cards', controls: ['geo', 'year', 'unit'], primaryControls: 3, accent: 'teal' },
    unit: symbol,
    source,
    suggestions: [
      { label: t.scopeAll, plan: { ...plan, sankey: undefined, focusPeriod: year } },
      { label: s.sugExplain, explain: true },
    ],
    controls: sankeyControls({ ...plan, focusPeriod: year }, years, year, 'TOTAL', true, t, (labels as Record<string, Record<string, string>>)[lang] ?? labels.en, true),
    context: [title, ...summary].join('\n'),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: [geo] },
  })
  void FUEL_COLORS
  return spec
}

/** The same dashboard at another year, worked out in the browser (see sankeyAtYear). */
export function householdsAtYear(spec: DashboardSpec, year: string, t: SankeyStrings): DashboardSpec {
  const w = spec.widgets.find((x) => x.type === 'sankey')
  if (!w || w.type !== 'sankey' || !w.scope || w.year === year || !w.years.includes(year)) return spec
  const { kpis, summary, insights, around } = composeHouseholds({ data: { years: w.years, values: w.scope.values, total: w.scope.total }, geoName: w.geoName, lang: w.lang, symbol: w.unit, factor: w.factor ?? 1, source: spec.source, t }, year)
  const time = { kind: 'range' as const, since: year, until: year }
  const withYear = (p: Plan): Plan => ({ ...p, time, focusPeriod: year })
  const plan = withYear(spec.plan)
  const title = fill(t.hhTitle, { geo: w.geoName, year })
  return {
    ...spec,
    title,
    summary,
    insights,
    notes: [],
    widgets: [{ type: 'kpis', items: kpis }, { ...w, year }, ...around],
    controls: sankeyControls(plan, w.years, year, 'TOTAL', true, t, (labels as Record<string, Record<string, string>>)[w.lang] ?? labels.en, true),
    suggestions: spec.suggestions.map((sg) => (sg.plan ? { ...sg, plan: withYear(sg.plan) } : sg)),
    context: [title, ...summary].join('\n'),
    plan,
  }
}
