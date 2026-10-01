import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { NoDataError } from './execute'
import { detectGeos, detectTime, parse } from './planner/parse'
import type { DashboardSpec, Insight, KpiSpec, Plan, Suggestion, WidgetSpec } from './types'
import { compareChoice, withVersus } from './compareControl'
import { compareRequest } from './comparing'
import { sanitizeSpec } from './validate'

/**
 * Oil security: one dashboard for what wars and price shocks change in oil - where it comes from
 * (crude oil imports by origin, Russia's share), how dependent a country is, what crude costs, how
 * much is in stock and what oil is used for. Every number is Eurostat's: monthly imports by partner
 * (nrg_ti_oilm), stocks (nrg_stk_oilm), crude prices (nrg_cb_cosm), the energy balance (nrg_bal_c),
 * import dependency (nrg_ind_id, nrg_ind_idooil).
 */

export type OilStrings = Strings['oil']

const DATASET = 'nrg_ti_oilm'
const EU = 'EU27_2020'
const EU_MEMBERS = ['BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE']
export const OIL_GEOS = [EU, ...EU_MEMBERS, 'NO', 'IS', 'TR', 'UK']
const CRUDE_PARTNERS = ['RU', 'US', 'NO', 'KZ', 'LY', 'NG', 'IQ', 'SA', 'AZ', 'DZ', 'UK', 'BR']
const PRODUCT_SIEC: Record<string, keyof OilStrings> = { O4652XR5210B: 'gasoline', O4671XR5220B: 'diesel', O4661XR5230B: 'jet', O4630: 'lpg', O4680: 'fuelOil' }
const WAR_MONTH = '2022-02'

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

// ---------- questions ----------

const OIL = / (oil|petroleum|crude|brent|petrol|diesel|gasoline|fuel oil|heating oil|erdol\w*|\w*olversorgung|ol|ol(?:import|export|abhang|krise|vorrat|preis|lieferung|knappheit|embargo)\w*|mineralol\w*|petrole|petroli\w+|gasoil|carburants?) /
// (not "prices" or "stocks" alone: those are the monthly dashboards)
// German compounds that name the topic themselves ("Ölabhängigkeit", "Ölkrise").
const OIL_COMPOUND = / ol(?:abhang|krise|vorrat|knappheit|embargo|versorg)\w* /
const OIL_TOPIC = / (dashboard|security|crisis|crises|shock|shocks|situation|overview|dependence|dependency|dependent|exposure|war|wars|russia|russian|ukraine|sanctions|embargo|embargoes|resilience|cover|coverage|days of|reichweite|autonomie|versorgungssicherheit|krise|abhangigkeit|abhangig|securite|dependance|crise|crises|penurie|rupture|risk|risks|risky|vulnerable|vulnerability|running out|run out|shortage|shortages|scarcity|emergency|reserves?|approvisionnement|russe|russes|russie|russland|russischen?|russisches|cut off|disruption|disruptions) /
const DEFINITION = /^ (what is|what are|define|was ist|qu est ce)\b/

/** The oil dashboard a question asks for ("oil security in Germany", "how dependent is Italy on Russian oil"), or null. */
export function oilPlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  if (!OIL.test(p.text) || !(OIL_TOPIC.test(p.text) || OIL_COMPOUND.test(p.text)) || DEFINITION.test(p.text)) return null
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => OIL_GEOS.includes(c)) ?? EU
  const year = detectTime(p).years.at(-1)
  return { dataset: DATASET, filters: { geo }, time: { kind: 'all' }, ...(year ? { focusPeriod: String(year) } : {}), intent: 'snapshot', oil: {} }
}

/** "and France?": another country for the oil dashboard on screen. */
export function refineOil(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.oil || !dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => OIL_GEOS.includes(c)) ?? (places.eu ? EU : undefined)
  // "compare with France", "versus the EU", "no comparison": the country set against another (earlier years are the key figures' arrows).
  const asked = compareRequest(p.text, places, OIL_GEOS, String(current.filters.geo ?? EU), false)
  if (asked && 'off' in asked) return current.oil.compare ? { ...current, oil: {}, notes: [] } : null
  if (asked) return { ...current, oil: { ...current.oil, compare: asked.target }, notes: [] }
  const rest = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|wie|ist|es|show|zeige|montre|now|jetzt|maintenant)$/.test(w))
  const known = rest.every((w) => detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!geo || (!known && !(OIL.test(p.text) && OIL_TOPIC.test(p.text)))) return null
  return { ...current, filters: { ...current.filters, geo }, oil: current.oil.compare && current.oil.compare !== geo ? { compare: current.oil.compare } : {}, notes: [] }
}

// ---------- data helpers ----------

type Month = Map<string, number>

/** Values by period of the observations that match. */
function seriesOf(result: EurostatResult | null, match: (keys: Record<string, string>) => boolean): Month {
  const out: Month = new Map()
  for (const o of result?.observations ?? []) if (o.value != null && match(o.keys)) out.set(o.keys.time, o.value)
  return out
}

const sortedKeys = (m: Month) => [...m.keys()].sort()
const yearOf = (period: string) => period.slice(0, 4)

/** Annual totals of monthly values, for the years that have all twelve months. */
function annual(m: Month): Map<string, number> {
  const sums = new Map<string, { sum: number; n: number }>()
  for (const [period, v] of m) {
    const y = yearOf(period)
    const s = sums.get(y) ?? { sum: 0, n: 0 }
    s.sum += v
    s.n += 1
    sums.set(y, s)
  }
  return new Map([...sums].filter(([, s]) => s.n === 12).map(([y, s]) => [y, s.sum]))
}

const label = (result: EurostatResult | null, dim: string, code: string) => result?.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code

export async function buildOilDashboard(plan: Plan, dict: EnergyDictionary, lang: string, s: { oil: OilStrings; sugExplain: string }, signal?: AbortSignal): Promise<DashboardSpec> {
  const t = s.oil
  const geo = String(plan.filters.geo ?? EU)
  const isEu = geo === EU
  const ask = (dataset: string, filters: Record<string, string | string[]>, query: Record<string, string> = {}) =>
    dict.datasets[dataset] ? fetchEurostatData(dataset, { filters, lang, signal, ...query }).catch(() => null) : Promise.resolve(null)
  const productCodes = Object.keys(PRODUCT_SIEC)
  const compareGeo = plan.oil?.compare && plan.oil.compare !== geo ? plan.oil.compare : undefined
  const [crude, products, stocks, cosm, balance, dependency, russiaByCountry, productImports, dieselRu, productStocks, exportsAll] = await Promise.all([
    ask(DATASET, { geo, siec: 'O4100_TOT', partner: [...CRUDE_PARTNERS, 'TOTAL'], unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
    ask(DATASET, { geo, siec: 'O4000', partner: ['TOTAL', 'RU'], unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
    ask('nrg_stk_oilm', { geo, siec: 'O4000', stk_flow: 'STK_CL', unit: 'THS_T' }),
    ask('nrg_cb_cosm', { freq: 'M', geo: isEu ? EU_MEMBERS : geo, nrg_bal: 'IMP', indic_nrg: ['AVGPRC_USD_BBL', 'VOL_THS_BBL'] }),
    ask('nrg_bal_c', { geo, siec: ['O4000XBIO', 'TOTAL', ...Object.keys(PRODUCT_SIEC)], nrg_bal: ['GAE', 'IMP', 'EXP', 'FC_E', 'FC_NE', 'FC_TRA_E', 'FC_IND_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'INTMARB', 'INTAVI'], unit: 'KTOE' }),
    ask('nrg_ind_id', { geo: [...new Set([geo, ...EU_MEMBERS, ...(compareGeo ? [compareGeo] : [])])], siec: 'O4000XBIO', unit: 'PC' }),
    ask('nrg_ind_idooil', { geo: EU_MEMBERS, partner: 'RU', unit: 'PC' }),
    ask(DATASET, { geo, siec: productCodes, partner: 'TOTAL', unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
    ask(DATASET, { geo, siec: 'O4671XR5220B', partner: ['TOTAL', 'RU'], unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
    ask('nrg_stk_oilm', { geo, siec: ['O4100_TOT', ...productCodes], stk_flow: 'STK_CL', unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
    ask('nrg_te_oilm', { geo, siec: 'O4000', partner: 'TOTAL', unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
  ])
  // The other place of a comparison: its oil imports (and Russia's share), stocks and exports.
  const compareData = compareGeo
    ? await Promise.all([
        ask(DATASET, { geo: compareGeo, siec: 'O4000', partner: ['TOTAL', 'RU'], unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
        ask('nrg_stk_oilm', { geo: compareGeo, siec: 'O4000', stk_flow: 'STK_CL', unit: 'THS_T' }),
        ask('nrg_te_oilm', { geo: compareGeo, siec: 'O4000', partner: 'TOTAL', unit: 'THS_T' }, { sinceTimePeriod: '2015-01' }),
      ])
    : null
  if (!crude && !products && !cosm && !balance) throw new NoDataError(DATASET)

  const geoName = (label(crude ?? balance ?? cosm, 'geo', geo) || geo).replace(/\s*\(.*?\)\s*$/, '')
  const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })
  const pct = (v: number) => nf(1).format(v)
  const source = (code: string, title: string) => ({ code, title, url: `https://ec.europa.eu/eurostat/databrowser/view/${code}/default/table?lang=${lang}` })

  // ----- monthly: crude oil imports by origin, Russia's share of all oil imports -----
  const total = seriesOf(crude, (k) => k.partner === 'TOTAL')
  const months = sortedKeys(total)
  const russiaAll = seriesOf(products, (k) => k.partner === 'RU')
  const totalAll = seriesOf(products, (k) => k.partner === 'TOTAL')
  const russiaShare = new Map<string, number>()
  for (const [m, v] of totalAll) if (v > 0 && russiaAll.has(m)) russiaShare.set(m, (100 * russiaAll.get(m)!) / v)
  const ruAnnual = new Map<string, number>()
  {
    const ra = annual(russiaAll)
    const ta = annual(totalAll)
    for (const [y, v] of ta) if (v > 0) ruAnnual.set(y, (100 * (ra.get(y) ?? 0)) / v)
  }
  const ruYears = [...ruAnnual.keys()].sort()
  const ruYear = ruYears.at(-1)
  const ru21 = ruAnnual.get('2021')

  // ----- monthly: crude oil import price (the EU as the volume-weighted average of its countries) -----
  const price: Month = new Map()
  {
    const sumPV = new Map<string, number>()
    const sumV = new Map<string, number>()
    const count = new Map<string, number>()
    const byGeoPrice = new Map<string, number>()
    for (const o of cosm?.observations ?? []) {
      if (o.value == null) continue
      const k = `${o.keys.geo}|${o.keys.time}`
      if (o.keys.indic_nrg === 'AVGPRC_USD_BBL') byGeoPrice.set(k, o.value)
    }
    for (const o of cosm?.observations ?? []) {
      if (o.value == null || o.keys.indic_nrg !== 'VOL_THS_BBL' || o.value <= 0) continue
      const p = byGeoPrice.get(`${o.keys.geo}|${o.keys.time}`)
      if (p == null) continue
      sumPV.set(o.keys.time, (sumPV.get(o.keys.time) ?? 0) + p * o.value)
      sumV.set(o.keys.time, (sumV.get(o.keys.time) ?? 0) + o.value)
      count.set(o.keys.time, (count.get(o.keys.time) ?? 0) + 1)
    }
    const counts = [...count.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-36).map(([, n]) => n).sort((a, b) => a - b)
    const typical = counts.length ? counts[Math.floor(counts.length / 2)] : 0
    for (const [m, v] of sumV) if (v > 0 && (!isEu || (count.get(m) ?? 0) >= 0.8 * typical)) price.set(m, sumPV.get(m)! / v)
  }
  const priceMonths = sortedKeys(price).filter((m) => m >= '2010-01')
  const lastPriceMonth = priceMonths.at(-1)
  const priceNow = lastPriceMonth ? price.get(lastPriceMonth)! : undefined
  const yearAgoMonth = lastPriceMonth ? `${Number(yearOf(lastPriceMonth)) - 1}${lastPriceMonth.slice(4)}` : undefined
  const priceYearAgo = yearAgoMonth ? price.get(yearAgoMonth) : undefined
  const priceWindow = priceMonths.slice(-61, -1)
  const priceAvg = priceWindow.length ? priceWindow.reduce((a, m) => a + price.get(m)!, 0) / priceWindow.length : undefined
  const peakMonth = priceMonths.filter((m) => m >= '2020-01').reduce<string | undefined>((best, m) => (best == null || price.get(m)! > price.get(best)! ? m : best), undefined)

  // ----- monthly: oil stocks -----
  const stockSeries = seriesOf(stocks, () => true)
  const stockMonths = sortedKeys(stockSeries).filter((m) => m >= '2013-01')
  const lastStock = stockMonths.at(-1)
  const stockNow = lastStock ? stockSeries.get(lastStock)! / 1000 : undefined
  const stockAgoKey = lastStock ? `${Number(yearOf(lastStock)) - 1}${lastStock.slice(4)}` : undefined
  const stockAgo = stockAgoKey && stockSeries.has(stockAgoKey) ? stockSeries.get(stockAgoKey)! / 1000 : undefined

  // ----- stock cover: days of net imports the stocks would cover (imports minus exports of the 12 months before) -----
  const exportsTotal = seriesOf(exportsAll, (k) => k.partner === 'TOTAL')
  const cover: Month = new Map()
  {
    const netMonths = sortedKeys(totalAll)
    const net = new Map(netMonths.map((m) => [m, (totalAll.get(m) ?? 0) - (exportsTotal.get(m) ?? 0)]))
    for (let i = 11; i < netMonths.length; i++) {
      const m = netMonths[i]
      const window = netMonths.slice(i - 11, i + 1)
      if (window.some((w) => !net.has(w)) || !stockSeries.has(m)) continue
      const daily = window.reduce((a, w) => a + net.get(w)!, 0) / 365
      if (daily > 0) cover.set(m, stockSeries.get(m)! / daily)
    }
  }
  const coverMonths = sortedKeys(cover)
  const coverNow = coverMonths.length ? cover.get(coverMonths.at(-1)!)! : undefined
  const coverAgoKey = coverMonths.length ? `${Number(yearOf(coverMonths.at(-1)!)) - 1}${coverMonths.at(-1)!.slice(4)}` : undefined
  const coverAgo = coverAgoKey ? cover.get(coverAgoKey) : undefined

  // ----- annual: balance and dependency -----
  const bal = (siec: string, line: string, year: string) => balance?.observations.find((o) => o.keys.siec === siec && o.keys.nrg_bal === line && o.keys.time === year)?.value ?? null
  const balYears = [...new Set((balance?.observations ?? []).map((o) => o.keys.time))].sort()
  const depSeries = seriesOf(dependency, (k) => k.geo === geo)
  const depYears = sortedKeys(depSeries)
  const depYear = depYears.at(-1)
  const depNow = depYear ? depSeries.get(depYear)! : undefined
  const depPrev = depYear ? depSeries.get(String(Number(depYear) - 1)) : undefined
  const shareOfMix = (y: string) => {
    const oil = bal('O4000XBIO', 'GAE', y)
    const all = bal('TOTAL', 'GAE', y)
    return oil != null && all ? (100 * oil) / all : null
  }
  const mixYear = [...balYears].reverse().find((y) => shareOfMix(y) != null)
  const mixNow = mixYear ? shareOfMix(mixYear) : null
  const mixYears = balYears.filter((y) => shareOfMix(y) != null)

  const at = (list: string[], from: string) => list.filter((m) => m >= from)
  const widgets: WidgetSpec[] = []
  const kpis: KpiSpec[] = []
  const insights: Insight[] = []

  // ----- KPIs -----
  if (depNow != null)
    kpis.push({ label: t.kpiDependency, value: Math.round(depNow * 10) / 10, unit: '%', decimals: 1, ...(depPrev != null ? { delta: Math.round((depNow - depPrev) * 10) / 10, deltaUnit: '%', deltaLabel: String(Number(depYear) - 1) } : {}), caption: depYear, goodDirection: 'down', trend: depYears.slice(-15).map((y) => depSeries.get(y) ?? null) })
  if (ruYear && ruAnnual.has(ruYear))
    kpis.push({ label: t.kpiRussia, value: Math.round(ruAnnual.get(ruYear)! * 10) / 10, unit: '%', decimals: 1, ...(ru21 != null && ruYear !== '2021' ? { delta: Math.round((ruAnnual.get(ruYear)! - ru21) * 10) / 10, deltaUnit: '%', deltaLabel: '2021' } : {}), caption: ruYear, goodDirection: 'down', trend: ruYears.slice(-10).map((y) => Math.round(ruAnnual.get(y)! * 10) / 10) })
  if (priceNow != null && lastPriceMonth)
    kpis.push({ label: t.kpiPrice, value: Math.round(priceNow * 10) / 10, unit: t.unitPrice, decimals: 1, ...(priceYearAgo != null ? { delta: Math.round((priceNow - priceYearAgo) * 10) / 10, deltaUnit: t.unitPrice, deltaLabel: yearAgoMonth } : {}), caption: lastPriceMonth, goodDirection: 'down', trend: priceMonths.slice(-24).map((m) => Math.round(price.get(m)! * 10) / 10) })
  if (stockNow != null && lastStock)
    kpis.push({ label: t.kpiStocks, value: Math.round(stockNow * 10) / 10, unit: t.unitStocks, decimals: 1, ...(stockAgo != null ? { delta: Math.round((stockNow - stockAgo) * 10) / 10, deltaUnit: t.unitStocks, deltaLabel: stockAgoKey } : {}), caption: lastStock, goodDirection: 'up', trend: stockMonths.slice(-24).map((m) => Math.round((stockSeries.get(m)! / 1000) * 10) / 10) })
  if (coverNow != null && coverMonths.length)
    kpis.push({ label: t.kpiCover, value: Math.round(coverNow), unit: t.unitDays, decimals: 0, ...(coverAgo != null ? { delta: Math.round(coverNow - coverAgo), deltaUnit: t.unitDays, deltaLabel: coverAgoKey } : {}), caption: coverMonths.at(-1), goodDirection: 'up', trend: coverMonths.slice(-24).map((m) => Math.round(cover.get(m)!)) })
  if (mixNow != null && mixYear) kpis.push({ label: t.kpiShare, value: Math.round(mixNow * 10) / 10, unit: '%', decimals: 1, caption: mixYear, goodDirection: 'down', trend: mixYears.slice(-15).map((y) => Math.round(shareOfMix(y)! * 10) / 10) })
  widgets.push({ type: 'kpis', items: kpis })

  // ----- compared with another country or the EU: dependency, Russia's share, stock cover -----
  const comparisonSummary: string[] = []
  let versusName: string | undefined
  if (compareGeo && compareData) {
    const [productsC, stocksC, exportsC] = compareData
    const nameC: string = compareGeo === EU ? 'EU-27' : (label(productsC ?? stocksC, 'geo', compareGeo) || compareGeo).replace(/\s*\(.*?\)\s*$/, '')
    versusName = nameC
    const totalC = seriesOf(productsC, (k) => k.partner === 'TOTAL')
    const ruC = annual(seriesOf(productsC, (k) => k.partner === 'RU'))
    const totalCa = annual(totalC)
    const ruShareC = new Map<string, number>()
    for (const [y, v] of totalCa) if (v > 0) ruShareC.set(y, (100 * (ruC.get(y) ?? 0)) / v)
    const depC = seriesOf(dependency, (k) => k.geo === compareGeo)
    const stockC = seriesOf(stocksC, () => true)
    const exportsTotalC = seriesOf(exportsC, (k) => k.partner === 'TOTAL')
    const coverC: Month = new Map()
    {
      const netMonths = sortedKeys(totalC)
      const net = new Map(netMonths.map((m) => [m, (totalC.get(m) ?? 0) - (exportsTotalC.get(m) ?? 0)]))
      for (let i = 11; i < netMonths.length; i++) {
        const window = netMonths.slice(i - 11, i + 1)
        if (window.some((w) => !net.has(w)) || !stockC.has(netMonths[i])) continue
        const daily = window.reduce((a, w) => a + net.get(w)!, 0) / 365
        if (daily > 0) coverC.set(netMonths[i], stockC.get(netMonths[i])! / daily)
      }
    }
    const pair = (title: string, subtitle: string, a: Map<string, number>, b: Map<string, number>, from: string, unit: string) => {
      const cats = [...new Set([...a.keys(), ...b.keys()])].filter((c) => c >= from).sort()
      if (cats.length >= 2 && a.size && b.size) widgets.push({ type: 'line', title, subtitle, categories: cats, series: [{ name: geoName, data: cats.map((c) => a.get(c) ?? null) }, { name: nameC, data: cats.map((c) => b.get(c) ?? null) }], unit, size: 'half', role: 'evolution', cmp: true })
    }
    pair(fill(t.compareDependency, { geo: geoName, other: nameC }), '%', depSeries, depC, '2005', '%')
    pair(fill(t.compareRussia, { geo: geoName, other: nameC }), '%', ruAnnual, ruShareC, '2015', '%')
    pair(fill(t.compareCover, { geo: geoName, other: nameC }), t.unitDays, cover, coverC, [...new Set([...cover.keys(), ...coverC.keys()])].sort().slice(-60)[0] ?? '2020-01', t.unitDays)
    const last = (m: Map<string, number>) => (m.size ? m.get([...m.keys()].sort().at(-1)!)! : null)
    const [da, db, ra, rb, ca, cb] = [last(depSeries), last(depC), last(ruAnnual), last(ruShareC), last(cover), last(coverC)]
    const f = (v: number | null, unit: string) => (v == null ? '–' : `${nf(v >= 100 || unit === t.unitDays ? 0 : 1).format(v)}${unit === '%' ? '%' : ` ${unit}`}`)
    if (da != null || ra != null || ca != null) comparisonSummary.push(fill(t.compareSummary, { geo: geoName, other: nameC, dep: f(da, '%'), otherDep: f(db, '%'), ru: f(ra, '%'), otherRu: f(rb, '%'), cover: f(ca, t.unitDays), otherCover: f(cb, t.unitDays) }))
  }

  // ----- price gauge -----
  if (priceNow != null && priceAvg != null && lastPriceMonth) {
    const max = Math.ceil((Math.max(priceNow, priceAvg * 1.6) * 1.05) / 10) * 10
    widgets.push({ type: 'gauge', title: t.cGauge, subtitle: `${lastPriceMonth} · ${nf(1).format(priceNow)} ${t.unitPrice} · ${nf(1).format(priceAvg)} ${t.unitPrice} (5y)`, value: Math.round(priceNow * 10) / 10, label: `${geoName}, ${lastPriceMonth}`, max, targets: [{ value: Math.round(priceAvg * 10) / 10, label: `${nf(0).format(priceAvg)}` }], unit: t.unitPrice, goal: 'stay-under', size: 'half', source: source('nrg_cb_cosm', label(cosm, 'geo', geo)) })
  }

  // ----- the cover against the 90 days: a gauge and its history -----
  if (coverNow != null && coverMonths.length > 12) {
    const lastCover = coverMonths.at(-1)!
    widgets.push({ type: 'gauge', title: t.cGaugeCover, subtitle: `${lastCover} · ${nf(0).format(coverNow)} ${t.unitDays}`, value: Math.round(coverNow), label: `${geoName}, ${lastCover}`, max: Math.max(180, Math.ceil((coverNow * 1.1) / 30) * 30), targets: [{ value: 90, label: `90 ${t.unitDays}` }], unit: t.unitDays, goal: 'reach', size: 'half', source: source('nrg_stk_oilm', label(stocks, 'siec', 'O4000')) })
    const shownCover = coverMonths.filter((m) => m >= '2016-01')
    widgets.push({ type: 'line', title: t.cCover, subtitle: `${geoName} · ${t.unitDays}`, categories: shownCover, series: [{ name: geoName, data: shownCover.map((m) => Math.round(cover.get(m)!)) }], unit: t.unitDays, size: 'half', highlight: shownCover.includes(WAR_MONTH) ? WAR_MONTH : undefined, reference: { value: 90, label: `90 ${t.unitDays}` }, source: source('nrg_stk_oilm', label(stocks, 'siec', 'O4000')) } as WidgetSpec)
  }

  // ----- where the crude comes from: monthly by origin (absolute and shares) -----
  if (crude && months.length > 12) {
    const shown = at(months, '2015-01')
    const partnerSeries = CRUDE_PARTNERS.map((code) => ({ code, values: seriesOf(crude, (k) => k.partner === code) })).filter((x) => x.values.size > 0)
    const series = partnerSeries.map((x) => ({ name: x.code === 'RU' ? t.russia : label(crude, 'partner', x.code).replace(/\s*\(.*?\)\s*$/, ''), data: shown.map((m) => (x.values.get(m) != null ? Math.round(x.values.get(m)!) : 0)) }))
    const other = shown.map((m) => Math.max(0, Math.round((total.get(m) ?? 0) - partnerSeries.reduce((sum, x) => sum + (x.values.get(m) ?? 0), 0))))
    if (other.some((v) => v > 0)) series.push({ name: t.other, data: other })
    const marker = shown.includes(WAR_MONTH) ? WAR_MONTH : undefined
    const src = source(DATASET, label(crude, 'siec', 'O4100_TOT'))
    widgets.push({ type: 'area', title: t.cImports, subtitle: `${geoName} · ${t.event}: ${WAR_MONTH} · thousand tonnes`, categories: shown, series, stacked: true, unit: 'kt', size: 'full', ...(marker ? { highlight: marker } : {}), source: src } as WidgetSpec)
    widgets.push({ type: 'area', title: t.cImportsShare, subtitle: `${geoName} · %`, categories: shown, series, stacked: 'percent', unit: '%', size: 'half', ...(marker ? { highlight: marker } : {}), source: src } as WidgetSpec)
  }

  // ----- Russia's share of all oil imports, monthly -----
  const shareMonths = sortedKeys(russiaShare).filter((m) => m >= '2015-01')
  if (shareMonths.length > 12) {
    const dRu = seriesOf(dieselRu, (k) => k.partner === 'RU')
    const dTot = seriesOf(dieselRu, (k) => k.partner === 'TOTAL')
    const dieselShare = shareMonths.map((m) => (dTot.get(m) && dTot.get(m)! > 0 && dRu.has(m) ? Math.round((1000 * dRu.get(m)!) / dTot.get(m)!) / 10 : null))
    widgets.push({ type: 'line', title: t.cRussia, subtitle: `${geoName} · %`, categories: shareMonths, series: [{ name: t.allRu, data: shareMonths.map((m) => Math.round(russiaShare.get(m)! * 10) / 10) }, ...(dieselShare.some((v) => v != null) ? [{ name: t.dieselRu, data: dieselShare }] : [])], unit: '%', size: 'half', ...(shareMonths.includes(WAR_MONTH) ? { highlight: WAR_MONTH } : {}), source: source(DATASET, label(products, 'siec', 'O4000')) } as WidgetSpec)
  }

  // ----- price and stocks -----
  if (priceMonths.length > 24) {
    widgets.push({ type: 'line', title: t.cPrice, subtitle: `${geoName} · ${t.unitPrice}`, categories: priceMonths, series: [{ name: geoName, data: priceMonths.map((m) => Math.round(price.get(m)! * 10) / 10) }], unit: t.unitPrice, size: 'half', highlight: priceMonths.includes(WAR_MONTH) ? WAR_MONTH : undefined, ...(priceAvg != null ? { reference: { value: Math.round(priceAvg * 10) / 10, label: `5y ${nf(0).format(priceAvg)}` } } : {}), source: source('nrg_cb_cosm', label(cosm, 'geo', geo)) } as WidgetSpec)
  }
  if (stockMonths.length > 24) {
    widgets.push({ type: 'line', title: t.cStocks, subtitle: `${geoName} · ${t.unitStocks}`, categories: stockMonths, series: [{ name: geoName, data: stockMonths.map((m) => Math.round((stockSeries.get(m)! / 1000) * 10) / 10) }], unit: t.unitStocks, size: 'half', highlight: stockMonths.includes(WAR_MONTH) ? WAR_MONTH : undefined, source: source('nrg_stk_oilm', label(stocks, 'siec', 'O4000')) } as WidgetSpec)
  }

  // ----- the products: imports by type, stocks by product, net imports -----
  const productName = (siec: string) => t[PRODUCT_SIEC[siec]] as string
  if (productImports) {
    const shown = at(sortedKeys(seriesOf(productImports, (k) => k.siec === 'O4671XR5220B')), '2015-01')
    const series = productCodes.map((siec) => ({ name: productName(siec), values: seriesOf(productImports, (k) => k.siec === siec) })).filter((x) => x.values.size > 0).map((x) => ({ name: x.name, data: shown.map((m) => Math.round(x.values.get(m) ?? 0)) }))
    if (shown.length > 12 && series.length > 1) widgets.push({ type: 'area', title: t.cProductImports, subtitle: `${geoName} · kt`, categories: shown, series, stacked: true, unit: 'kt', size: 'half', ...(shown.includes(WAR_MONTH) ? { highlight: WAR_MONTH } : {}), source: source(DATASET, label(productImports, 'siec', 'O4671XR5220B')) } as WidgetSpec)
  }
  if (productStocks) {
    const shown = at(sortedKeys(seriesOf(productStocks, (k) => k.siec === 'O4100_TOT')), '2015-01')
    const codes = ['O4100_TOT', ...productCodes]
    const series = codes.map((siec) => ({ name: siec === 'O4100_TOT' ? t.crude : productName(siec), values: seriesOf(productStocks, (k) => k.siec === siec) })).filter((x) => x.values.size > 0).map((x) => ({ name: x.name, data: shown.map((m) => Math.round(((x.values.get(m) ?? 0) / 1000) * 10) / 10) }))
    if (shown.length > 12 && series.length > 1) widgets.push({ type: 'area', title: t.cStocksProducts, subtitle: `${geoName} · ${t.unitStocks}`, categories: shown, series, stacked: true, unit: t.unitStocks, size: 'half', ...(shown.includes(WAR_MONTH) ? { highlight: WAR_MONTH } : {}), source: source('nrg_stk_oilm', label(productStocks, 'siec', 'O4100_TOT')) } as WidgetSpec)
  }
  const netYear = [...balYears].reverse().find((y) => productCodes.some((c) => bal(c, 'IMP', y) != null))
  if (netYear) {
    const rows = productCodes.map((siec) => ({ name: productName(siec), y: Math.round((bal(siec, 'IMP', netYear) ?? 0) - Math.abs(bal(siec, 'EXP', netYear) ?? 0)) })).filter((x) => x.y !== 0).sort((a, b) => b.y - a.y)
    if (rows.length > 2) widgets.push({ type: 'bar', title: `${t.cNet} · ${netYear}`, subtitle: `${geoName} · ktoe`, categories: rows.map((x) => x.name), series: [{ name: geoName, data: rows.map((x) => x.y) }], signed: true, unit: 'ktoe', size: 'half', source: source('nrg_bal_c', label(balance, 'siec', 'O4652XR5210B')) })
  }

  // ----- dependency and oil in the mix, annual -----
  if (depYears.length > 5 || mixYears.length > 5) {
    const years = [...new Set([...depYears, ...mixYears])].sort()
    widgets.push({
      type: 'line',
      title: t.cDependency,
      subtitle: `${geoName} · %`,
      categories: years,
      series: [
        { name: t.dependency, data: years.map((y) => (depSeries.has(y) ? Math.round(depSeries.get(y)! * 10) / 10 : null)) },
        { name: t.inMix, data: years.map((y) => (shareOfMix(y) != null ? Math.round(shareOfMix(y)! * 10) / 10 : null)) },
      ],
      unit: '%',
      size: 'half',
      source: source('nrg_ind_id', label(dependency, 'siec', 'O4000XBIO')),
    } as WidgetSpec)
  }

  // ----- what oil is used for, and which products -----
  const useYear = [...balYears].reverse().find((y) => bal('O4000XBIO', 'FC_E', y) != null)
  if (useYear) {
    const v = (line: string) => Math.max(0, bal('O4000XBIO', line, useYear) ?? 0)
    const listed = v('FC_TRA_E') + v('FC_IND_E') + v('FC_OTH_HH_E') + v('FC_OTH_CP_E')
    const uses = [
      { name: t.transport, y: v('FC_TRA_E') },
      { name: t.industry, y: v('FC_IND_E') },
      { name: t.households, y: v('FC_OTH_HH_E') },
      { name: t.services, y: v('FC_OTH_CP_E') },
      { name: t.nonEnergy, y: v('FC_NE') },
      { name: t.bunkers, y: v('INTMARB') + v('INTAVI') },
      { name: t.otherUses, y: Math.max(0, v('FC_E') - listed) },
    ]
      .map((x) => ({ ...x, y: Math.round(x.y) }))
      .filter((x) => x.y > 0)
    if (uses.length > 1) widgets.push({ type: 'pie', title: `${t.cUses} · ${useYear}`, subtitle: `${geoName} · ktoe`, slices: uses, unit: 'ktoe', size: 'half', source: source('nrg_bal_c', label(balance, 'siec', 'O4000XBIO')) })
    const sectors = bal('O4000XBIO', 'FC_E', useYear) ?? 0
    const perProduct = Object.entries(PRODUCT_SIEC).map(([siec, key]) => ({ name: t[key] as string, y: Math.round(Math.max(0, bal(siec, 'FC_E', useYear) ?? 0)) }))
    const other = Math.max(0, Math.round(sectors - perProduct.reduce((a, x) => a + x.y, 0)))
    const items = [...perProduct, { name: t.otherProducts, y: other }].filter((x) => x.y > 0).sort((a, b) => b.y - a.y)
    if (items.length > 2) widgets.push({ type: 'bar', title: `${t.cProducts} · ${useYear}`, subtitle: `${geoName} · ktoe`, categories: items.map((x) => x.name), series: [{ name: geoName, data: items.map((x) => x.y) }], horizontal: true, unit: 'ktoe', size: 'half', source: source('nrg_bal_c', label(balance, 'siec', 'O4000XBIO')) })
  }

  // ----- who supplied the crude in the last full year -----
  if (crude) {
    const ta = annual(total)
    const year = [...ta.keys()].sort().at(-1)
    if (year) {
      const list = CRUDE_PARTNERS.map((code) => {
        const a = annual(seriesOf(crude, (k) => k.partner === code))
        return { code, y: Math.round(a.get(year) ?? 0) }
      })
        .filter((x) => x.y > 0)
        .sort((a, b) => b.y - a.y)
      const rest = Math.round(ta.get(year)! - list.reduce((a, x) => a + x.y, 0))
      const rows = [...list.slice(0, 9).map((x) => ({ name: x.code === 'RU' ? t.russia : label(crude, 'partner', x.code).replace(/\s*\(.*?\)\s*$/, ''), y: x.y })), ...(rest > 0 ? [{ name: t.other, y: rest + list.slice(9).reduce((a, x) => a + x.y, 0) }] : [])]
      if (rows.length > 2) widgets.push({ type: 'bar', title: fill(t.cSuppliers, { year }), subtitle: `${geoName} · kt`, categories: rows.map((x) => x.name), series: [{ name: geoName, data: rows.map((x) => x.y) }], horizontal: true, unit: 'kt', size: 'half', source: source(DATASET, label(crude, 'siec', 'O4100_TOT')) })
    }
  }

  // ----- across countries: Russia's share before and after, dependency on the map -----
  if (russiaByCountry) {
    const yrs = [...new Set(russiaByCountry.observations.map((o) => o.keys.time))].sort()
    const first = yrs.includes('2021') ? '2021' : yrs[0]
    const last = yrs.at(-1)
    if (first && last && first !== last) {
      const rows = EU_MEMBERS.map((g) => ({
        g,
        a: russiaByCountry.observations.find((o) => o.keys.geo === g && o.keys.time === first)?.value ?? null,
        b: russiaByCountry.observations.find((o) => o.keys.geo === g && o.keys.time === last)?.value ?? null,
      }))
        .filter((r) => (r.a ?? 0) > 0.5 || (r.b ?? 0) > 0.5)
        .sort((x, y) => (y.a ?? 0) - (x.a ?? 0))
      if (rows.length > 3) widgets.push({ type: 'dumbbell', title: `${t.cRussiaCountries}: ${first} → ${last}`, subtitle: '%', categories: rows.map((r) => label(russiaByCountry, 'geo', r.g).replace(/\s*\(.*?\)\s*$/, '')), from: { name: first, data: rows.map((r) => (r.a == null ? null : Math.round(r.a * 10) / 10)) }, to: { name: last, data: rows.map((r) => (r.b == null ? null : Math.round(r.b * 10) / 10)) }, unit: '%', size: 'full', source: source('nrg_ind_idooil', label(russiaByCountry, 'partner', 'RU')) })
    }
  }
  if (dependency && depYear) {
    const data = EU_MEMBERS.map((g) => ({ code: g, name: label(dependency, 'geo', g).replace(/\s*\(.*?\)\s*$/, ''), value: dependency.observations.find((o) => o.keys.geo === g && o.keys.time === depYear)?.value ?? null }))
      .filter((d): d is { code: string; name: string; value: number } => d.value != null)
      .map((d) => ({ ...d, value: Math.round(d.value * 10) / 10 }))
    if (data.length >= 8) widgets.push({ type: 'map', title: fill(t.cMap, { year: depYear }), subtitle: '%', data, size: 'half', role: 'map' })
  }

  // ----- what stands out -----
  if (ruYear && ru21 != null && ruYear !== '2021') insights.push({ tone: 'down', parts: [fill(t.insRussia, { then: pct(ru21), y1: '2021', now: pct(ruAnnual.get(ruYear)!), y2: ruYear })] })
  if (peakMonth && priceNow != null && lastPriceMonth && peakMonth !== lastPriceMonth) {
    const d = (100 * (priceNow - price.get(peakMonth)!)) / price.get(peakMonth)!
    insights.push({ tone: d < 0 ? 'down' : 'up', parts: [fill(t.insPeak, { peak: nf(0).format(price.get(peakMonth)!), month: peakMonth, now: nf(0).format(priceNow), pct: pct(Math.abs(d)), dir: d < 0 ? t.below : t.above })] })
  }
  if (stockNow != null && stockAgo != null && stockAgo > 0) {
    const d = (100 * (stockNow - stockAgo)) / stockAgo
    insights.push({ tone: d < 0 ? 'down' : 'up', parts: [fill(t.insStocks, { pct: pct(Math.abs(d)), dir: d < 0 ? t.lower : t.higher })] })
  }
  if (coverNow != null) insights.push({ tone: coverNow >= 90 ? 'up' : 'down', parts: [fill(t.insCover, { days: nf(0).format(coverNow) })] })
  if (mixNow != null && mixYear && mixYears.length > 1) insights.push({ tone: 'down', parts: [fill(t.insShare, { pct: pct(mixNow), year: mixYear, then: pct(shareOfMix(mixYears[0])!), first: mixYears[0] })] })
  if (depNow != null && depYear) insights.push({ tone: 'down', parts: [fill(t.insDependency, { pct: pct(depNow), year: depYear })] })

  const summary: string[] =
    depNow != null && ruYear && ru21 != null && priceNow != null && lastPriceMonth
      ? [fill(t.summary, { geo: geoName, year: depYear ?? '', dep: pct(depNow), ru: pct(ruAnnual.get(ruYear)!), ruYear, ru21: pct(ru21), price: nf(0).format(priceNow), month: lastPriceMonth })]
      : []
  const title = withVersus(fill(t.title, { geo: geoName }), versusName, lang)
  summary.push(...comparisonSummary)
  const suggestions: Suggestion[] = []
  if (!compareGeo && !isEu) suggestions.push({ label: t.sugCompare, plan: { ...plan, oil: { ...plan.oil, compare: EU } } })
  if (!isEu) suggestions.push({ label: t.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: EU } } })
  else suggestions.push({ label: label(crude ?? balance, 'geo', 'DE') || 'Germany', plan: { ...plan, filters: { ...plan.filters, geo: 'DE' } } })
  suggestions.push({ label: s.sugExplain, explain: true })

  const { spec } = sanitizeSpec({
    ...(versusName ? { compareNames: [geoName, versusName] as [string, string] } : {}),
    title,
    subtitle: t.subtitle,
    summary,
    insights: insights.slice(0, 5),
    notes: [t.note, ...(coverNow != null ? [t.noteCover] : [])],
    widgets,
    layout: ['summary', 'notes', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'oil', kpiStyle: 'cards', controls: ['geo', 'compare'], primaryControls: 2, accent: 'orange' },
    source: source(DATASET, label(crude ?? products, 'siec', 'O4100_TOT')),
    suggestions,
    controls: { choices: [await compareChoice({ plan, dict, dataset: DATASET, lang, current: compareGeo, set: (c) => ({ ...plan, oil: c ? { ...plan.oil, compare: c } : {} }), t })] },
    context: [title, ...summary, ...kpis.map((k) => `${k.label}: ${k.value} ${k.unit ?? ''}`)].join('\n'),
    plan,
    shown: { geo: [geo] },
  })
  return spec
}
