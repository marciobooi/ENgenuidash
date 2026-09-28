import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import type { Strings } from '../i18n'
import { EU27 } from './concepts'
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
const DATASETS: Record<TradeFuel, { imp: string; exp: string; siec: string }> = {
  gas: { imp: 'nrg_ti_gas', exp: 'nrg_te_gas', siec: 'G3000' },
  solid: { imp: 'nrg_ti_sff', exp: 'nrg_te_sff', siec: 'C0000X0350-0370' },
  oil: { imp: 'nrg_ti_oil', exp: 'nrg_te_oil', siec: 'O4000' },
  bio: { imp: 'nrg_ti_bio', exp: 'nrg_te_bio', siec: 'R5111' },
  electricity: { imp: 'nrg_ti_eh', exp: 'nrg_te_eh', siec: 'E7000' },
}
const DEFAULT_UNIT: Record<TradeFuel, string> = { gas: 'TJ_GCV', solid: 'THS_T', oil: 'THS_T', bio: 'THS_T', electricity: 'GWH' }
const UNIT_SYMBOL: Record<string, string> = { TJ_GCV: 'TJ (GCV)', MIO_M3: 'million m³', THS_T: 'thousand t', GWH: 'GWh', TJ: 'TJ' }

/** Partners below this value do not count as active (entrade's threshold). */
const PRESENT = 0.05
const TOP_BARS = 10
const TOP_SLICES = 5

export function tradeDataset(trade: { flow: TradeFlow; fuel: TradeFuel }): string {
  return DATASETS[trade.fuel][trade.flow]
}

/** The fuel and flow of a trade dataset (nrg_ti_gas → gas imports), or null. */
export function tradeOf(dataset: string): { flow: TradeFlow; fuel: TradeFuel } | null {
  for (const [fuel, d] of Object.entries(DATASETS) as [TradeFuel, (typeof DATASETS)[TradeFuel]][]) {
    if (d.imp === dataset) return { flow: 'imp', fuel }
    if (d.exp === dataset) return { flow: 'exp', fuel }
  }
  return null
}

// ---------- questions ----------

// A question about partners: "by partner (country)", "by (country of) origin", "where does X import
// gas from", "suppliers", "trade partners", "energy trade", in English, German and French.
const PARTNERS =
  / (by partners?( countries| country)?|by (country of )?origin|by destination|per partner|partner countr(y|ies)|trade partners?|trading partners?|suppliers?|supplying countries|where (does|do|did) .*(import|export|buy|get|come)|where .* (comes?|came) from|come from|comes from|energy trade|trade of|trade in|nach partner(land|landern)?|nach herkunft\w*|nach bestimmung\w*|handelspartner|lieferland|lieferlander|woher|herkunftsland\w*|energiehandel|par partenaire|par pays (partenaire|d origine|de destination)|par origine|par provenance|fournisseurs?|partenaires commerciaux|d ou (viennent|vient|provient|proviennent)|commerce (de l energie|d energie|du gaz|du petrole|du charbon|de l electricite)) /
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
  if (!byPartner && !PARTNERS.test(p.text)) return null
  if (planned.kind === 'plan' && typeof planned.plan.filters.partner === 'string') return null
  const flow: TradeFlow = EXPORTS.test(p.text) ? 'exp' : 'imp'
  // The product the planner read ("crude oil" → O4100_TOT), when a trade dataset has it; without
  // the partner words the planner may not know ("crude oil suppliers" → "crude oil imports").
  const reread = planned.kind === 'plan' ? planned : planQuestion(`${p.text.replace(PARTNERS, ' ')} ${flow === 'exp' ? 'exports' : 'imports'}`, dict, codelists)
  const siecOf = reread.kind === 'plan' ? [reread.plan.filters.siec].flat()[0] : undefined
  const fromPlanner = (Object.keys(DATASETS) as TradeFuel[]).find((f) => siecOf && codesOf(dict, DATASETS[f][flow], 'siec').includes(siecOf))
  const fuel = fromPlanner ?? fuelOf(p) ?? 'gas'
  const dataset = DATASETS[fuel][flow]
  const ds = dict.datasets[dataset]
  if (!ds) return null
  const siec = fromPlanner && siecOf ? siecOf : DATASETS[fuel].siec
  const places = detectGeos(p, codelists)
  const geos = codesOf(dict, dataset, 'geo')
  const geo = places.codes.find((c) => geos.includes(c)) ?? 'EU27_2020'
  const year = detectTime(p).years.at(-1)
  return {
    dataset,
    filters: { geo, siec, unit: requestedUnit(p, ds) ?? DEFAULT_UNIT[fuel] },
    time: { kind: 'all' },
    ...(year ? { focusPeriod: String(year) } : {}),
    intent: 'snapshot',
    trade: { flow, fuel },
  }
}

/**
 * A follow-up to the trade dashboard on screen: another country, year, unit, flow or fuel ("and
 * Germany?", "2019", "exports", "oil"). Null when the message changes none of them.
 */
export function refineTrade(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.trade) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  const words = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|des|the|la|le|les|das|die|der|what|about|now|jetzt|maintenant|show|zeige|montre|\d{4})$/.test(w))
  const places = detectGeos(p, codelists)
  const year = detectTime(p).years.at(-1)
  const flow: TradeFlow | undefined = EXPORTS.test(p.text) ? 'exp' : /\b(import\w*|einfuhr\w*|importation\w*)\b/.test(p.text) ? 'imp' : undefined
  const fuel = fuelOf(p)
  const known = words.every((w) => EXPORTS.test(w) || /^(import\w*|einfuhr\w*|importation\w*|ktoe|gwh|tj|m3)$/.test(w) || fuelOf(parse(w)) || detectGeos(parse(w), codelists).codes.length || detectGeos(parse(w), codelists).eu)
  if (!known || !(places.codes.length || places.eu || year || flow || fuel)) return null
  const next = { flow: flow ?? current.trade.flow, fuel: fuel ?? current.trade.fuel }
  const dataset = DATASETS[next.fuel][next.flow]
  const ds = dict.datasets[dataset]
  const geos = codesOf(dict, dataset, 'geo')
  const geo = places.codes.find((c) => geos.includes(c)) ?? (places.eu ? 'EU27_2020' : String(current.filters.geo))
  const sameFuel = next.fuel === current.trade.fuel
  const siec = sameFuel && codesOf(dict, dataset, 'siec').includes(String(current.filters.siec)) ? String(current.filters.siec) : DATASETS[next.fuel].siec
  const unit = requestedUnit(p, ds) ?? (ds.units.includes(String(current.filters.unit)) ? String(current.filters.unit) : DEFAULT_UNIT[next.fuel])
  return { ...current, dataset, filters: { geo, siec, unit }, ...(year ? { focusPeriod: String(year) } : {}), trade: next, notes: [] }
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
  const dataset = DATASETS[trade.fuel][trade.flow]
  const geo = String(plan.filters.geo ?? 'EU27_2020')
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
  const prev = withData.includes(String(Number(year) - 1)) ? String(Number(year) - 1) : undefined

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
  if (last5.length === 5) {
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
    presentation: { template: 'trade', kpiStyle: 'cards', controls: ['geo', 'year', 'flow', 'fuel', 'product', 'unit'], primaryControls: 4, accent: 'teal' },
    unit: symbol,
    source: { code: dataset, title: result.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=${lang}` },
    suggestions: tradeSuggestions(plan, s),
    controls: tradeControls(plan, dict, withData, year, t, (code) => label('siec', code)),
    context: [title, ...summary, ...rows.slice(0, 15).map((r, i) => `${i + 1}. ${r.name}: ${nf.format(r.value)} ${symbol} (${fmtPct(r.share)})`)].join('\n'),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: [geo] },
  })
  return spec
}

function tradeControls(
  plan: Plan,
  dict: EnergyDictionary,
  years: string[],
  year: string,
  t: TradeStrings,
  siecLabel: (code: string) => string,
): DashboardControls {
  const trade = plan.trade!
  const at = (next: { flow: TradeFlow; fuel: TradeFuel }): Plan => {
    const dataset = DATASETS[next.fuel][next.flow]
    const ds = dict.datasets[dataset]
    const sameFuel = next.fuel === trade.fuel
    const unit = ds.units.includes(String(plan.filters.unit)) ? String(plan.filters.unit) : DEFAULT_UNIT[next.fuel]
    const siec = sameFuel ? String(plan.filters.siec) : DATASETS[next.fuel].siec
    const geos = codesOf(dict, dataset, 'geo')
    return { ...plan, dataset, filters: { geo: geos.includes(String(plan.filters.geo)) ? plan.filters.geo : 'EU27_2020', siec, unit }, trade: next }
  }
  const ds = dict.datasets[plan.dataset]
  const siecNames = codesOf(dict, plan.dataset, 'siec')
  return {
    years: [...years].reverse().slice(0, 15).map((y) => ({ label: y, plan: { ...plan, focusPeriod: y }, active: y === year })),
    units: ds.units.map((u) => ({ label: UNIT_SYMBOL[u] ?? u, plan: { ...plan, filters: { ...plan.filters, unit: u } }, active: plan.filters.unit === u })),
    choices: [
      { key: 'flow', label: t.flow, options: (['imp', 'exp'] as TradeFlow[]).map((f) => ({ label: t.flows[f], plan: at({ flow: f, fuel: trade.fuel }), active: trade.flow === f })) },
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
    { label: fill(s.trade.sugOther, { flow: s.trade.flowWords[other] }), plan: { ...plan, dataset: DATASETS[trade.fuel][other], trade: { ...trade, flow: other } } },
  ]
  if (plan.filters.geo !== 'EU27_2020') out.push({ label: s.trade.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: 'EU27_2020' } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
