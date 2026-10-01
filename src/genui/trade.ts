import { codeLabel, fetchEurostatData, loadEnergyCodelists, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { EU27, MONTH_NAMES } from './concepts'
import { planQuestion } from './planner'
import { detectGeos, detectTime, parse, requestedUnit, type Parsed } from './planner/parse'
import type { DashboardControls, DashboardSpec, Insight, KpiSpec, Plan, Suggestion, TradeFlow, TradeFuel, WidgetSpec } from './types'
import { NoDataError } from './execute'
import { sanitizeSpec } from './validate'

/**
 * Energy trade by partner, as Eurostat's energy trade visualisation (entrade,
 * https://ec.europa.eu/eurostat/cache/visualisations/energy-trade/entrade.html): one country's
 * imports or exports of one product by partner country, with the partners' ranking, shares,
 * their change on the previous year and the structure of the supply (concentration, turnover).
 * The datasets, products and units are entrade's (js/codes.js); the metrics its insights.
 */

/** The datasets of each fuel: imports (nrg_ti_*) and exports (nrg_te_*). */
const DATASETS: Record<TradeFuel, { imp: string; exp: string; siec: string; impM?: string; expM?: string }> = {
  gas: { imp: 'nrg_ti_gas', exp: 'nrg_te_gas', siec: 'G3000', impM: 'nrg_ti_gasm', expM: 'nrg_te_gasm' },
  solid: { imp: 'nrg_ti_sff', exp: 'nrg_te_sff', siec: 'C0000X0350-0370' },
  oil: { imp: 'nrg_ti_oil', exp: 'nrg_te_oil', siec: 'O4000', impM: 'nrg_ti_oilm', expM: 'nrg_te_oilm' },
  bio: { imp: 'nrg_ti_bio', exp: 'nrg_te_bio', siec: 'R5111' },
  electricity: { imp: 'nrg_ti_eh', exp: 'nrg_te_eh', siec: 'E7000' },
}
const DEFAULT_UNIT: Record<TradeFuel, string> = { gas: 'TJ_GCV', solid: 'THS_T', oil: 'THS_T', bio: 'THS_T', electricity: 'GWH' }
const UNIT_SYMBOL: Record<string, string> = { TJ_GCV: 'TJ (GCV)', MIO_M3: 'million m³', THS_T: 'thousand t', GWH: 'GWh', TJ: 'TJ' }

/** Partners below this value do not count as active (entrade's threshold). */
const PRESENT = 0.05
const TOP_BARS = 10
const TOP_SLICES = 5

/** The dataset of a trade view: the monthly one when the fuel has monthly data and months are asked for. */
export function datasetOf(trade: { flow: TradeFlow; fuel: TradeFuel; monthly?: true }): string {
  const d = DATASETS[trade.fuel]
  return trade.monthly ? ((trade.flow === 'imp' ? d.impM : d.expM) ?? d[trade.flow]) : d[trade.flow]
}
export const hasMonthly = (fuel: TradeFuel) => !!DATASETS[fuel].impM

export function tradeDataset(trade: { flow: TradeFlow; fuel: TradeFuel; monthly?: true }): string {
  return datasetOf(trade)
}

/** The same month a year before (or the year before, for a year). */
const yearBefore = (period: string) => (period.length > 4 ? `${Number(period.slice(0, 4)) - 1}${period.slice(4)}` : String(Number(period) - 1))

/** The fuel and flow of a trade dataset (nrg_ti_gas → gas imports), or null. */
export function tradeOf(dataset: string): { flow: TradeFlow; fuel: TradeFuel; monthly?: true } | null {
  for (const [fuel, d] of Object.entries(DATASETS) as [TradeFuel, (typeof DATASETS)[TradeFuel]][]) {
    if (d.imp === dataset) return { flow: 'imp', fuel }
    if (d.exp === dataset) return { flow: 'exp', fuel }
    if (d.impM === dataset) return { flow: 'imp', fuel, monthly: true }
    if (d.expM === dataset) return { flow: 'exp', fuel, monthly: true }
  }
  return null
}

// ---------- questions ----------

// A question about partners: "by partner (country)", "by (country of) origin", "where does X import
// gas from", "suppliers", "trade partners", "energy trade", in English, German and French.
const PARTNERS =
  / (by partners?( countries| country)?|by (country of )?origin|by destination|per partner|partner countr(y|ies)|trade partners?|trading partners?|suppliers?|supplying countries|where (does|do|did) .*(import|export|buy|get|come)|where .* (comes?|came) from|come from|comes from|energy trade|trade between|trade with|trade of|trade in|nach partner(land|landern)?|nach herkunft\w*|nach bestimmung\w*|handelspartner|lieferland|lieferlander|woher|herkunftsland\w*|energiehandel|par partenaire|par pays (partenaire|d origine|de destination)|par origine|par provenance|fournisseurs?|partenaires commerciaux|from whom|importers?|exporters?|importeurs?|exporteurs?|importeure?|who (supplies|sells|delivers|sends|exports)|who (do|does) .* (buy|get|import) .* from|(main|top|biggest|largest|major|key) (suppliers?|partners?|sources?|origins?|sellers?|exporters?)|main (gas|oil|coal|energy|electricity) (suppliers?|partners?|sources?)|\w*lieferant\w*|bezieht|beziehen|wer liefert|de qui .* (achete|importe|recoit)|qui (fournit|vend|livre)|d ou (viennent|vient|provient|proviennent)|commerce (de l energie|d energie|du gaz|du petrole|du charbon|de l electricite)) /
const IMPORT_EXPORT = /\b(imports?|exports?|einfuhr\w*|ausfuhr\w*|importations?|exportations?)\b/
const NOT_TRADE = /\b(balance|supply|transformation|consumption|stock|stocks|storage|price|prices|generation|production|bill|gross|net)\b/
const EXPORTS = /\b(export\w*|ausfuhr\w*|exportation\w*|exporte\w*)\b/
const FUEL_WORDS: [TradeFuel, RegExp][] = [
  ['electricity', / (electricity|power|heat|strom|elektrizitat|warme|electricite|chaleur) /],
  ['bio', / (biofuels?|biodiesel|biogasoline|wood pellets?|pellets|bioethanol|biokraftstoff\w*|holzpellets|biocarburants?|granules) /],
  ['oil', / (oil|petroleum|crude|diesel|gasoline|petrol|kerosene|jet fuel|lpg|naphtha|ol|erdol|rohol|mineralol\w*|benzin|petrole|brut|gazole|essence) /],
  ['solid', / (coal|lignite|coke|anthracite|peat|solid fossil|kohle|steinkohle|braunkohle|torf|charbon|houille|lignite|tourbe) /],
  ['gas', / (gas|natural gas|lng|erdgas|gaz|gaz naturel|gnl) /],
]

function fuelOf(p: Parsed): TradeFuel | undefined {
  return FUEL_WORDS.find(([, re]) => re.test(p.text))?.[0]
}

/**
 * The trade dashboard a question asks for ("imports of natural gas by partner country France
 * 2024", "where does Germany import oil from?", "energy trade of Italy"), or null. A question
 * naming one partner ("coal imports of Poland from Russia") stays with the planner: a trend.
 */
export function tradePlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  const p = parse(text.replace(/[-–,?]/g, ' '))
  const planned = planQuestion(text, dict, codelists)
  const byPartner = planned.kind === 'plan' && !!tradeOf(planned.plan.dataset) && Array.isArray(planned.plan.filters.partner)
  const time = detectTime(p)
  // "Imports: Natural gas, Germany, July 2025": imports or exports of gas or oil in a named month are the monthly trade by partner.
  const monthlyAsk = !!time.month && IMPORT_EXPORT.test(p.text) && !NOT_TRADE.test(p.text) && ['gas', 'oil'].includes(fuelOf(p) ?? '')
  // ("where does the energy come from and go" is the energy flow diagram)
  if (/ (come from and go|comes from and goes|come from and end up|from production to) /.test(p.text)) return null
  if (!byPartner && !PARTNERS.test(p.text) && !monthlyAsk) return null
  if (planned.kind === 'plan' && typeof planned.plan.filters.partner === 'string' && planned.plan.filters.partner !== 'TOTAL') return null
  const flow: TradeFlow = EXPORTS.test(p.text) ? 'exp' : 'imp'
  // The product the planner read ("crude oil" → O4100_TOT), when a trade dataset has it; without
  // the partner words the planner may not know ("crude oil suppliers" → "crude oil imports").
  const reread = planned.kind === 'plan' ? planned : planQuestion(`${p.text.replace(PARTNERS, ' ')} ${flow === 'exp' ? 'exports' : 'imports'}`, dict, codelists)
  const siecOf = reread.kind === 'plan' ? [reread.plan.filters.siec].flat()[0] : undefined
  const fromPlanner = (Object.keys(DATASETS) as TradeFuel[]).find((f) => siecOf && codesOf(dict, DATASETS[f][flow], 'siec').includes(siecOf))
  const fuel = fromPlanner ?? fuelOf(p) ?? 'gas'
  const places0 = detectGeos(p, codelists)
  const twoCountries = places0.codes.filter((c) => isCountry(c)).length >= 2
  const monthly = (time.month || time.monthly) && hasMonthly(fuel) && !twoCountries ? (true as const) : undefined
  const dataset = datasetOf({ flow, fuel, monthly })
  const ds = dict.datasets[dataset]
  if (!ds) return null
  const siec0 = fromPlanner && siecOf ? siecOf : DATASETS[fuel].siec
  const siec = codesOf(dict, dataset, 'siec').includes(siec0) ? siec0 : DATASETS[fuel].siec
  const places = places0
  const geos = codesOf(dict, dataset, 'geo')
  // Two countries asked for ("between Spain and Germany"): the trade between them.
  const named = places.codes.filter((c) => geos.includes(c) && isCountry(c))
  const geo = named.length >= 2 ? named.slice(0, 2) : (places.codes.find((c) => geos.includes(c)) ?? 'EU27_2020')
  const year = time.years.at(-1)
  const period = monthly ? (time.month ? `${time.month.year}-${String(time.month.month).padStart(2, '0')}` : undefined) : year ? String(year) : undefined
  return {
    dataset,
    filters: { geo, siec, unit: requestedUnit(p, ds) ?? DEFAULT_UNIT[fuel] },
    time: { kind: 'all' },
    ...(period ? { focusPeriod: period } : {}),
    intent: 'snapshot',
    trade: { flow, fuel, ...(monthly ? { monthly } : {}), ...(Array.isArray(geo) && !fromPlanner && !fuelOf(p) ? { auto: true as const } : {}) },
  }
}

/**
 * A follow-up to the trade dashboard on screen: another country, year, unit, flow or fuel ("and
 * Germany?", "2019", "exports", "oil"). Null when the message changes none of them.
 */
export function refineTrade(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.trade) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  const words = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|des|the|la|le|les|das|die|der|what|about|now|jetzt|maintenant|show|zeige|montre|between|zwischen|entre|with|mit|avec|trade|handel|commerce|monthly|yearly|annual|monatlich|mensuel\w*|annuel\w*|\d{4})$/.test(w) && !MONTH_NAMES[w])
  const places = detectGeos(p, codelists)
  const time = detectTime(p)
  const year = time.years.at(-1)
  const asksMonthly = time.month || time.monthly ? true : /\b(annual|yearly|per year|jahres\w*|annuel\w*)\b/.test(p.text) ? false : undefined
  const flow: TradeFlow | undefined = EXPORTS.test(p.text) ? 'exp' : /\b(import\w*|einfuhr\w*|importation\w*)\b/.test(p.text) ? 'imp' : undefined
  const fuel = fuelOf(p)
  const known = words.every((w) => EXPORTS.test(w) || /^(import\w*|einfuhr\w*|importation\w*|ktoe|gwh|tj|m3)$/.test(w) || fuelOf(parse(w)) || detectGeos(parse(w), codelists).codes.length || detectGeos(parse(w), codelists).eu)
  if (!known || !(places.codes.length || places.eu || year || flow || fuel || asksMonthly !== undefined)) return null
  const next = { flow: flow ?? current.trade.flow, fuel: fuel ?? current.trade.fuel }
  const monthly = (asksMonthly ?? !!current.trade.monthly) && hasMonthly(next.fuel) ? (true as const) : undefined
  const dataset = datasetOf({ ...next, monthly })
  const ds = dict.datasets[dataset]
  const geos = codesOf(dict, dataset, 'geo')
  const named = places.codes.filter((c) => geos.includes(c) && isCountry(c))
  const geo = named.length >= 2 ? named.slice(0, 2) : (places.codes.find((c) => geos.includes(c)) ?? (places.eu ? 'EU27_2020' : current.filters.geo))
  const sameFuel = next.fuel === current.trade.fuel
  const siec = sameFuel && codesOf(dict, dataset, 'siec').includes(String(current.filters.siec)) ? String(current.filters.siec) : DATASETS[next.fuel].siec
  const unit = requestedUnit(p, ds) ?? (ds.units.includes(String(current.filters.unit)) ? String(current.filters.unit) : DEFAULT_UNIT[next.fuel])
  // A month asked for, or the year asked for in the month on screen; a change between monthly and yearly starts from the latest period.
  const focusPeriod = time.month
    ? `${time.month.year}-${String(time.month.month).padStart(2, '0')}`
    : monthly
      ? year && current.focusPeriod?.length === 7
        ? `${year}${current.focusPeriod.slice(4)}`
        : current.trade.monthly
          ? current.focusPeriod
          : undefined
      : year
        ? String(year)
        : current.trade.monthly
          ? undefined
          : current.focusPeriod
  return { ...current, dataset, filters: { geo, siec, unit }, focusPeriod, trade: { ...next, ...(monthly ? { monthly } : {}) }, notes: [] }
}

const codesOf = (dict: EnergyDictionary, dataset: string, dim: string) => dict.datasets[dataset]?.dimensions.find((d) => d.id === dim)?.codes ?? []

// ---------- the dashboard ----------

export type TradeStrings = Strings['trade']

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')
const isCountry = (code: string) => /^[A-Z]{2}$/.test(code)

/** Partners' values in one year, largest first (countries only: aggregates such as "Other Asia" are left out of the ranking). */
function ranked(values: Map<string, Map<string, number | null>>, year: string) {
  const out: { code: string; value: number }[] = []
  for (const [code, byYear] of values) {
    const v = byYear.get(year)
    if (isCountry(code) && v != null && v > 0) out.push({ code, value: v })
  }
  return out.sort((a, b) => b.value - a.value)
}

/** Herfindahl-Hirschman index of shares in percent (0–10 000). */
const hhiOf = (shares: number[]) => Math.round(shares.reduce((sum, s) => sum + s * s, 0))

export async function buildTradeDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { trade: TradeStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const t = s.trade
  const trade = plan.trade!
  const between = ([] as string[]).concat(plan.filters.geo ?? []).filter(isCountry)
  // The trade between two countries is a yearly view: monthly data by partner are for one reporting country.
  if (trade.monthly && between.length >= 2) return buildTradeDashboard({ ...plan, dataset: DATASETS[trade.fuel][trade.flow], trade: { flow: trade.flow, fuel: trade.fuel }, focusPeriod: undefined }, dict, lang, s, signal)
  const dataset = datasetOf(trade)
  if (between.length >= 2) return buildBetweenDashboard(plan, between[0], between[1], dict, lang, s, signal)
  const geo = ([] as string[]).concat(plan.filters.geo ?? 'EU27_2020')[0]
  const unit = String(plan.filters.unit ?? DEFAULT_UNIT[trade.fuel])
  const siec = String(plan.filters.siec ?? DATASETS[trade.fuel].siec)
  const result = await fetchEurostatData(dataset, { filters: { geo, siec, unit }, lang, signal })

  // partner → year → value
  const values = new Map<string, Map<string, number | null>>()
  for (const o of result.observations) {
    const byYear = values.get(o.keys.partner) ?? new Map()
    byYear.set(o.keys.time, o.value)
    values.set(o.keys.partner, byYear)
  }
  const years = (result.dimensions.time?.codes ?? []).map((c) => c.code).sort()
  // The total is the partner countries' sum (as entrade): shares add up to 100 %, without the
  // quantities of unspecified origin that Eurostat's TOTAL also counts.
  const totalOf = (y: string) => ranked(values, y).reduce((sum, p) => sum + p.value, 0)
  const withData = years.filter((y) => totalOf(y) > 0)
  const year = plan.focusPeriod && withData.includes(plan.focusPeriod) ? plan.focusPeriod : withData.at(-1)
  const label = (dim: string, code: string) => result.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code
  const geoName = label('geo', geo).replace(/\s*\(.*?\)\s*$/, '')
  const product = label('siec', siec)
  const productLower = lang === 'de' ? product : product.charAt(0).toLowerCase() + product.slice(1)
  const flowWord = t.flowWords[trade.flow]
  const flowTitle = t.flows[trade.flow]
  const symbol = UNIT_SYMBOL[unit] ?? unit
  if (!year) throw new NoDataError(dataset)
  const prev = withData.includes(yearBefore(year)) ? yearBefore(year) : undefined

  const total = totalOf(year)
  const now = ranked(values, year)
  const before = prev ? ranked(values, prev) : []
  const prevTotal = prev ? totalOf(prev) : 0
  const shareOf = (v: number, of: number) => (of > 0 ? (100 * v) / of : 0)
  const rankBefore = new Map(before.map((p, i) => [p.code, i]))
  const shareBefore = new Map(before.map((p) => [p.code, shareOf(p.value, prevTotal)]))
  const name = (code: string) => label('partner', code).replace(/\s*\(.*?\)\s*$/, '')

  const decimals = total >= 1000 ? 0 : 1
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: decimals })
  const pct = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const fmtPct = (v: number) => `${pct.format(v)} %`.replace(/ %$/, lang === 'en' ? '%' : ' %')

  const rows = now.map((p, i) => ({
    name: name(p.code),
    value: p.value,
    share: shareOf(p.value, total),
    shareChange: prev && shareBefore.has(p.code) ? shareOf(p.value, total) - shareBefore.get(p.code)! : null,
    rankChange: prev && rankBefore.has(p.code) ? rankBefore.get(p.code)! - i : null,
    isNew: !!prev && !rankBefore.has(p.code),
  }))

  // Structure: concentration, diversification, EU / non-EU, turnover, history.
  const shares = rows.map((r) => r.share)
  const hhi = hhiOf(shares)
  const prevHhi = prev && before.length ? hhiOf(before.map((p) => shareOf(p.value, prevTotal))) : null
  const active = now.filter((p) => p.value >= PRESENT).length
  const top3 = shares.slice(0, 3).reduce((a, b) => a + b, 0)
  const nonEu = now.filter((p) => !EU27.includes(p.code)).reduce((sum, p) => sum + shareOf(p.value, total), 0)
  const changePct = prev && prevTotal > 0 ? (100 * (total - prevTotal)) / prevTotal : null

  // Summary: entrade's narrative.
  const summary: string[] = []
  if (rows.length >= 2) {
    summary.push(fill(t.lead, { geo: geoName, product: productLower, flow: flowWord, year, top: rows[0].name, share: fmtPct(rows[0].share), gap: pct.format(rows[0].share - rows[1].share), second: rows[1].name }))
    if (rows.length > 3) summary.push(fill(t.top3Sentence, { share: fmtPct(top3) }))
  } else if (rows.length === 1) summary.push(fill(t.leadOnly, { geo: geoName, product: productLower, flow: flowWord, year, top: rows[0].name, share: fmtPct(rows[0].share) }))
  if (changePct != null && prev) {
    summary.push(fill(t.change, { flow: flowWord, dir: changePct >= 0 ? t.rose : t.fell, pct: fmtPct(Math.abs(changePct)), prev }))
    if (prevHhi != null) summary.push(hhi > prevHhi ? t.concentration.up : hhi < prevHhi ? t.concentration.down : t.concentration.flat)
  }

  // Key figures.
  const kpis: KpiSpec[] = [
    { label: fill(t.total, { flow: flowWord }), value: total, unit: symbol, decimals, ...(changePct != null && prev ? { delta: changePct, deltaUnit: '%', deltaLabel: fill(t.vs, { year: prev }) } : {}), goodDirection: 'neutral', trend: withData.slice(-10).map(totalOf) },
    ...(rows[0] ? [{ label: fill(t.topPartner, { name: rows[0].name }), value: rows[0].share, unit: '%', decimals: 1, caption: t.shareOfTotal, goodDirection: 'neutral' as const }] : []),
    ...(rows.length > 3 ? [{ label: t.top3, value: top3, unit: '%', decimals: 1, goodDirection: 'neutral' as const }] : []),
    { label: t.active, value: active, decimals: 0, goodDirection: 'neutral' },
    ...(geo !== 'EU27_2020' || nonEu > 0 ? [{ label: t.nonEu, value: nonEu, unit: '%', decimals: 1, caption: t.shareOfTotal, goodDirection: 'neutral' as const }] : []),
    ...(hhi > 0 ? [{ label: t.diversity, value: 10000 / hhi, decimals: 1, caption: t.diversityCaption, goodDirection: 'neutral' as const }] : []),
  ]

  // Charts.
  const widgets: WidgetSpec[] = [{ type: 'kpis', items: kpis }]
  const top = rows.slice(0, TOP_BARS)
  const rest = total - top.reduce((sum, r) => sum + r.value, 0)
  widgets.push({
    type: 'bar',
    title: t.topPartners,
    subtitle: `${geoName}, ${year}`,
    categories: [...top.map((r) => r.name), ...(rest > 0.5 ? [t.others] : [])],
    series: [{ name: flowTitle, data: [...top.map((r) => r.value), ...(rest > 0.5 ? [rest] : [])] }],
    horizontal: true,
    unit: symbol,
    decimals,
    size: 'half',
    role: 'ranking',
  })
  const slices = rows.slice(0, TOP_SLICES).map((r) => ({ name: r.name, y: r.value }))
  const restSlices = total - slices.reduce((sum, x) => sum + x.y, 0)
  if (slices.length >= 2) {
    widgets.push({ type: 'pie', title: fill(t.shares, { flow: flowWord }), subtitle: `${geoName}, ${year}`, slices: [...slices, ...(restSlices > 0.5 ? [{ name: t.others, y: restSlices }] : [])], unit: symbol, size: 'half', role: 'composition' })
  }
  widgets.push({ type: 'partners', title: `${t.table}: ${geoName}, ${year}`, unit: symbol, decimals, rows })
  // Main partners over time: the five largest of the year shown.
  const main = rows.slice(0, TOP_SLICES).map((r, i) => ({ code: now[i].code, name: r.name }))
  if (main.length && withData.length > 1) {
    widgets.push({
      type: 'line',
      title: t.overTime,
      subtitle: geoName,
      categories: withData,
      series: main.map((m) => ({ name: m.name, data: withData.map((y) => values.get(m.code)?.get(y) ?? null) })),
      highlight: year,
      unit: symbol,
      size: 'half',
      role: 'evolution',
    })
    widgets.push({
      type: 'area',
      title: fill(t.history, { flow: flowWord }),
      subtitle: geoName,
      categories: withData,
      series: [{ name: fill(t.total, { flow: flowWord }), data: withData.map(totalOf) }],
      highlight: year,
      unit: symbol,
      size: 'half',
      role: 'headline',
    })
  }
  // How the shares moved: the year before and this year, for the largest partners.
  const moved = rows.slice(0, TOP_BARS).filter((r) => r.shareChange != null)
  if (prev && moved.length >= 3) {
    widgets.push({
      type: 'dumbbell',
      title: fill(t.shift, { prev, year }),
      subtitle: geoName,
      categories: moved.map((r) => r.name),
      from: { name: prev, data: moved.map((r) => r.share - (r.shareChange ?? 0)) },
      to: { name: year, data: moved.map((r) => r.share) },
      unit: '%',
      size: 'half',
      role: 'change',
    })
  }

  // Insights: structure and history.
  const insights: Insight[] = []
  if (hhi > 0) insights.push({ tone: 'neutral', parts: [fill(t.hhi, { hhi: nf.format(hhi), level: t.levels[hhi < 1500 ? 'low' : hhi < 2500 ? 'moderate' : 'high'] })] })
  const peakYear = withData.reduce((best, y) => (totalOf(y) > totalOf(best) ? y : best), withData[0])
  if (peakYear === year) insights.push({ tone: 'record', parts: [fill(t.peakNow, { year, peak: `${nf.format(totalOf(peakYear))} ${symbol}` })] })
  else insights.push({ tone: 'down', parts: [fill(t.peak, { peakYear, peak: `${nf.format(totalOf(peakYear))} ${symbol}`, year, pct: fmtPct(100 * (1 - total / totalOf(peakYear))) })] })
  const last5 = withData.filter((y) => y < year).slice(-5)
  if (last5.length === 5 && !trade.monthly) {
    const avg = last5.reduce((sum, y) => sum + totalOf(y), 0) / 5
    const diff = (100 * (total - avg)) / avg
    insights.push({ tone: diff >= 0 ? 'up' : 'down', parts: [fill(t.average, { from: last5[0], to: last5[4], year, pct: `${diff >= 0 ? '+' : '−'}${fmtPct(Math.abs(diff))}` })] })
  }
  if (prev) {
    const gone = before.filter((p) => !now.some((q) => q.code === p.code)).length
    insights.push({ tone: 'neutral', parts: [fill(t.turnover, { prev, new: String(rows.filter((r) => r.isNew).length), gone: String(gone) })] })
  }
  if (rows[0]) {
    let streak = 0
    for (let i = withData.indexOf(year); i >= 0 && ranked(values, withData[i])[0]?.code === now[0].code; i--) streak++
    if (streak >= 2) insights.push({ tone: 'record', parts: [fill(t.streak, { top: rows[0].name, n: String(streak) })] })
  }

  const title = fill(t.title, { flow: flowTitle, product: productLower, geo: geoName, year })
  const { spec } = sanitizeSpec({
    title,
    subtitle: `${t.fuels[trade.fuel]} · ${symbol}`,
    summary,
    insights,
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'trade', kpiStyle: 'cards', controls: ['geo', 'year', 'period', 'flow', 'fuel', 'product', 'unit'], primaryControls: 4, accent: 'teal' },
    unit: symbol,
    source: { code: dataset, title: result.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=${lang}` },
    suggestions: tradeSuggestions(plan, s),
    controls: await tradeControls(plan, dict, withData, year, t, lang),
    context: [title, ...summary, ...rows.slice(0, 15).map((r, i) => `${i + 1}. ${r.name}: ${nf.format(r.value)} ${symbol} (${fmtPct(r.share)})`)].join('\n'),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: [geo] },
  })
  return spec
}

/**
 * Trade between two countries ("show energy trade between Spain and Germany for 2022"): what each
 * imports from the other (the import datasets' partner breakdown, both ways), the net flow, and how
 * much each one's imports depend on the other.
 */
async function buildBetweenDashboard(
  plan: Plan,
  a: string,
  b: string,
  dict: EnergyDictionary,
  lang: string,
  s: { trade: TradeStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  // A fuel named: that fuel. Otherwise every fuel the two trade, for the latest year with trade
  // (or the year asked for), the one they depend on each other for most in detail.
  if (!plan.trade?.auto) return buildBetween(plan, a, b, dict, lang, s, signal)
  const fuels = ['electricity', 'gas', 'oil', 'solid', 'bio'] as TradeFuel[]
  const loaded = await Promise.all(
    fuels.map(async (fuel) => {
      try {
        const result = await fetchEurostatData(DATASETS[fuel].imp, { filters: { geo: [a, b], siec: DATASETS[fuel].siec, unit: DEFAULT_UNIT[fuel] }, lang, signal })
        return { fuel, ...readBetween(result, a, b) }
      } catch {
        return null
      }
    }),
  )
  const found = loaded.filter((x): x is NonNullable<typeof x> => !!x && x.years.length > 0)
  const allYears = [...new Set(found.flatMap((x) => x.years))].sort()
  if (!allYears.length) throw new NoDataError(DATASETS[plan.trade.fuel].imp)
  const year = plan.focusPeriod && allYears.includes(plan.focusPeriod) ? plan.focusPeriod : allYears.at(-1)!
  const rows = found
    .map((x) => {
      const totalA = x.partnersOf(a, year).reduce((sum, p) => sum + p.value, 0)
      const totalB = x.partnersOf(b, year).reduce((sum, p) => sum + p.value, 0)
      const ab = x.flowOf(a, b, year)
      const ba = x.flowOf(b, a, year)
      return { fuel: x.fuel, ab, ba, shareAB: totalA > 0 ? (100 * ab) / totalA : 0, shareBA: totalB > 0 ? (100 * ba) / totalB : 0, label: x.label }
    })
    .filter((r) => r.ab > 0 || r.ba > 0)
  const main = rows.reduce((best, r) => (r.shareAB + r.shareBA > best.shareAB + best.shareBA ? r : best), rows[0])
  const next: Plan = { ...plan, dataset: DATASETS[main.fuel].imp, filters: { ...plan.filters, siec: DATASETS[main.fuel].siec, unit: DEFAULT_UNIT[main.fuel] }, focusPeriod: year, trade: { flow: 'imp', fuel: main.fuel } }
  return buildBetween(next, a, b, dict, lang, s, signal, { rows, asked: plan.focusPeriod })
}

/** What a trade dataset says about two countries: each one's imports from every partner. */
function readBetween(result: EurostatResult, a: string, b: string) {
  // reporter → partner → year → value
  const byGeo = new Map<string, Map<string, Map<string, number | null>>>()
  for (const o of result.observations) {
    const partners = byGeo.get(o.keys.geo) ?? new Map()
    const byYear = partners.get(o.keys.partner) ?? new Map()
    byYear.set(o.keys.time, o.value)
    partners.set(o.keys.partner, byYear)
    byGeo.set(o.keys.geo, partners)
  }
  const flowOf = (from: string, to: string, y: string) => byGeo.get(from)?.get(to)?.get(y) ?? 0
  const partnersOf = (geo: string, y: string) =>
    [...(byGeo.get(geo)?.entries() ?? [])]
      .filter(([code]) => isCountry(code) && code !== geo)
      .map(([code, byYear]) => ({ code, value: byYear.get(y) ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((x, y2) => y2.value - x.value)
  const years = (result.dimensions.time?.codes ?? []).map((c) => c.code).sort().filter((y) => flowOf(a, b, y) > 0 || flowOf(b, a, y) > 0)
  const label = result.dimensions.siec?.codes[0]?.label ?? ''
  return { flowOf, partnersOf, years, label }
}

async function buildBetween(
  plan: Plan,
  a: string,
  b: string,
  dict: EnergyDictionary,
  lang: string,
  s: { trade: TradeStrings; sugExplain: string },
  signal?: AbortSignal,
  /** No fuel named: every fuel they trade (in the year), and the year asked for. */
  overview?: { rows: { fuel: TradeFuel; ab: number; ba: number; shareAB: number; shareBA: number; label: string }[]; asked?: string },
): Promise<DashboardSpec> {
  const t = s.trade
  const w = t.between
  const trade = plan.trade!
  const dataset = DATASETS[trade.fuel].imp
  const unit = String(plan.filters.unit ?? DEFAULT_UNIT[trade.fuel])
  const siec = String(plan.filters.siec ?? DATASETS[trade.fuel].siec)
  const result = await fetchEurostatData(dataset, { filters: { geo: [a, b], siec, unit }, lang, signal })

  const { flowOf, partnersOf, years: withData } = readBetween(result, a, b)
  if (!withData.length) throw new NoDataError(dataset)
  const year = plan.focusPeriod && withData.includes(plan.focusPeriod) ? plan.focusPeriod : withData.at(-1)!
  const label = (dim: string, code: string) => result.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code
  const nameA = label('geo', a).replace(/\s*\(.*?\)\s*$/, '')
  const nameB = label('geo', b).replace(/\s*\(.*?\)\s*$/, '')
  const product = label('siec', siec)
  const productLower = lang === 'de' ? product : product.charAt(0).toLowerCase() + product.slice(1)
  const symbol = UNIT_SYMBOL[unit] ?? unit
  const fuel = t.fuels[trade.fuel]

  const ab = flowOf(a, b, year)
  const ba = flowOf(b, a, year)
  const peakOf = (y: string) => flowOf(a, b, y) + flowOf(b, a, y)
  const biggest = Math.max(ab, ba)
  const decimals = biggest >= 1000 ? 0 : biggest >= 10 ? 1 : 2
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: decimals })
  const pct = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const fmtPct = (v: number) => `${pct.format(v)}${lang === 'en' ? '%' : ' %'}`
  const fmt = (v: number) => `${nf.format(v)} ${symbol}`
  const nf2 = (v: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: v >= 1000 ? 0 : v >= 10 ? 1 : 2 }).format(v)

  // Each country's imports from every partner, for the year: totals, ranks and top sources.
  const nowA = partnersOf(a, year)
  const nowB = partnersOf(b, year)
  const totalA = nowA.reduce((sum, x) => sum + x.value, 0)
  const totalB = nowB.reduce((sum, x) => sum + x.value, 0)
  const share = (v: number, of: number) => (of > 0 ? (100 * v) / of : 0)
  const prev = withData.includes(String(Number(year) - 1)) ? String(Number(year) - 1) : undefined
  const delta = (now: number, before: number) => (before > 0 ? (100 * (now - before)) / before : undefined)

  const kpis: KpiSpec[] = [
    { label: fill(w.from, { a: nameA, b: nameB }), value: ab, unit: symbol, decimals, ...(prev && delta(ab, flowOf(a, b, prev)) != null ? { delta: delta(ab, flowOf(a, b, prev)), deltaUnit: '%', deltaLabel: fill(t.vs, { year: prev }) } : {}), goodDirection: 'neutral', trend: withData.slice(-10).map((y) => flowOf(a, b, y)) },
    { label: fill(w.from, { a: nameB, b: nameA }), value: ba, unit: symbol, decimals, ...(prev && delta(ba, flowOf(b, a, prev)) != null ? { delta: delta(ba, flowOf(b, a, prev)), deltaUnit: '%', deltaLabel: fill(t.vs, { year: prev }) } : {}), goodDirection: 'neutral', trend: withData.slice(-10).map((y) => flowOf(b, a, y)) },
    { label: fill(w.net, { a: ab >= ba ? nameA : nameB }), value: Math.abs(ab - ba), unit: symbol, decimals, caption: fill(w.netCaption, ab >= ba ? { a: nameA, b: nameB } : { a: nameB, b: nameA }), goodDirection: 'neutral' },
    { label: fill(w.inShare, { a: nameA, b: nameB }), value: share(ab, totalA), unit: '%', decimals: 1, goodDirection: 'neutral' },
    { label: fill(w.inShare, { a: nameB, b: nameA }), value: share(ba, totalB), unit: '%', decimals: 1, goodDirection: 'neutral' },
  ]

  const widgets: WidgetSpec[] = [{ type: 'kpis', items: kpis }]
  // No fuel named: how much each depends on the other for every fuel they trade. Shares of each
  // one's own imports, so fuels with different units (TJ, thousand t, GWh) compare.
  if (overview && overview.rows.length > 1) {
    widgets.push({
      type: 'bar',
      title: w.byFuel,
      subtitle: `${nameA} ↔ ${nameB}, ${year}`,
      categories: overview.rows.map((r) => t.fuels[r.fuel]),
      series: [
        { name: fill(w.inShare, { a: nameA, b: nameB }), data: overview.rows.map((r) => r.shareAB) },
        { name: fill(w.inShare, { a: nameB, b: nameA }), data: overview.rows.map((r) => r.shareBA) },
      ],
      horizontal: true,
      unit: '%',
      decimals: 1,
      size: 'full',
      role: 'composition',
    })
  }
  widgets.push({
    type: 'bar',
    title: fill(w.overTime, { a: nameA, b: nameB }),
    subtitle: `${fuel} · ${symbol}`,
    categories: withData,
    series: [
      { name: fill(w.from, { a: nameA, b: nameB }), data: withData.map((y) => flowOf(a, b, y)) },
      { name: fill(w.from, { a: nameB, b: nameA }), data: withData.map((y) => flowOf(b, a, y)) },
    ],
    unit: symbol,
    decimals,
    size: 'full',
    role: 'evolution',
  })
  for (const [geoName, now, total] of [[nameA, nowA, totalA], [nameB, nowB, totalB]] as const) {
    const top = now.slice(0, TOP_BARS)
    if (top.length < 2) continue
    widgets.push({
      type: 'bar',
      title: fill(w.sources, { a: geoName }),
      subtitle: `${fuel}, ${year}`,
      categories: top.map((x) => label('partner', x.code).replace(/\s*\(.*?\)\s*$/, '')),
      series: [{ name: geoName, data: top.map((x) => x.value) }],
      horizontal: true,
      unit: symbol,
      decimals: total >= 1000 ? 0 : 1,
      size: 'half',
      role: 'ranking',
    })
  }
  if (withData.length > 1) {
    const totalAt = (geo: string, y: string) => partnersOf(geo, y).reduce((sum, x) => sum + x.value, 0)
    widgets.push({
      type: 'line',
      title: w.shareTime,
      subtitle: fuel,
      categories: withData,
      series: [
        { name: fill(w.inShare, { a: nameA, b: nameB }), data: withData.map((y) => (totalAt(a, y) > 0 ? share(flowOf(a, b, y), totalAt(a, y)) : null)) },
        { name: fill(w.inShare, { a: nameB, b: nameA }), data: withData.map((y) => (totalAt(b, y) > 0 ? share(flowOf(b, a, y), totalAt(b, y)) : null)) },
      ],
      highlight: year,
      unit: '%',
      size: 'full',
      role: 'change',
    })
  }

  const summary = [ab + ba > 0 ? fill(w.lead, { year, a: nameA, b: nameB, product: productLower, ab: fmt(ab), ba: fmt(ba), x: ab >= ba ? nameA : nameB }) : fill(w.leadNone, { product: productLower, a: nameA, b: nameB, year })]
  const insights: Insight[] = []
  for (const [geoName, other, now, total] of [[nameA, nameB, nowA, totalA], [nameB, nameA, nowB, totalB]] as const) {
    const otherCode = other === nameB ? b : a
    const n = now.findIndex((x) => x.code === otherCode) + 1
    if (n > 0) insights.push({ tone: 'neutral', parts: [fill(w.rank, { b: other, a: geoName, n: String(n), product: productLower, share: fmtPct(share(now[n - 1].value, total)) })] })
  }
  if (overview && overview.rows.length > 1) {
    const list = overview.rows.map((r) => `${t.fuels[r.fuel]} (${nameA} ← ${nameB} ${nf2(r.ab)} ${UNIT_SYMBOL[DEFAULT_UNIT[r.fuel]] ?? ''}, ${nameB} ← ${nameA} ${nf2(r.ba)} ${UNIT_SYMBOL[DEFAULT_UNIT[r.fuel]] ?? ''})`).join('; ')
    insights.unshift({ tone: 'neutral', parts: [fill(w.fuelsList, { year, list })] })
  }
  const peakYear = withData.reduce((best, y) => (peakOf(y) > peakOf(best) ? y : best), withData[0])
  if (withData.length > 2) insights.push({ tone: 'record', parts: [fill(w.peak, { peakYear, peak: fmt(peakOf(peakYear)) })] })

  const title = fill(w.title, { fuel, a: nameA, b: nameB, year })
  const { spec } = sanitizeSpec({
    title,
    subtitle: `${productLower} · ${symbol}`,
    summary,
    insights,
    notes: (overview?.asked ?? plan.focusPeriod) && (overview?.asked ?? plan.focusPeriod) !== year ? [fill(w.yearFallback, { asked: String(overview?.asked ?? plan.focusPeriod), year, a: nameA, b: nameB })] : [],
    widgets,
    layout: ['summary', 'notes', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'trade', kpiStyle: 'cards', controls: ['geo', 'year', 'fuel', 'product', 'unit'], primaryControls: 4, accent: 'teal' },
    unit: symbol,
    source: { code: dataset, title: result.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=${lang}` },
    suggestions: [
      { label: fill(w.focus, { geo: nameA }), plan: { ...plan, filters: { ...plan.filters, geo: a } } },
      { label: fill(w.focus, { geo: nameB }), plan: { ...plan, filters: { ...plan.filters, geo: b } } },
      { label: s.sugExplain, explain: true },
    ],
    controls: await tradeControls({ ...plan, dataset }, dict, withData, year, t, lang),
    context: [title, ...summary, ...insights.map((i) => i.parts.join(''))].join('\n'),
    plan: { ...plan, dataset, focusPeriod: year, trade: { flow: 'imp', fuel: trade.fuel } },
    shown: { geo: [a, b] },
  })
  return spec
}

async function tradeControls(
  plan: Plan,
  dict: EnergyDictionary,
  years: string[],
  year: string,
  t: TradeStrings,
  lang: string,
): Promise<DashboardControls> {
  const trade = plan.trade!
  const at = (next: { flow: TradeFlow; fuel: TradeFuel }): Plan => {
    const monthly = trade.monthly && hasMonthly(next.fuel) ? (true as const) : undefined
    const dataset = datasetOf({ ...next, monthly })
    const ds = dict.datasets[dataset]
    const sameFuel = next.fuel === trade.fuel
    const unit = ds.units.includes(String(plan.filters.unit)) ? String(plan.filters.unit) : DEFAULT_UNIT[next.fuel]
    const siec = sameFuel ? String(plan.filters.siec) : DATASETS[next.fuel].siec
    const geos = codesOf(dict, dataset, 'geo')
    const kept = ([] as string[]).concat(plan.filters.geo ?? []).filter((g) => geos.includes(g))
    return { ...plan, dataset, filters: { geo: kept.length > 1 ? kept.slice(0, 2) : (kept[0] ?? 'EU27_2020'), siec, unit }, trade: { ...next, ...(monthly ? { monthly } : {}) } }
  }
  // Yearly or monthly (gas and oil have monthly data): from the latest period of the other kind.
  const periodPlan = (monthly: boolean): Plan => {
    const dataset = datasetOf({ flow: trade.flow, fuel: trade.fuel, ...(monthly ? { monthly: true as const } : {}) })
    const ds = dict.datasets[dataset]
    const unit = ds.units.includes(String(plan.filters.unit)) ? String(plan.filters.unit) : DEFAULT_UNIT[trade.fuel]
    const siec = codesOf(dict, dataset, 'siec').includes(String(plan.filters.siec)) ? String(plan.filters.siec) : DATASETS[trade.fuel].siec
    return { ...plan, dataset, filters: { ...plan.filters, siec, unit }, focusPeriod: undefined, trade: { flow: trade.flow, fuel: trade.fuel, ...(monthly ? { monthly: true as const } : {}) } }
  }
  const ds = dict.datasets[plan.dataset]
  const siecNames = codesOf(dict, plan.dataset, 'siec')
  // Local codelists: the product dropdown lists every product the dataset offers, not only the
  // one just fetched (the API response only carries labels for the codes in the query).
  const codelists: EnergyCodelists = await loadEnergyCodelists()
  const siecCodelist = ds.dimensions.find((d) => d.id === 'siec')?.codelist ?? null
  const siecLabel = (code: string) => codeLabel(codelists, siecCodelist, code, lang)
  return {
    years: [...years].reverse().slice(0, 15).map((y) => ({ label: y, plan: { ...plan, focusPeriod: y }, active: y === year })),
    units: ds.units.map((u) => ({ label: UNIT_SYMBOL[u] ?? u, plan: { ...plan, filters: { ...plan.filters, unit: u } }, active: plan.filters.unit === u })),
    choices: [
      ...(hasMonthly(trade.fuel) && ([] as string[]).concat(plan.filters.geo ?? []).filter(isCountry).length < 2
        ? [{ key: 'period', label: t.period, options: [{ label: t.yearly, plan: periodPlan(false), active: !trade.monthly }, { label: t.monthlyData, plan: periodPlan(true), active: !!trade.monthly }] }]
        : []),
      // Both directions are shown for two countries: no flow to choose.
      ...(([] as string[]).concat(plan.filters.geo ?? []).filter(isCountry).length >= 2 ? [] : [{ key: 'flow', label: t.flow, options: (['imp', 'exp'] as TradeFlow[]).map((f) => ({ label: t.flows[f], plan: at({ flow: f, fuel: trade.fuel }), active: trade.flow === f })) }]),
      { key: 'fuel', label: t.fuel, options: (Object.keys(DATASETS) as TradeFuel[]).map((f) => ({ label: t.fuels[f], plan: at({ flow: trade.flow, fuel: f }), active: trade.fuel === f })) },
      {
        key: 'product',
        label: t.product,
        options: siecNames.map((code) => ({ label: siecLabel(code), plan: { ...plan, filters: { ...plan.filters, siec: code } }, active: plan.filters.siec === code })),
      },
    ],
  }
}

function tradeSuggestions(plan: Plan, s: { trade: TradeStrings; sugExplain: string }): Suggestion[] {
  const trade = plan.trade!
  const other: TradeFlow = trade.flow === 'imp' ? 'exp' : 'imp'
  const out: Suggestion[] = [
    { label: fill(s.trade.sugOther, { flow: s.trade.flowWords[other] }), plan: { ...plan, dataset: datasetOf({ flow: other, fuel: trade.fuel, monthly: trade.monthly }), trade: { ...trade, flow: other } } },
  ]
  if (plan.filters.geo !== 'EU27_2020') out.push({ label: s.trade.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: 'EU27_2020' } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
