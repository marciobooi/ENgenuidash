import { codeLabel, fetchEurostatData, loadEnergyCodelists, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { EU27 } from './concepts'
import { NoDataError } from './execute'
import type { DashboardControls, DashboardSpec, Insight, KpiSpec, Plan, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * Monthly energy data, as Eurostat's monthly energy visualisation (enmonthly,
 * https://ec.europa.eu/eurostat/cache/visualisations/energy-monthly/enmonthly.html): the monthly
 * datasets of solid fossil fuels, oil, gas, electricity supply and trade, net electricity generation
 * by source, and oil stocks; a country's series with the range each month had in earlier years, the
 * composition by product, imports and exports, and - for generation - renewables against everything
 * else, with the months in which they took the lead.
 */

export type MonthlyStrings = Strings['monthly']

interface MonthlyInfo {
  topic: keyof MonthlyStrings['topics']
  /** The dimension of the flows (the balance line, or the stock flow). */
  flowDim: 'nrg_bal' | 'stk_flow' | null
  flows: string[]
  products: string[]
  units: string[]
  defaults: { flow?: string; siec: string; unit: string }
  /** Imports and exports exist: the trade balance is shown. */
  trade?: boolean
}

// The datasets and what the tool offers of each (enmonthly's js/codes.js, codesDataset).
export const MONTHLY_DATASETS: Record<string, MonthlyInfo> = {
  nrg_cb_sffm: { topic: 'solid', flowDim: 'nrg_bal', flows: ['IPRD', 'IMP', 'EXP', 'Net_imp', 'GID_OBS', 'GID_CAL'], products: ['C0100', 'C0200', 'C0311', 'P1100', 'S2000'], units: ['THS_T'], defaults: { flow: 'IPRD', siec: 'C0100', unit: 'THS_T' }, trade: true },
  nrg_cb_oilm: { topic: 'oil', flowDim: 'nrg_bal', flows: ['TO_RPI_RO', 'IPRD', 'IMP', 'EXP', 'GID_OBS', 'GID_CAL'], products: ['O4640', 'O4652', 'O4661', 'O4671', 'O4630', 'O4680'], units: ['THS_T'], defaults: { flow: 'GID_OBS', siec: 'O4640', unit: 'THS_T' }, trade: true },
  nrg_cb_gasm: { topic: 'gas', flowDim: 'nrg_bal', flows: ['IPRD', 'IMP', 'EXP', 'Net_imp', 'IC_OBS', 'IC_CAL_MG', 'STK_CHG_MG'], products: ['G3000'], units: ['TJ_GCV', 'MIO_M3'], defaults: { flow: 'IC_OBS', siec: 'G3000', unit: 'TJ_GCV' }, trade: true },
  nrg_cb_em: { topic: 'electricity', flowDim: 'nrg_bal', flows: ['IMP', 'EXP', 'Net_imp', 'AIM', 'DL'], products: ['E7000'], units: ['GWH'], defaults: { flow: 'AIM', siec: 'E7000', unit: 'GWH' }, trade: true },
  nrg_cb_pem: { topic: 'generation', flowDim: null, flows: [], products: ['TOTAL'], units: ['GWH'], defaults: { siec: 'TOTAL', unit: 'GWH' } },
  nrg_stk_oilm: { topic: 'stocks', flowDim: 'stk_flow', flows: ['STKCL_NAT', 'STKCL_EUE'], products: ['O4000', 'O4100_TOT_4200-4500', 'O4600'], units: ['THS_T'], defaults: { flow: 'STKCL_NAT', siec: 'O4000', unit: 'THS_T' } },
}
export const isMonthlyDataset = (dataset: string) => dataset in MONTHLY_DATASETS

const UNIT_SYMBOL: Record<string, string> = { THS_T: 'thousand t', GWH: 'GWh', MIO_M3: 'million m³', TJ_GCV: 'TJ (GCV)', PC: '%' }
// Renewables and non-renewables of net generation, as enmonthly groups them (js/codes.js: rw, Nrw).
const RW = ['RA100', 'RA200', 'RA300', 'RA400', 'RA500_5160']
const NRW = ['C0000', 'G3000', 'O4000XBIO', 'N9000']
const SOURCES: Record<string, string[]> = { hydro: ['RA100'], wind: ['RA300'], solar: ['RA400'], otherRen: ['RA200', 'RA500_5160'], gas: ['G3000'], coal: ['C0000'], oil: ['O4000XBIO'], nuclear: ['N9000'] }
const RENEWABLE_SOURCES = ['hydro', 'wind', 'solar', 'otherRen'] as const
const NON_RENEWABLE_SOURCES = ['gas', 'coal', 'oil', 'nuclear'] as const
const MAX_LINES = 8
const MONTH = /^(\d{4})-(\d{2})$/

type Series = Map<string, number>

const list = (v: string | string[] | undefined) => ([] as string[]).concat(v ?? [])
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')
const year = (key: string) => Number(key.slice(0, 4))
const monthNo = (key: string) => key.slice(5, 7)
const addMonths = (key: string, n: number) => {
  const total = year(key) * 12 + (Number(monthNo(key)) - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d
const sum = (values: (number | undefined)[]) => values.reduce<number>((n, v) => n + (v ?? 0), 0)

function seriesOf(result: EurostatResult, match: (keys: Record<string, string>) => boolean): Series {
  const out: Series = new Map()
  for (const o of result.observations) if (o.value != null && MONTH.test(o.keys.time) && match(o.keys)) out.set(o.keys.time, o.value)
  return out
}
/** The last `n` months up to (and including) `end`, oldest first. */
const windowUpTo = (end: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1))

const monthLabelIn = (lang: string) => {
  const long = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' })
  const name = new Intl.DateTimeFormat(lang, { month: 'long' })
  const short = new Intl.DateTimeFormat(lang, { month: 'short' })
  const at = (key: string) => new Date(year(key), Number(monthNo(key)) - 1, 1)
  return {
    label: (key: string) => long.format(at(key)),
    name: (key: string) => name.format(at(key)),
    shorts: Array.from({ length: 12 }, (_, i) => short.format(new Date(2000, i, 1))),
  }
}

interface Ctx {
  plan: Plan
  dict: EnergyDictionary
  lang: string
  t: MonthlyStrings
  /** The local code labels (missing where they cannot be loaded: the codes are shown then). */
  codelists: EnergyCodelists | null
  sugExplain: string
  signal?: AbortSignal
}

export async function buildMonthlyDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { monthly: MonthlyStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const codelists = await loadEnergyCodelists().catch(() => null)
  const ctx: Ctx = { plan, dict, lang, t: s.monthly, codelists, sugExplain: s.sugExplain, signal }
  return plan.dataset === 'nrg_cb_pem' ? buildGeneration(ctx) : buildSeries(ctx)
}

// ---------- shared: the toolbar, the suggestions and the pieces every monthly dashboard has ----------

/** A code's label in the reader's language (short: without the note in brackets), or the code itself. */
function dimLabel(ctx: Ctx, dataset: string, dim: string, code: string): string {
  const codelist = ctx.dict.datasets[dataset]?.dimensions.find((d) => d.id === dim)?.codelist ?? null
  return ctx.codelists ? codeLabel(ctx.codelists, codelist, code, ctx.lang).replace(/\s*\(.*?\)\s*$/, '') : code
}

function monthlyControls(ctx: Ctx, focusMonths: string[], focus: string): DashboardControls {
  const { plan, dict, t } = ctx
  const info = MONTHLY_DATASETS[plan.dataset]
  const geoCodes = (dataset: string) => dict.datasets[dataset]?.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const keep = (dataset: string) => {
    const kept = list(plan.filters.geo).filter((g) => geoCodes(dataset).includes(g))
    return kept.length > 1 ? kept : (kept[0] ?? 'EU27_2020')
  }
  const at = (next: Partial<{ dataset: string; flow: string; product: string; unit: string; month: string | undefined }>): Plan => {
    const dataset = next.dataset ?? plan.dataset
    const target = MONTHLY_DATASETS[dataset]
    const changedTopic = dataset !== plan.dataset
    const flowDim = target.flowDim
    return {
      ...plan,
      dataset,
      filters: {
        geo: keep(dataset),
        siec: next.product ?? (changedTopic ? target.defaults.siec : String(plan.filters.siec ?? target.defaults.siec)),
        unit: next.unit ?? (changedTopic ? target.defaults.unit : String(plan.filters.unit ?? target.defaults.unit)),
        ...(flowDim ? { [flowDim]: next.flow ?? (changedTopic ? target.defaults.flow : String(plan.filters[flowDim] ?? target.defaults.flow)) } : {}),
      },
      focusPeriod: 'month' in next ? next.month : changedTopic ? undefined : plan.focusPeriod,
      time: { kind: 'all' },
      notes: [],
    } as Plan
  }
  const labelOf = (dataset: string, dim: string, code: string) => dimLabel(ctx, dataset, dim, code)
  const present = (dataset: string, dim: string, codes: string[]) => codes.filter((c) => dict.datasets[dataset]?.dimensions.find((d) => d.id === dim)?.codes.includes(c))
  const flowDim = info.flowDim
  const choices: NonNullable<DashboardControls['choices']> = [
    { key: 'topic', label: t.topic, options: Object.entries(MONTHLY_DATASETS).filter(([ds]) => dict.datasets[ds]).map(([ds, i]) => ({ label: t.topics[i.topic], plan: at({ dataset: ds }), active: ds === plan.dataset })) },
  ]
  if (flowDim) {
    const flows = present(plan.dataset, flowDim, info.flows)
    const current = String(plan.filters[flowDim] ?? info.defaults.flow)
    if (flows.length > 1) choices.push({ key: 'flow', label: t.flow, options: flows.map((code) => ({ label: labelOf(plan.dataset, flowDim, code), plan: at({ flow: code }), active: code === current })) })
  }
  const current = String(plan.filters.siec ?? info.defaults.siec)
  // (the product the question named stays in the list, even when it is not one of the usual ones)
  const products = [...new Set([current, ...present(plan.dataset, 'siec', info.products)])]
  if (products.length > 1) {
    choices.push({ key: 'product', label: t.product, options: products.map((code) => ({ label: labelOf(plan.dataset, 'siec', code), plan: at({ product: code }), active: code === current })) })
  }
  if (focusMonths.length) {
    const shown = plan.focusPeriod && focusMonths.includes(plan.focusPeriod) ? plan.focusPeriod : focusMonths[focusMonths.length - 1]
    const lab = monthLabelIn(ctx.lang).label
    choices.push({ key: 'month', label: t.month, options: [...focusMonths].reverse().map((m) => ({ label: lab(m), plan: at({ month: m }), active: m === shown })) })
  }
  const units = present(plan.dataset, 'unit', info.units)
  return {
    choices,
    ...(units.length > 1 ? { units: units.map((u) => ({ label: UNIT_SYMBOL[u] ?? u, plan: at({ unit: u }), active: String(plan.filters.unit ?? info.defaults.unit) === u })) } : {}),
    ...(focus ? {} : {}),
  }
}

function monthlySuggestions(ctx: Ctx): Suggestion[] {
  const { plan, dict, t } = ctx
  const geoCodes = dict.datasets[plan.dataset]?.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const out: Suggestion[] = []
  if (list(plan.filters.geo).length <= MAX_LINES) out.push({ label: t.sugCountries, plan: { ...plan, filters: { ...plan.filters, geo: EU27.filter((c) => geoCodes.includes(c)) }, allCountries: true, notes: [] } })
  out.push({ label: ctx.sugExplain, explain: true })
  return out
}

/** Countries (not the EU or euro area aggregates) with a value at a month, from a result. */
function countryValues(result: EurostatResult, key: string, match: (keys: Record<string, string>) => boolean) {
  const out = new Map<string, number>()
  for (const o of result.observations) if (o.value != null && o.keys.time === key && /^[A-Z]{2}$/.test(o.keys.geo) && match(o.keys)) out.set(o.keys.geo, (out.get(o.keys.geo) ?? 0) + o.value)
  return out
}

const geoName = (result: EurostatResult, code: string) => (code === 'EU27_2020' ? 'EU-27' : (result.dimensions.geo?.codes.find((c) => c.code === code)?.label ?? code).replace(/\s*\(.*?\)\s*$/, ''))

// ---------- a monthly series: fuels, oil, gas, electricity supply and trade, stocks ----------

async function buildSeries(ctx: Ctx): Promise<DashboardSpec> {
  const { plan, dict, lang, t, signal } = ctx
  const info = MONTHLY_DATASETS[plan.dataset]
  const flowDim = info.flowDim as 'nrg_bal' | 'stk_flow'
  const geos = list(plan.filters.geo).length ? list(plan.filters.geo) : ['EU27_2020']
  const many = geos.length > MAX_LINES
  const lines = many ? ['EU27_2020'] : geos
  const focus = lines[0]
  const flow = String(plan.filters[flowDim] ?? info.defaults.flow)
  const product = String(plan.filters.siec ?? info.defaults.siec)
  const unit = String(plan.filters.unit ?? info.defaults.unit)
  const base = { [flowDim]: flow, siec: product, unit }
  const symbol = UNIT_SYMBOL[unit] ?? unit
  const { label: monthLabel, name: monthName, shorts } = monthLabelIn(lang)

  const main = await fetchEurostatData(plan.dataset, { filters: { ...base, geo: lines }, lang, signal })
  const byGeo = new Map(lines.map((g) => [g, seriesOf(main, (k) => k.geo === g)]))
  const v = byGeo.get(focus) ?? new Map<string, number>()
  const keys = [...v.keys()].sort()
  if (!keys.length) throw new NoDataError(plan.dataset)
  const L = plan.focusPeriod && v.has(plan.focusPeriod) ? plan.focusPeriod : keys[keys.length - 1]
  const yL = year(L)
  const mm = monthNo(L)

  // The rest, at once: composition by product, trade, and every country for the month.
  const products = info.products.filter((c) => dict.datasets[plan.dataset]?.dimensions.find((d) => d.id === 'siec')?.codes.includes(c))
  const tradeFlows = info.trade ? ['IMP', 'EXP', 'IPRD'].filter((c) => dict.datasets[plan.dataset]?.dimensions.find((d) => d.id === flowDim)?.codes.includes(c)) : []
  const [compoR, tradeR, everyoneR] = await Promise.allSettled([
    products.length > 1 ? fetchEurostatData(plan.dataset, { filters: { [flowDim]: flow, unit, geo: focus, siec: products }, lang, signal }) : Promise.reject(new Error('one product')),
    tradeFlows.length ? fetchEurostatData(plan.dataset, { filters: { [flowDim]: tradeFlows, siec: product, unit, geo: focus }, lang, signal }) : Promise.reject(new Error('no trade')),
    fetchEurostatData(plan.dataset, { filters: base, sinceTimePeriod: addMonths(L, -12), untilTimePeriod: L, lang, signal }),
  ])

  // ---- the numbers
  const cur = v.get(L) as number
  const before = v.get(`${yL - 1}-${mm}`)
  const yoy = before ? (cur / before - 1) * 100 : null
  const earlier: { y: number; value: number }[] = []
  for (let y = yL - 10; y < yL; y++) {
    const x = v.get(`${y}-${mm}`)
    if (x != null) earlier.push({ y, value: x })
  }
  const avg = mean(earlier.map((e) => e.value))
  const vsAvg = avg ? (cur / avg - 1) * 100 : null
  const sameMonth = [...v.entries()].filter(([k]) => monthNo(k) === mm).map(([k, x]) => ({ y: year(k), value: x }))
  const rank = [...sameMonth].sort((a, b) => b.value - a.value).findIndex((e) => e.y === yL) + 1
  const stockLike = plan.dataset === 'nrg_stk_oilm'
  const windowSum = (end: string) => {
    const w = windowUpTo(end, 12).map((k) => v.get(k))
    return w.every((x) => x != null) ? (stockLike ? (mean(w as number[]) as number) : sum(w)) : null
  }
  const roll = windowSum(L)
  const rollBefore = windowSum(addMonths(L, -12))
  const rollChange = roll != null && rollBefore ? (roll / rollBefore - 1) * 100 : null
  const decimals = Math.abs(cur) >= 1000 ? 0 : Math.abs(cur) >= 10 ? 1 : 2
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: decimals })
  const pct = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const fmtPct = (x: number) => `${pct.format(Math.abs(x))}${lang === 'en' ? '%' : ' %'}`
  const fmt = (x: number) => `${nf.format(x)} ${symbol}`
  const geoLabel = geoName(main, focus)
  const flowLabel = main.dimensions[flowDim]?.codes.find((c) => c.code === flow)?.label.replace(/\s*\(.*?\)\s*$/, '') ?? dimLabel(ctx, plan.dataset, flowDim, flow)
  const productLabel = main.dimensions.siec?.codes.find((c) => c.code === product)?.label.replace(/\s*\(.*?\)\s*$/, '') ?? dimLabel(ctx, plan.dataset, 'siec', product)

  const kpis: KpiSpec[] = [
    { label: fill(t.latest, { month: monthLabel(L) }), value: cur, unit: symbol, decimals, ...(yoy != null ? { delta: round(yoy), deltaUnit: '%', deltaLabel: fill(t.vsMonth, { month: monthLabel(`${yL - 1}-${mm}`) }) } : {}), goodDirection: 'neutral', trend: windowUpTo(L, 13).map((k) => v.get(k) ?? null) },
    ...(vsAvg != null ? [{ label: fill(t.vsAverage, { monthName: monthName(L) }), value: round(vsAvg), unit: '%', decimals: 1, caption: fill(t.averageOf, { from: String(earlier[0].y), to: String(earlier[earlier.length - 1].y) }), goodDirection: 'neutral' as const }] : []),
    ...(roll != null ? [{ label: t.rolling, value: roll, unit: symbol, decimals: roll >= 1000 ? 0 : decimals, ...(rollChange != null ? { delta: round(rollChange), deltaUnit: '%', deltaLabel: t.vsPrevious12 } : {}), goodDirection: 'neutral' as const }] : []),
    ...(sameMonth.length >= 3 ? [{ label: fill(t.rank, { monthName: monthName(L) }), value: rank, decimals: 0, caption: fill(t.rankOf, { n: String(sameMonth.length) }), goodDirection: 'neutral' as const }] : []),
  ]
  const widgets: WidgetSpec[] = [{ type: 'kpis', items: kpis }]
  const source = { code: plan.dataset, url: `https://ec.europa.eu/eurostat/databrowser/view/${plan.dataset}/default/table?lang=${lang}` }
  const subtitle = `${flowLabel} · ${productLabel} · ${symbol}`

  // ---- this year against the earlier ones, month by month: the range each month had, as enmonthly draws it
  if (earlier.length >= 2) {
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    const at = (y: number) => months.map((m) => v.get(`${y}-${m}`) ?? null)
    const perMonth = months.map((m) => earlier.map((e) => v.get(`${e.y}-${m}`)).filter((x): x is number => x != null))
    const span = { from: String(earlier[0].y), to: String(earlier[earlier.length - 1].y) }
    widgets.push({
      type: 'seasonal',
      title: t.seasonal,
      subtitle: `${subtitle}. ${fill(t.seasonalNote, span)}`,
      months: shorts,
      latest: { name: String(yL), data: at(yL) },
      previous: { name: String(yL - 1), data: at(yL - 1) },
      average: { name: fill(t.average, span), data: perMonth.map((x) => (x.length ? round(mean(x) as number, 2) : null)) },
      range: { name: fill(t.band, span), min: perMonth.map((x) => (x.length ? Math.min(...x) : null)), max: perMonth.map((x) => (x.length ? Math.max(...x) : null)) },
      unit: symbol,
      size: 'full',
      source,
      role: 'evolution',
    })
  }

  // ---- month by month (each country asked for), and the change on a year earlier
  const shownKeys = windowUpTo(keys[keys.length - 1], Math.min(60, keys.length))
  widgets.push({
    type: 'line',
    title: t.evolution,
    subtitle,
    categories: shownKeys,
    series: lines.map((g) => ({ name: geoName(main, g), data: shownKeys.map((k) => byGeo.get(g)?.get(k) ?? null) })).filter((x) => x.data.some((y) => y != null)),
    highlight: L,
    unit: symbol,
    size: 'full',
    role: 'evolution',
  })
  const changes = windowUpTo(keys[keys.length - 1], Math.min(36, keys.length))
    .map((k) => ({ k, x: v.get(k), p: v.get(addMonths(k, -12)) }))
    .filter((c): c is { k: string; x: number; p: number } => c.x != null && !!c.p)
  if (changes.length >= 6) {
    widgets.push({
      type: 'bar',
      title: t.yoy,
      subtitle: `${subtitle} · %`,
      categories: changes.map((c) => c.k),
      series: [{ name: t.yoy, data: changes.map((c) => round((c.x / c.p - 1) * 100)) }],
      horizontal: false,
      signed: true,
      unit: '%',
      decimals: 1,
      size: 'full',
      source,
      role: 'change',
    })
  }

  // ---- what it is made of (products) - the month, and the years
  if (compoR.status === 'fulfilled') {
    const compo = compoR.value
    const byProduct = products.map((p) => ({ code: p, name: (compo.dimensions.siec?.codes.find((c) => c.code === p)?.label ?? p).replace(/\s*\(.*?\)\s*$/, ''), data: seriesOf(compo, (k) => k.siec === p) }))
    const slices = byProduct.map((p) => ({ name: p.name, y: p.data.get(L) ?? 0 })).filter((x) => x.y > 0)
    if (slices.length >= 2) {
      widgets.push({ type: 'pie', title: fill(t.composition, { month: monthLabel(L) }), subtitle, slices, unit: symbol, centerLabel: nf.format(slices.reduce((n, x) => n + x.y, 0)), size: 'half', source, role: 'composition' })
      // Full years only: a year with a month missing is no total.
      const years = [...new Set([...v.keys()].map(year))].filter((y) => Array.from({ length: 12 }, (_, i) => v.has(`${y}-${String(i + 1).padStart(2, '0')}`)).every(Boolean)).slice(-9)
      if (years.length >= 3) {
        const perYear = byProduct.map((p) => ({ name: p.name, data: years.map((y) => round(sum(Array.from({ length: 12 }, (_, i) => p.data.get(`${y}-${String(i + 1).padStart(2, '0')}`))), 1)) }))
        widgets.push({ type: 'bar', title: `${t.byYear}`, subtitle, categories: years.map(String), series: perYear, stacked: true, unit: symbol, decimals: 0, size: 'half', source, role: 'composition' })
        widgets.push({ type: 'bar', title: t.sharesByYear, subtitle: '%', categories: years.map(String), series: perYear, stacked: 'percent', size: 'half', source, role: 'composition' })
      }
    }
  }

  // ---- imports, exports and the balance; gas and solid fuels: how much of the supply comes from abroad
  const insights: Insight[] = []
  if (tradeR.status === 'fulfilled') {
    const tr = tradeR.value
    const flowSeries = (code: string) => seriesOf(tr, (k) => k[flowDim] === code)
    const imp = flowSeries('IMP')
    const exp = flowSeries('EXP')
    const tKeys = windowUpTo(keys[keys.length - 1], Math.min(48, keys.length))
    const net = (k: string) => (imp.has(k) && exp.has(k) ? (imp.get(k) as number) - (exp.get(k) as number) : null)
    if (imp.size && exp.size) {
      widgets.push({
        type: 'line',
        title: t.tradeTitle,
        subtitle: `${productLabel} · ${symbol}`,
        categories: tKeys,
        series: [
          { name: t.imports, data: tKeys.map((k) => imp.get(k) ?? null) },
          { name: t.exports, data: tKeys.map((k) => exp.get(k) ?? null) },
          { name: t.netImports, data: tKeys.map((k) => (net(k) == null ? null : round(net(k) as number, 1))) },
        ],
        highlight: L,
        unit: symbol,
        size: 'full',
        role: 'related',
      })
      const last12 = windowUpTo(L, 12).map(net).filter((x): x is number => x != null)
      if (last12.length >= 6) insights.push({ tone: 'neutral', parts: [fill(t.netPositive, { n: String(last12.filter((x) => x > 0).length) })] })
    }
    // How much of the supply comes from abroad: net imports (imports minus exports) over production plus
    // net imports, as enmonthly's Net_imp / (IPRD + Net_imp).
    const iprd = flowSeries('IPRD')
    if (iprd.size && imp.size && exp.size) {
      const dKeys = windowUpTo(keys[keys.length - 1], Math.min(60, keys.length))
      const dep = (k: string) => {
        const n = net(k)
        const p = iprd.get(k)
        return n != null && p != null && n > 0 && p + n > 0 ? round((n / (p + n)) * 100) : null
      }
      if (dKeys.some((k) => dep(k) != null)) {
        widgets.push({ type: 'line', title: t.dependency, subtitle: t.dependencyNote, categories: dKeys, series: [{ name: t.dependency, data: dKeys.map(dep) }], highlight: L, unit: '%', size: 'half', role: 'related' })
      }
    }
  }

  // ---- countries: the month everywhere, and the change on a year earlier
  if (everyoneR.status === 'fulfilled') {
    const everyone = everyoneR.value
    const now = countryValues(everyone, L, () => true)
    const then = countryValues(everyone, addMonths(L, -12), () => true)
    const rows = [...now.entries()].map(([code, value]) => ({ code, name: geoName(everyone, code), value })).sort((a, b) => b.value - a.value)
    if (rows.length >= 6) {
      widgets.push({ type: 'bar', title: fill(t.countries, { month: monthLabel(L) }), subtitle, categories: rows.map((r) => r.name), series: [{ name: symbol, data: rows.map((r) => round(r.value, 1)) }], horizontal: true, unit: symbol, decimals, size: 'half', source, role: 'ranking' })
      if (rows.length >= 8) widgets.push({ type: 'map', title: fill(t.countries, { month: monthLabel(L) }), subtitle, data: rows.map((r) => ({ code: r.code, name: r.name, value: r.value })), size: 'half', role: 'map' })
      const moves = rows.map((r) => ({ name: r.name, pct: then.get(r.code) ? round((r.value / (then.get(r.code) as number) - 1) * 100) : null })).filter((m): m is { name: string; pct: number } => m.pct != null).sort((a, b) => b.pct - a.pct)
      if (moves.length >= 6) widgets.push({ type: 'bar', title: fill(t.countriesYoy, { month: monthLabel(addMonths(L, -12)) }), subtitle: '%', categories: moves.map((m) => m.name), series: [{ name: '%', data: moves.map((m) => m.pct) }], horizontal: false, signed: true, unit: '%', decimals: 1, size: 'full', source, role: 'change' })
    }
  }

  // ---- what the numbers say
  const summary: string[] = []
  const what = `${flowLabel.toLowerCase()} of ${productLabel.toLowerCase()}`
  if (yoy != null) summary.push(fill(yoy > 0.05 ? t.leadUp : yoy < -0.05 ? t.leadDown : t.leadFlat, { month: monthLabel(L), what: lang === 'en' ? what : `${flowLabel} (${productLabel})`, geo: geoLabel, value: fmt(cur), pct: fmtPct(yoy) }))
  if (sameMonth.length >= 4) {
    const higher = sameMonth.filter((e) => e.y < yL && e.value >= cur).sort((a, b) => b.y - a.y)[0]
    const lower = sameMonth.filter((e) => e.y < yL && e.value <= cur).sort((a, b) => b.y - a.y)[0]
    const since = String(Math.min(...sameMonth.map((e) => e.y)))
    const args = { month: monthLabel(L), monthName: monthName(L), since }
    if (rank === 1) insights.unshift({ tone: 'record', parts: [fill(t.recordHigh, args)] })
    else if (rank === sameMonth.length) insights.unshift({ tone: 'record', parts: [fill(t.recordLow, args)] })
    else if (higher && !lower === false && rank <= 3) insights.unshift({ tone: 'up', parts: [fill(t.highestSince, { ...args, since: String(higher.y) })] })
    else if (lower && sameMonth.length - rank < 3) insights.unshift({ tone: 'down', parts: [fill(t.lowestSince, { ...args, since: String(lower.y) })] })
  }
  if (vsAvg != null && Math.abs(vsAvg) >= 1) insights.push({ tone: vsAvg > 0 ? 'up' : 'down', parts: [fill(vsAvg > 0 ? t.aboveAverage : t.belowAverage, { month: monthLabel(L), monthName: monthName(L), pct: fmtPct(vsAvg) })] })
  if (rollChange != null && Math.abs(rollChange) >= 0.5) insights.push({ tone: rollChange > 0 ? 'up' : 'down', parts: [fill(rollChange > 0 ? t.rollingUp : t.rollingDown, { pct: fmtPct(rollChange) })] })
  if (changes.length >= 6) {
    const recent = changes.slice(-12)
    const big = recent.reduce((b, c) => (Math.abs(c.x / c.p - 1) > Math.abs(b.x / b.p - 1) ? c : b), recent[0])
    insights.push({ tone: big.x >= big.p ? 'up' : 'down', parts: [fill(t.biggestMove, { month: monthLabel(big.k), pct: `${big.x >= big.p ? '+' : '−'}${fmtPct((big.x / big.p - 1) * 100)}` })] })
  }

  const tableKeys = windowUpTo(keys[keys.length - 1], Math.min(18, keys.length))
  widgets.push({ type: 'table', title: subtitle, columns: tableKeys, rows: lines.map((g) => ({ label: geoName(main, g), values: tableKeys.map((k) => byGeo.get(g)?.get(k) ?? null), flags: tableKeys.map(() => undefined) })) } as WidgetSpec)

  const title = fill(t.titleSeries, { flow: flowLabel, product: productLabel, geo: many ? `${geos.length} countries` : lines.map((g) => geoName(main, g)).join(', '), month: monthLabel(L) })
  const { spec } = sanitizeSpec({
    title,
    subtitle,
    summary,
    insights,
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions', 'table'],
    presentation: { template: 'monthly', kpiStyle: 'cards', controls: ['geo', 'topic', 'flow', 'product', 'month', 'unit'], primaryControls: 4, accent: 'orange' },
    unit: symbol,
    source: { code: plan.dataset, title: main.label, url: source.url },
    suggestions: monthlySuggestions(ctx),
    controls: monthlyControls(ctx, windowUpTo(keys[keys.length - 1], Math.min(24, keys.length)).filter((k) => v.has(k)), focus),
    context: [title, ...summary, ...insights.map((i) => i.parts.join(''))].join('\n'),
    plan: { ...plan, focusPeriod: L },
    shown: { geo: lines },
  })
  return spec
}

// ---------- net electricity generation: renewables against everything else ----------

async function buildGeneration(ctx: Ctx): Promise<DashboardSpec> {
  const { plan, dict, lang, t, signal } = ctx
  const geos = list(plan.filters.geo).length ? list(plan.filters.geo) : ['EU27_2020']
  const many = geos.length > MAX_LINES
  const lines = many ? ['EU27_2020'] : geos
  const focus = lines[0]
  const unit = 'GWH'
  const symbol = UNIT_SYMBOL[unit]
  const { label: monthLabel, shorts } = monthLabelIn(lang)
  const codes = [...RW, ...NRW].filter((c) => dict.datasets.nrg_cb_pem.dimensions.find((d) => d.id === 'siec')?.codes.includes(c))

  const main = await fetchEurostatData('nrg_cb_pem', { filters: { unit, siec: codes, geo: lines }, lang, signal })
  const perGeo = (g: string) => {
    const code = (c: string) => seriesOf(main, (k) => k.geo === g && k.siec === c)
    const by = new Map(codes.map((c) => [c, code(c)]))
    const rw = new Map<string, number>()
    const nrw = new Map<string, number>()
    const months = new Set<string>()
    for (const s of by.values()) for (const k of s.keys()) months.add(k)
    for (const k of months) {
      const r = sum(RW.map((c) => by.get(c)?.get(k)))
      const n = sum(NRW.map((c) => by.get(c)?.get(k)))
      // (a month is counted when both sides are reported, as enmonthly does)
      if (r > 1 && n > 1) {
        rw.set(k, r)
        nrw.set(k, n)
      }
    }
    const share = new Map([...rw.keys()].map((k) => [k, ((rw.get(k) as number) / ((rw.get(k) as number) + (nrw.get(k) as number))) * 100]))
    return { by, rw, nrw, share }
  }
  const data = new Map(lines.map((g) => [g, perGeo(g)]))
  const f = data.get(focus) as ReturnType<typeof perGeo>
  const keys = [...f.rw.keys()].sort()
  if (!keys.length) throw new NoDataError('nrg_cb_pem')
  const last = keys[keys.length - 1]
  const L = plan.focusPeriod && f.rw.has(plan.focusPeriod) ? plan.focusPeriod : last
  const yL = year(L)
  const mm = monthNo(L)

  const everyoneR = await fetchEurostatData('nrg_cb_pem', { filters: { unit, siec: codes }, sinceTimePeriod: L, untilTimePeriod: L, lang, signal }).catch(() => null)

  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
  const pct = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const fmtPct = (x: number) => `${pct.format(x)}${lang === 'en' ? '%' : ' %'}`
  const geoLabel = geoName(main, focus)
  const source = { code: 'nrg_cb_pem', url: `https://ec.europa.eu/eurostat/databrowser/view/nrg_cb_pem/default/table?lang=${lang}` }
  const subtitle = `${dict.datasets.nrg_cb_pem.title.en ? t.renVsNon : ''} · ${symbol}`.replace(/^ · /, '')

  // ---- the crossover: the months renewables generated more than the rest
  const ahead = (k: string) => (f.rw.get(k) as number) > (f.nrw.get(k) as number)
  const window12 = windowUpTo(L, 12)
  const aheadNow = window12.filter((k) => f.rw.has(k) && ahead(k)).length
  const before12 = windowUpTo(addMonths(L, -12), 12)
  const aheadBefore = before12.filter((k) => f.rw.has(k) && ahead(k)).length
  const firstAhead = keys.find(ahead)
  const shareL = f.share.get(L) as number
  const shareBefore = f.share.get(`${yL - 1}-${mm}`)
  const record = keys.reduce((b, k) => ((f.share.get(k) as number) > (f.share.get(b) as number) ? k : b), keys[0])
  const rwL = f.rw.get(L) as number
  const nrwL = f.nrw.get(L) as number
  const rwBefore = f.rw.get(`${yL - 1}-${mm}`)
  const sourceAt = (name: string, k: string) => sum(SOURCES[name].map((c) => f.by.get(c)?.get(k)))

  const kpis: KpiSpec[] = [
    { label: fill(t.renShare, {}), value: round(shareL), unit: '%', decimals: 1, caption: monthLabel(L), ...(shareBefore != null ? { delta: round(shareL - shareBefore), deltaUnit: 'pp', deltaLabel: fill(t.vsMonth, { month: monthLabel(`${yL - 1}-${mm}`) }) } : {}), goodDirection: 'up', trend: windowUpTo(L, 13).map((k) => (f.share.has(k) ? round(f.share.get(k) as number) : null)) },
    { label: fill(t.renLatest, { month: monthLabel(L) }), value: rwL, unit: symbol, decimals: 0, ...(rwBefore ? { delta: round((rwL / rwBefore - 1) * 100), deltaUnit: '%', deltaLabel: fill(t.vsMonth, { month: monthLabel(`${yL - 1}-${mm}`) }) } : {}), goodDirection: 'up' },
    { label: t.ahead, value: aheadNow, decimals: 0, caption: fill(t.aheadOf, { n: String(aheadBefore) }), goodDirection: 'up' },
    { label: t.recordShare, value: round(f.share.get(record) as number), unit: '%', decimals: 1, caption: monthLabel(record), goodDirection: 'neutral' },
  ]
  const widgets: WidgetSpec[] = [{ type: 'kpis', items: kpis }]

  // ---- renewables and non-renewables, month by month (each country asked for: the share)
  const shownKeys = windowUpTo(last, Math.min(96, keys.length))
  if (lines.length === 1) {
    widgets.push({
      type: 'line',
      title: t.renVsNon,
      subtitle: symbol,
      categories: shownKeys,
      series: [
        { name: t.renewables, data: shownKeys.map((k) => f.rw.get(k) ?? null) },
        { name: t.nonRenewables, data: shownKeys.map((k) => f.nrw.get(k) ?? null) },
      ],
      highlight: L,
      unit: symbol,
      size: 'full',
      role: 'evolution',
    })
  } else {
    widgets.push({
      type: 'line',
      title: t.renShare,
      subtitle: '%',
      categories: shownKeys,
      series: lines.map((g) => ({ name: geoName(main, g), data: shownKeys.map((k) => ((data.get(g) as ReturnType<typeof perGeo>).share.has(k) ? round((data.get(g) as ReturnType<typeof perGeo>).share.get(k) as number) : null)) })),
      highlight: L,
      unit: '%',
      size: 'full',
      role: 'evolution',
    })
  }
  // The gap: above zero, renewables generated more than all the other sources together.
  widgets.push({
    type: 'bar',
    title: t.gap,
    subtitle: `${t.gapNote} (${symbol})`,
    categories: shownKeys.filter((k) => f.rw.has(k)),
    series: [{ name: t.gap, data: shownKeys.filter((k) => f.rw.has(k)).map((k) => Math.round((f.rw.get(k) as number) - (f.nrw.get(k) as number))) }],
    horizontal: false,
    signed: true,
    unit: symbol,
    decimals: 0,
    size: 'full',
    source,
    role: 'change',
  })
  // The share by month and year: the crossover as a picture.
  const years = [...new Set(keys.map(year))].slice(-14)
  widgets.push({
    type: 'heatmap',
    title: t.heat,
    subtitle: '%',
    xCategories: shorts,
    yCategories: years.map(String),
    values: years.map((y) => shorts.map((_, i) => (f.share.has(`${y}-${String(i + 1).padStart(2, '0')}`) ? round(f.share.get(`${y}-${String(i + 1).padStart(2, '0')}`) as number) : null))),
    unit: '%',
    size: 'full',
    role: 'evolution',
  } as WidgetSpec)
  // This year's share against the band the earlier years made.
  const earlierYears = years.filter((y) => y < yL).slice(-10)
  if (earlierYears.length >= 2) {
    const monthsNo = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    const at = (y: number) => monthsNo.map((m) => (f.share.has(`${y}-${m}`) ? round(f.share.get(`${y}-${m}`) as number) : null))
    const perMonth = monthsNo.map((m) => earlierYears.map((y) => f.share.get(`${y}-${m}`)).filter((x): x is number => x != null))
    const span = { from: String(earlierYears[0]), to: String(earlierYears[earlierYears.length - 1]) }
    widgets.push({
      type: 'seasonal',
      title: t.seasonalShare,
      subtitle: `%. ${fill(t.seasonalNote, span)}`,
      months: shorts,
      latest: { name: String(yL), data: at(yL) },
      previous: { name: String(yL - 1), data: at(yL - 1) },
      average: { name: fill(t.average, span), data: perMonth.map((x) => (x.length ? round(mean(x) as number) : null)) },
      range: { name: fill(t.band, span), min: perMonth.map((x) => (x.length ? round(Math.min(...x)) : null)), max: perMonth.map((x) => (x.length ? round(Math.max(...x)) : null)) },
      unit: '%',
      size: 'half',
      source,
      role: 'evolution',
    })
  }
  // The sources behind each side.
  widgets.push({ type: 'area', title: t.renSources, subtitle: symbol, categories: shownKeys, series: RENEWABLE_SOURCES.map((n) => ({ name: t.sources[n], data: shownKeys.map((k) => (f.rw.has(k) ? sourceAt(n, k) : null)) })), stacked: true, highlight: L, unit: symbol, size: 'half', role: 'evolution' })
  widgets.push({ type: 'area', title: t.nonRenSources, subtitle: symbol, categories: shownKeys, series: NON_RENEWABLE_SOURCES.map((n) => ({ name: t.sources[n], data: shownKeys.map((k) => (f.rw.has(k) ? sourceAt(n, k) : null)) })), stacked: true, highlight: L, unit: symbol, size: 'half', role: 'evolution' })
  // The month, and the years.
  const names = [...RENEWABLE_SOURCES, ...NON_RENEWABLE_SOURCES] as string[]
  const slices = names.map((n) => ({ name: t.sources[n as keyof typeof t.sources], y: sourceAt(n, L) })).filter((x) => x.y > 0)
  widgets.push({ type: 'pie', title: fill(t.sourcesNow, { month: monthLabel(L) }), subtitle: symbol, slices, unit: symbol, centerLabel: nf.format(rwL + nrwL), size: 'half', source, role: 'composition' })
  const fullYears = years.filter((y) => Array.from({ length: 12 }, (_, i) => f.rw.has(`${y}-${String(i + 1).padStart(2, '0')}`)).every(Boolean)).slice(-9)
  if (fullYears.length >= 3) {
    const perYear = names.map((n) => ({ name: t.sources[n as keyof typeof t.sources], data: fullYears.map((y) => Math.round(sum(Array.from({ length: 12 }, (_, i) => sourceAt(n, `${y}-${String(i + 1).padStart(2, '0')}`))))) }))
    widgets.push({ type: 'bar', title: t.sharesByYear, subtitle: '%', categories: fullYears.map(String), series: perYear, stacked: 'percent', size: 'half', source, role: 'composition' })
  }
  // The countries: who leads in the month.
  if (everyoneR) {
    const rw = countryValues(everyoneR, L, (k) => RW.includes(k.siec))
    const non = countryValues(everyoneR, L, (k) => NRW.includes(k.siec))
    const rows = [...rw.entries()].filter(([c]) => (non.get(c) ?? 0) > 1 && (rw.get(c) as number) > 0).map(([code, r]) => ({ code, name: geoName(everyoneR, code), share: round((r / (r + (non.get(code) as number))) * 100) })).sort((a, b) => b.share - a.share)
    if (rows.length >= 6) {
      widgets.push({ type: 'bar', title: fill(t.renRanking, { month: monthLabel(L) }), subtitle: '%', categories: rows.map((r) => r.name), series: [{ name: t.renShare, data: rows.map((r) => r.share) }], horizontal: true, unit: '%', decimals: 1, size: 'half', source, role: 'ranking' })
      if (rows.length >= 8) widgets.push({ type: 'map', title: fill(t.renRanking, { month: monthLabel(L) }), subtitle: '%', data: rows.map((r) => ({ code: r.code, name: r.name, value: r.share })), size: 'half', role: 'map' })
    }
  }

  // ---- the story
  const summary = [fill(t.leadRw, { month: monthLabel(L), ren: `${nf.format(rwL)} ${symbol}`, geo: geoLabel, share: fmtPct(shareL), rel: rwL > nrwL ? t.relAhead : t.relBehind, non: `${nf.format(nrwL)} ${symbol}` })]
  const insights: Insight[] = []
  if (firstAhead) insights.push({ tone: 'record', parts: [fill(t.firstAhead, { month: monthLabel(firstAhead) })] })
  insights.push({ tone: aheadNow >= aheadBefore ? 'up' : 'down', parts: [fill(t.aheadYears, { a: String(aheadNow), b: String(aheadBefore), month: monthLabel(addMonths(L, -12)) })] })
  if (record === L) insights.unshift({ tone: 'record', parts: [fill(t.recordShareInsight, { month: monthLabel(L), share: fmtPct(shareL) })] })
  if (shareBefore != null && Math.abs(shareL - shareBefore) >= 0.1) insights.push({ tone: shareL > shareBefore ? 'up' : 'down', parts: [fill(shareL > shareBefore ? t.shareUp : t.shareDown, { pp: pct.format(Math.abs(shareL - shareBefore)) })] })
  const windSolar = sourceAt('wind', L) + sourceAt('solar', L)
  if (windSolar > 0) insights.push({ tone: 'neutral', parts: [fill(t.windSolar, { share: fmtPct((windSolar / (rwL + nrwL)) * 100), month: monthLabel(L) })] })

  const tableKeys = windowUpTo(last, Math.min(18, keys.length))
  widgets.push({
    type: 'table',
    title: t.renVsNon,
    columns: tableKeys,
    rows: [
      { label: t.renewables, values: tableKeys.map((k) => f.rw.get(k) ?? null), flags: tableKeys.map(() => undefined) },
      { label: t.nonRenewables, values: tableKeys.map((k) => f.nrw.get(k) ?? null), flags: tableKeys.map(() => undefined) },
      { label: t.renShare, values: tableKeys.map((k) => (f.share.has(k) ? round(f.share.get(k) as number) : null)), flags: tableKeys.map(() => undefined) },
    ],
  } as WidgetSpec)

  const title = fill(t.titleGeneration, { geo: many ? `${geos.length} countries` : lines.map((g) => geoName(main, g)).join(', '), month: monthLabel(L) })
  const { spec } = sanitizeSpec({
    title,
    subtitle,
    summary,
    insights,
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions', 'table'],
    presentation: { template: 'monthly', kpiStyle: 'cards', controls: ['geo', 'topic', 'month'], primaryControls: 3, accent: 'teal' },
    unit: symbol,
    source: { code: 'nrg_cb_pem', title: main.label, url: source.url },
    suggestions: monthlySuggestions(ctx),
    controls: monthlyControls(ctx, windowUpTo(last, Math.min(24, keys.length)).filter((k) => f.rw.has(k)), focus),
    context: [title, ...summary, ...insights.map((i) => i.parts.join(''))].join('\n'),
    plan: { ...plan, focusPeriod: L },
    shown: { geo: lines },
  })
  return spec
}
