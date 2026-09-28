import { codeLabel, fetchEurostatData, loadEnergyCodelists, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import { INDUSTRY_WORDS } from './concepts'
import { NoDataError } from './execute'
import { isCurrentBand } from './filters'
import { any, detectGeos, detectTime, parse, requestedUnit, type Parsed } from './planner/parse'
import type { DashboardControls, DashboardSpec, Insight, KpiSpec, Plan, PriceConsumer, PriceProduct, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * Energy price structure, as Eurostat's energy prices visualisation (enprices,
 * https://ec.europa.eu/eurostat/cache/visualisations/energy-prices/enprices.html): one product's
 * price for one type of consumer, decomposed into its components (energy & supply, network costs,
 * taxes and VAT), compared across countries and consumption bands, and over time.
 *
 * The components dataset (nrg_pc_20{2,3,4,5}_c) reports each component separately; the split that
 * sums back to the published total is the app's existing one (companions.ts, "what the price is
 * made of"): energy & supply + network costs + other taxes and levies (the TAX_FEE_LEV_CHRG
 * aggregate, minus VAT and its allowance) + VAT. This module reuses it so both agree.
 */

const DATASETS: Record<PriceProduct, Record<PriceConsumer, string>> = {
  gas: { household: 'nrg_pc_202_c', nonHousehold: 'nrg_pc_203_c' },
  electricity: { household: 'nrg_pc_204_c', nonHousehold: 'nrg_pc_205_c' },
}
// The base (non-component) dataset of the same product/consumer, so a plain price dashboard can
// be told apart and switched to its components (see priceDatasetOf/toComponents below).
const BASE_DATASETS: Record<PriceProduct, Record<PriceConsumer, string>> = {
  gas: { household: 'nrg_pc_202', nonHousehold: 'nrg_pc_203' },
  electricity: { household: 'nrg_pc_204', nonHousehold: 'nrg_pc_205' },
}
// Matches companions.ts's PRICE_PARTS: the aggregate (TAX_FEE_LEV_CHRG) and its allowance, not the
// itemised sub-taxes (renewable, capacity, environmental, nuclear) — those already sum into it.
const PARTS = ['NRG_SUP', 'NETC', 'TAX_FEE_LEV_CHRG', 'VAT', 'TAX_FEE_LEV_CHRG_ALLOW']
const isCountry = (code: string) => /^[A-Z]{2}$/.test(code)
// Short unit symbols (gas components have a unit dimension - KWH, GJ_GCV, MWH; electricity's does
// not, and always prices per kWh): the codelist's own label is the long form ("Kilowatt-hour").
const UNIT_SYMBOL: Record<string, string> = { KWH: 'kWh', MWH: 'MWh', GJ_GCV: 'GJ (GCV)' }

// ---------- questions ----------

const STRUCTURE =
  / (price components?|price breakdown|breakdown of the (gas|electricity|energy) price|composition of the (gas|electricity|energy) price|what (does|is|are) the (gas|electricity|energy) prices? (consist|made) (of|up of)|what makes up the (gas|electricity|energy) price|network costs? and taxes|taxes and (vat|levies)( in| of)? the (gas|electricity) price|taxes make up|compare (gas|electricity) prices? by (component|tax)|price structure|preiszusammensetzung|preisbestandteile|woraus (setzt sich|besteht) der (gas|strom)preis|netzkosten und steuern|steuern (machen|bilden) den grossten anteil|composition du prix|elements? du prix|de quoi (se compose|est compose) le prix|couts? de reseau et taxes|structure du prix|taxes representent la plus grande part) /
// A follow-up asking for the same dashboard, decomposed: "now in components", "add all taxes",
// "with components", "show components" (its "show" is stripped by prepareQuestion's lead-ins,
// leaving bare "components"), "as components", "add the tax breakdown".
const TO_COMPONENTS =
  /^ (now )?((in|with|as|show( me)?|add( all)?( the)?) )?(components?|(all )?(the )?taxe?s?( breakdown| components)?|(the )?(price )?(breakdown|composition|components)) ?$/
const GAS = / (gas|gaz|erdgas)( |$)/

function productOf(p: Parsed): PriceProduct {
  return GAS.test(p.text) ? 'gas' : 'electricity'
}
function consumerOf(p: Parsed): PriceConsumer {
  return any(p, INDUSTRY_WORDS) ? 'nonHousehold' : 'household'
}

/** The product/consumer of a price dataset (base or components), or null. */
export function priceDatasetOf(dataset: string): { product: PriceProduct; consumer: PriceConsumer; components: boolean } | null {
  for (const [product, byConsumer] of Object.entries(DATASETS) as [PriceProduct, Record<PriceConsumer, string>][]) {
    for (const [consumer, ds] of Object.entries(byConsumer) as [PriceConsumer, string][]) {
      if (ds === dataset) return { product, consumer, components: true }
    }
  }
  for (const [product, byConsumer] of Object.entries(BASE_DATASETS) as [PriceProduct, Record<PriceConsumer, string>][]) {
    for (const [consumer, ds] of Object.entries(byConsumer) as [PriceConsumer, string][]) {
      if (ds === dataset) return { product, consumer, components: false }
    }
  }
  return null
}

/**
 * The price-structure dashboard a question asks for ("price breakdown of German electricity",
 * "what does the gas price consist of in France?", "network costs and taxes in Italy"), or null.
 */
export function pricesPlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  const p = parse(text.replace(/[-–,?]/g, ' '))
  if (!STRUCTURE.test(p.text)) return null
  const product = productOf(p)
  const consumer = consumerOf(p)
  const dataset = DATASETS[product][consumer]
  const ds = dict.datasets[dataset]
  if (!ds) return null
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => ds.dimensions.find((d) => d.id === 'geo')?.codes.includes(c)) ?? 'EU27_2020'
  const year = detectTime(p).years.at(-1)
  const band = ds.dimensions.find((d) => d.id === 'nrg_cons')?.codes.find((c) => c === ds.defaults.nrg_cons && isCurrentBand(c)) ?? ds.defaults.nrg_cons ?? ''
  return {
    dataset,
    filters: { geo, nrg_cons: band, currency: requestedUnit(p, ds) === 'PPS' ? 'PPS' : 'EUR', ...(ds.dimensions.some((d) => d.id === 'unit') ? { unit: ds.defaults.unit ?? 'KWH' } : {}) },
    time: { kind: 'all' },
    ...(year ? { focusPeriod: String(year) } : {}),
    intent: 'snapshot',
    prices: { product, consumer },
  }
}

/**
 * "Now in components" / "add all taxes" for the plain price dashboard on screen (nrg_pc_20X, not
 * yet decomposed): the same country, year and consumption band, in the components dataset.
 */
export function toComponentsPlan(current: Plan, text: string, dict: EnergyDictionary): Plan | null {
  if (current.prices) return null
  const info = priceDatasetOf(current.dataset)
  if (!info || info.components) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  if (!TO_COMPONENTS.test(p.text)) return null
  const dataset = DATASETS[info.product][info.consumer]
  const ds = dict.datasets[dataset]
  if (!ds) return null
  const geos = ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const bandCodes = ds.dimensions.find((d) => d.id === 'nrg_cons')?.codes ?? []
  const currentGeo = Array.isArray(current.filters.geo) ? current.filters.geo[0] : current.filters.geo
  const currentBand = Array.isArray(current.filters.nrg_cons) ? current.filters.nrg_cons[0] : current.filters.nrg_cons
  const geo = geos.includes(String(currentGeo)) ? String(currentGeo) : 'EU27_2020'
  const nrg_cons = bandCodes.includes(String(currentBand)) ? String(currentBand) : (ds.defaults.nrg_cons ?? '')
  return {
    dataset,
    filters: { geo, nrg_cons, currency: 'EUR', ...(ds.dimensions.some((d) => d.id === 'unit') ? { unit: ds.defaults.unit ?? 'KWH' } : {}) },
    time: { kind: 'all' },
    ...(current.focusPeriod ? { focusPeriod: current.focusPeriod } : {}),
    intent: 'snapshot',
    prices: { product: info.product, consumer: info.consumer },
  }
}

/** A follow-up to the price dashboard on screen: another country, year, product or consumer type. */
export function refinePrices(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.prices) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  const words = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|des|the|la|le|les|das|die|der|what|about|now|jetzt|maintenant|show|zeige|montre|price|preis|prix|\d{4})$/.test(w))
  const places = detectGeos(p, codelists)
  const year = detectTime(p).years.at(-1)
  const mentionsGas = GAS.test(p.text)
  const mentionsElectricity = /\b(electricity|strom|electricite)\b/.test(p.text)
  const mentionsConsumer = any(p, INDUSTRY_WORDS) || /\b(household|haushalt|menage)s?\b/.test(p.text)
  const known = words.every((w) => GAS.test(` ${w} `) || /^(electricity|strom|electricite|household|haushalt|menage|industr\w*|business|non-household)s?$/.test(w) || detectGeos(parse(w), codelists).codes.length || detectGeos(parse(w), codelists).eu)
  if (!known || !(places.codes.length || places.eu || year || mentionsGas || mentionsElectricity || mentionsConsumer)) return null
  const next = { product: mentionsGas ? 'gas' : mentionsElectricity ? 'electricity' : current.prices.product, consumer: mentionsConsumer ? consumerOf(p) : current.prices.consumer } as { product: PriceProduct; consumer: PriceConsumer }
  const dataset = DATASETS[next.product][next.consumer]
  const ds = dict.datasets[dataset]
  const geos = ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const geo = places.codes.find((c) => geos.includes(c)) ?? (places.eu ? 'EU27_2020' : String(current.filters.geo))
  const sameDataset = dataset === current.dataset
  const bandCodes = ds.dimensions.find((d) => d.id === 'nrg_cons')?.codes ?? []
  const nrg_cons = sameDataset && bandCodes.includes(String(current.filters.nrg_cons)) ? current.filters.nrg_cons : (ds.defaults.nrg_cons ?? '')
  return {
    ...current,
    dataset,
    filters: { geo, nrg_cons, currency: current.filters.currency ?? 'EUR', ...(ds.dimensions.some((d) => d.id === 'unit') ? { unit: sameDataset ? current.filters.unit : (ds.defaults.unit ?? 'KWH') } : {}) },
    ...(year ? { focusPeriod: String(year) } : {}),
    prices: next,
    notes: [],
  }
}

// ---------- the dashboard ----------

export interface PricesStrings {
  title: string
  product: string
  consumer: string
  products: Record<PriceProduct, string>
  consumers: Record<PriceConsumer, string>
  band: string
  euAverage: string
  highest: string
  lowest: string
  taxShare: string
  networkShare: string
  countries: string
  shares: string
  structure: string
  byBand: string
  mainOverTime: string
  history: string
  map: string
  onScreen: string
  asShares: string
  lead: string
  change: string
  rose: string
  fell: string
  highestTax: string
  lowestTax: string
  peak: string
  peakNow: string
  bandEffect: string
  less: string
  more: string
  sugOther: string
  sugConsumer: string
  sugEu: string
  sugComponents: string
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')

export async function buildPricesDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { prices: PricesStrings; sugExplain: string; companions: { otherTaxes: string } },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  // Local codelists (not the fetched result's dimension labels, which only cover the codes just
  // queried): needed for the toolbar's band dropdown, whose options go beyond that one query.
  const codelists = await loadEnergyCodelists()
  const t = s.prices
  const otherTaxesLabel = s.companions.otherTaxes
  const prices = plan.prices!
  const dataset = DATASETS[prices.product][prices.consumer]
  const ds = dict.datasets[dataset]
  const geo = String(plan.filters.geo ?? 'EU27_2020')
  const band = String(plan.filters.nrg_cons ?? ds.defaults.nrg_cons ?? '')
  const currency = String(plan.filters.currency ?? 'EUR')
  const unit = plan.filters.unit ? String(plan.filters.unit) : undefined
  const baseFilters: Record<string, string> = { currency, ...(unit ? { unit } : {}) }

  // Every country, this band and year: the country comparison and the year the data is for.
  const byCountry = await fetchEurostatData(dataset, { filters: { ...baseFilters, nrg_cons: band, nrg_prc: PARTS }, lang, signal })
  const years = (byCountry.dimensions.time?.codes ?? []).map((c) => c.code).sort()
  const label = (dim: string, code: string, from: EurostatResult = byCountry) => from.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code
  const geoLabel = (code: string) => label('geo', code).replace(/\s*\(.*?\)\s*$/, '')
  const withData = years.filter((y) => byCountry.observations.some((o) => o.keys.time === y && o.keys.nrg_prc === 'NRG_SUP' && o.value != null))
  const year = plan.focusPeriod && withData.includes(plan.focusPeriod) ? plan.focusPeriod : withData.at(-1)
  if (!year) throw new NoDataError(dataset)
  const prev = withData.includes(String(Number(year) - 1)) ? String(Number(year) - 1) : undefined

  const partsAt = (result: EurostatResult, filter: (o: EurostatResult['observations'][number]) => boolean, otherLabel: string) => {
    const v = (code: string) => result.observations.find((o) => filter(o) && o.keys.nrg_prc === code)?.value
    const nrgSup = v('NRG_SUP')
    const netc = v('NETC')
    const taxes = v('TAX_FEE_LEV_CHRG')
    const vat = v('VAT')
    if (nrgSup == null || netc == null || taxes == null || vat == null) return null
    const allow = v('TAX_FEE_LEV_CHRG_ALLOW') ?? 0
    const otherTaxes = Math.round((taxes - vat - allow) * 10000) / 10000
    return [
      { code: 'NRG_SUP', name: label('nrg_prc', 'NRG_SUP', result), value: nrgSup },
      { code: 'NETC', name: label('nrg_prc', 'NETC', result), value: netc },
      { code: 'OTHER_TAX', name: otherLabel, value: otherTaxes },
      { code: 'VAT', name: label('nrg_prc', 'VAT', result), value: vat },
    ]
  }
  const totalOf = (parts: ReturnType<typeof partsAt>) => (parts ? parts.reduce((sum, x) => sum + x.value, 0) : null)

  // Countries ranked by total price (real countries only; EU/EA are references, not ranked).
  const countries = (byCountry.dimensions.geo?.codes ?? []).filter((c) => isCountry(c.code))
  const ranked = countries
    .map((c) => ({ code: c.code, name: geoLabel(c.code), parts: partsAt(byCountry, (o) => o.keys.geo === c.code && o.keys.time === year, otherTaxesLabel) }))
    .filter((c): c is typeof c & { parts: NonNullable<typeof c.parts> } => !!c.parts)
    .map((c) => ({ ...c, total: totalOf(c.parts)! }))
    .sort((a, b) => b.total - a.total)
  if (!ranked.length) throw new NoDataError(dataset)

  const euParts = partsAt(byCountry, (o) => o.keys.geo === 'EU27_2020' && o.keys.time === year, otherTaxesLabel)
  const euTotal = totalOf(euParts)
  const symbol = `${currency}/${unit ? (UNIT_SYMBOL[unit] ?? label('unit', unit)) : 'kWh'}`
  const decimals = 3
  const nf = new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const pct = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const fmtPct = (v: number) => `${pct.format(v)}${lang === 'en' ? '%' : ' %'}`
  const geoName = geoLabel(geo)
  const productName = t.products[prices.product]
  const consumerName = t.consumers[prices.consumer].toLowerCase()
  const shareOf = (parts: NonNullable<ReturnType<typeof partsAt>>, code: string) => {
    const total = totalOf(parts) ?? 0
    return total > 0 ? (100 * (parts.find((x) => x.code === code)?.value ?? 0)) / total : 0
  }

  const focus = ranked.find((r) => r.code === geo) ?? (geo === 'EU27_2020' && euParts ? { code: 'EU27_2020', name: geoName, parts: euParts, total: euTotal! } : ranked[0])
  const focusPrev = prev ? partsAt(byCountry, (o) => o.keys.geo === focus.code && o.keys.time === prev, otherTaxesLabel) : null
  const focusPrevTotal = focusPrev ? totalOf(focusPrev) : null
  const changePct = focusPrevTotal ? (100 * (focus.total - focusPrevTotal)) / focusPrevTotal : null

  // A subsidy year can push a component (and so a share) negative or past 100%, e.g. the
  // Netherlands' capped energy price in 2022-2023: not a meaningful "highest/lowest tax" headline.
  const taxShareOf = (r: (typeof ranked)[number]) => shareOf(r.parts, 'OTHER_TAX') + shareOf(r.parts, 'VAT')
  const highestTaxShare = ranked.filter((r) => taxShareOf(r) >= 0 && taxShareOf(r) <= 100).sort((a, b) => taxShareOf(b) - taxShareOf(a))
  const highest = ranked[0]
  const lowest = ranked[ranked.length - 1]

  // Key figures.
  const kpis: KpiSpec[] = [
    ...(euTotal != null ? [{ label: t.euAverage, value: euTotal, unit: symbol, decimals, goodDirection: 'neutral' as const }] : []),
    { label: fill(t.highest, { name: highest.name }), value: highest.total, unit: symbol, decimals, goodDirection: 'neutral' },
    { label: fill(t.lowest, { name: lowest.name }), value: lowest.total, unit: symbol, decimals, goodDirection: 'neutral' },
    ...(euParts ? [{ label: t.taxShare, value: shareOf(euParts, 'OTHER_TAX') + shareOf(euParts, 'VAT'), unit: '%', decimals: 1, goodDirection: 'neutral' as const }] : []),
    ...(euParts ? [{ label: t.networkShare, value: shareOf(euParts, 'NETC'), unit: '%', decimals: 1, goodDirection: 'neutral' as const }] : []),
  ]

  // Charts: country comparison (values, then shares), the focus country's own split, the band
  // effect (non-decomposed, the "auxiliary" view), main countries over time and the focus
  // country's components over time, and the map.
  const widgets: WidgetSpec[] = [{ type: 'kpis', items: kpis }]
  const top = ranked.slice(0, 15)
  const seriesOf = (rows: typeof ranked) => ['NRG_SUP', 'NETC', 'OTHER_TAX', 'VAT'].map((code) => ({ name: rows[0]?.parts.find((x) => x.code === code)?.name ?? code, data: rows.map((r) => r.parts.find((x) => x.code === code)?.value ?? 0) }))
  widgets.push({
    type: 'bar',
    title: t.countries,
    subtitle: `${productName} · ${consumerName} · ${year}`,
    categories: top.map((r) => r.name),
    series: seriesOf(top),
    horizontal: true,
    stacked: true,
    unit: symbol,
    decimals,
    ...(euTotal != null ? { reference: { value: euTotal, label: 'EU-27' } } : {}),
    size: 'full',
    role: 'ranking',
  })
  widgets.push({
    type: 'bar',
    title: t.shares,
    subtitle: `${productName} · ${consumerName} · ${year}`,
    categories: top.map((r) => r.name),
    series: seriesOf(top),
    horizontal: true,
    stacked: 'percent',
    size: 'half',
    role: 'composition',
  })
  const focusSlices = focus.parts.filter((x) => x.value > 0).map((x) => ({ name: x.name, y: x.value }))
  if (focusSlices.length >= 2) {
    widgets.push({ type: 'pie', title: fill(t.structure, { geo: focus.name, year }), slices: focusSlices, unit: symbol, centerLabel: nf.format(focus.total), size: 'half', role: 'change' })
  }

  // The band effect: this country's total price at every (current) consumption band, non-decomposed.
  const bandDim = ds.dimensions.find((d) => d.id === 'nrg_cons')
  const currentBands = bandDim ? bandDim.codes.filter(isCurrentBand) : []
  if (currentBands.length > 2) {
    const byBand = await fetchEurostatData(dataset, { filters: { ...baseFilters, geo: focus.code, nrg_prc: PARTS }, sinceTimePeriod: year, untilTimePeriod: year, lang, signal }).catch(() => null)
    if (byBand) {
      const bandTotals = currentBands
        .map((code) => ({ code, label: label('nrg_cons', code, byBand), total: totalOf(partsAt(byBand, (o) => o.keys.nrg_cons === code, otherTaxesLabel)) }))
        .filter((b): b is { code: string; label: string; total: number } => b.total != null)
      if (bandTotals.length > 2) {
        widgets.push({
          type: 'bar',
          title: t.byBand,
          subtitle: `${focus.name}, ${year}`,
          categories: bandTotals.map((b) => b.label),
          series: [{ name: t.byBand, data: bandTotals.map((b) => b.total) }],
          horizontal: true,
          unit: symbol,
          decimals,
          size: 'half',
          role: 'detail',
        })
      }
    }
  }

  // Main countries and the focus country's components over time.
  const mainCodes = ranked.slice(0, 5).map((r) => r.code)
  if (withData.length > 1) {
    const overTime = await fetchEurostatData(dataset, { filters: { ...baseFilters, nrg_cons: band, geo: mainCodes, nrg_prc: PARTS }, lang, signal }).catch(() => null)
    if (overTime) {
      const totalAt = (geoCode: string, y: string) => totalOf(partsAt(overTime, (o) => o.keys.geo === geoCode && o.keys.time === y, otherTaxesLabel))
      widgets.push({
        type: 'line',
        title: t.mainOverTime,
        subtitle: `${productName} · ${consumerName}`,
        categories: withData,
        series: mainCodes.map((code) => ({ name: geoLabel(code), data: withData.map((y) => totalAt(code, y)) })).filter((series) => series.data.some((v) => v != null)),
        highlight: year,
        unit: symbol,
        size: 'half',
        role: 'evolution',
      })
    }
    const focusOverTime = await fetchEurostatData(dataset, { filters: { ...baseFilters, nrg_cons: band, geo: focus.code, nrg_prc: PARTS }, lang, signal }).catch(() => null)
    if (focusOverTime) {
      const focusYears = (focusOverTime.dimensions.time?.codes ?? []).map((c) => c.code).filter((y) => partsAt(focusOverTime, (o) => o.keys.time === y, otherTaxesLabel))
      if (focusYears.length > 2) {
        const names = focus.parts.map((x) => x.name)
        widgets.push({
          type: 'area',
          title: fill(t.history, { geo: focus.name }),
          subtitle: `${productName} · ${consumerName}`,
          categories: focusYears,
          series: names.map((name, i) => ({ name, data: focusYears.map((y) => partsAt(focusOverTime, (o) => o.keys.time === y, otherTaxesLabel)?.[i]?.value ?? null) })),
          stacked: true,
          highlight: year,
          unit: symbol,
          size: 'half',
          role: 'headline',
        })
      }
    }
  }

  // Map: total price by country.
  const mapData = ranked.filter((r) => /^[A-Z]{2}$/.test(r.code)).map((r) => ({ code: r.code, name: r.name, value: r.total }))
  if (mapData.length >= 3) widgets.push({ type: 'map', title: t.map, subtitle: `${productName} · ${consumerName} · ${year}`, data: mapData, size: 'full' })

  // Summary and insights.
  const summary: string[] = []
  if (euTotal != null) summary.push(fill(t.lead, { product: productName.toLowerCase(), consumer: consumerName, year, value: `${nf.format(euTotal)} ${symbol}`, top: highest.name, topValue: `${nf.format(highest.total)} ${symbol}`, bottom: lowest.name, bottomValue: `${nf.format(lowest.total)} ${symbol}` }))
  if (changePct != null && prev) summary.push(fill(t.change, { geo: focus.name, dir: changePct >= 0 ? t.rose : t.fell, pct: fmtPct(Math.abs(changePct)), prev }))

  const insights: Insight[] = []
  const taxTop = highestTaxShare[0]
  const taxBottom = highestTaxShare[highestTaxShare.length - 1]
  if (taxTop) insights.push({ tone: 'up', parts: [fill(t.highestTax, { name: taxTop.name, share: fmtPct(shareOf(taxTop.parts, 'OTHER_TAX') + shareOf(taxTop.parts, 'VAT')) })] })
  if (taxBottom && taxBottom.code !== taxTop?.code) insights.push({ tone: 'down', parts: [fill(t.lowestTax, { name: taxBottom.name, share: fmtPct(shareOf(taxBottom.parts, 'OTHER_TAX') + shareOf(taxBottom.parts, 'VAT')) })] })
  const focusHistory = withData.map((y) => ({ y, total: totalOf(partsAt(byCountry, (o) => o.keys.geo === focus.code && o.keys.time === y, otherTaxesLabel)) })).filter((x): x is { y: string; total: number } => x.total != null)
  if (focusHistory.length > 1) {
    const peak = focusHistory.reduce((best, x) => (x.total > best.total ? x : best), focusHistory[0])
    if (peak.y === year) insights.push({ tone: 'record', parts: [fill(t.peakNow, { geo: focus.name, year, peak: `${nf.format(peak.total)} ${symbol}` })] })
    else insights.push({ tone: 'down', parts: [fill(t.peak, { geo: focus.name, peakYear: peak.y, peak: `${nf.format(peak.total)} ${symbol}`, year, pct: fmtPct(100 * (1 - focus.total / peak.total)) })] })
  }

  const title = fill(t.title, { product: productName, consumer: consumerName, geo: geoName, year })
  const { spec } = sanitizeSpec({
    title,
    subtitle: band ? label('nrg_cons', band) : '',
    summary,
    insights,
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'prices', kpiStyle: 'cards', controls: ['geo', 'product', 'consumer', 'band', 'currency', 'year'], primaryControls: 4, accent: 'orange' },
    unit: symbol,
    source: { code: dataset, title: byCountry.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=${lang}` },
    suggestions: pricesSuggestions(plan, s),
    controls: pricesControls(plan, dict, codelists, lang, withData, year, t),
    context: [title, ...summary, ...ranked.slice(0, 15).map((r, i) => `${i + 1}. ${r.name}: ${nf.format(r.total)} ${symbol}`)].join('\n'),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: [geo] },
  })
  return spec
}

function pricesControls(plan: Plan, dict: EnergyDictionary, codelists: EnergyCodelists, lang: string, years: string[], year: string, t: PricesStrings): DashboardControls {
  const prices = plan.prices!
  const ds = dict.datasets[plan.dataset]
  const bandDim = ds.dimensions.find((d) => d.id === 'nrg_cons')
  const currentBands = bandDim ? bandDim.codes.filter(isCurrentBand) : []
  const bandLabel = (code: string) => codeLabel(codelists, bandDim?.codelist ?? null, code, lang)
  const at = (next: { product: PriceProduct; consumer: PriceConsumer }): Plan => {
    const dataset = DATASETS[next.product][next.consumer]
    const nextDs = dict.datasets[dataset]
    const geos = nextDs.dimensions.find((d) => d.id === 'geo')?.codes ?? []
    return { ...plan, dataset, filters: { geo: geos.includes(String(plan.filters.geo)) ? plan.filters.geo : 'EU27_2020', nrg_cons: nextDs.defaults.nrg_cons ?? '', currency: plan.filters.currency ?? 'EUR', ...(nextDs.dimensions.some((d) => d.id === 'unit') ? { unit: nextDs.defaults.unit ?? 'KWH' } : {}) }, prices: next }
  }
  return {
    years: [...years].reverse().slice(0, 15).map((y) => ({ label: y, plan: { ...plan, focusPeriod: y }, active: y === year })),
    choices: [
      { key: 'product', label: t.product, options: (['electricity', 'gas'] as PriceProduct[]).map((product) => ({ label: t.products[product], plan: at({ product, consumer: prices.consumer }), active: prices.product === product })) },
      { key: 'consumer', label: t.consumer, options: (['household', 'nonHousehold'] as PriceConsumer[]).map((consumer) => ({ label: t.consumers[consumer], plan: at({ product: prices.product, consumer }), active: prices.consumer === consumer })) },
      ...(currentBands.length > 1 ? [{ key: 'band', label: t.band, options: currentBands.map((code) => ({ label: bandLabel(code), plan: { ...plan, filters: { ...plan.filters, nrg_cons: code } }, active: plan.filters.nrg_cons === code })) }] : []),
    ],
  }
}

function pricesSuggestions(plan: Plan, s: { prices: PricesStrings; sugExplain: string }): Suggestion[] {
  const prices = plan.prices!
  const other: PriceProduct = prices.product === 'gas' ? 'electricity' : 'gas'
  const otherConsumer: PriceConsumer = prices.consumer === 'household' ? 'nonHousehold' : 'household'
  const out: Suggestion[] = [
    { label: fill(s.prices.sugOther, { product: s.prices.products[other] }), plan: { ...plan, dataset: DATASETS[other][prices.consumer], prices: { ...prices, product: other } } },
    { label: fill(s.prices.sugConsumer, { consumer: s.prices.consumers[otherConsumer].toLowerCase() }), plan: { ...plan, dataset: DATASETS[prices.product][otherConsumer], prices: { ...prices, consumer: otherConsumer } } },
  ]
  if (plan.filters.geo !== 'EU27_2020') out.push({ label: s.prices.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: 'EU27_2020' } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
