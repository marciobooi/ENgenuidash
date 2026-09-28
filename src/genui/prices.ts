import { codeLabel, fetchEurostatData, loadEnergyCodelists, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import { INDUSTRY_WORDS } from './concepts'
import { NoDataError } from './execute'
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
// The "taxes" view (enprices without components) reads the base dataset's three tax levels and
// splits them, as the original enprices did: net price = X_TAX, other taxes = X_VAT - X_TAX,
// VAT and other recoverable taxes = I_TAX - X_VAT; they sum back to I_TAX.
const TAXES = ['X_TAX', 'X_VAT', 'I_TAX']
// Consumption bands each dataset offers, as the original enprices (js/codes.js, codesDataset):
// the components datasets start at "all bands" (TOT_), their default; the aggregates Eurostat
// adds (GJ_LE3999999, MWH_LE149999) are not offered. Electricity non-household's "all bands" is
// TOT_KWH in the API (TOT_MWH in codes.js).
const BANDS: Record<string, string[]> = {
  nrg_pc_202_c: ['TOT_GJ', 'GJ_LT20', 'GJ20-199', 'GJ_GE200'],
  nrg_pc_202: ['TOT_GJ', 'GJ_LT20', 'GJ20-199', 'GJ_GE200'],
  nrg_pc_203_c: ['TOT_GJ', 'GJ_LT1000', 'GJ1000-9999', 'GJ10000-99999', 'GJ100000-999999', 'GJ1000000-3999999', 'GJ_GE4000000'],
  nrg_pc_203: ['TOT_GJ', 'GJ_LT1000', 'GJ1000-9999', 'GJ10000-99999', 'GJ100000-999999', 'GJ1000000-3999999', 'GJ_GE4000000'],
  nrg_pc_204_c: ['TOT_KWH', 'KWH_LT1000', 'KWH1000-2499', 'KWH2500-4999', 'KWH5000-14999', 'KWH_LE15000'],
  nrg_pc_204: ['KWH_LT1000', 'KWH1000-2499', 'KWH2500-4999', 'KWH5000-14999', 'KWH_GE15000'],
  nrg_pc_205_c: ['TOT_KWH', 'MWH_LT20', 'MWH20-499', 'MWH500-1999', 'MWH2000-19999', 'MWH20000-69999', 'MWH70000-149999', 'MWH_GE150000'],
  nrg_pc_205: ['TOT_KWH', 'MWH_LT20', 'MWH20-499', 'MWH500-1999', 'MWH2000-19999', 'MWH20000-69999', 'MWH70000-149999', 'MWH_GE150000'],
}
/** The consumption bands a price dataset offers (null for other datasets). */
export const priceBands = (dataset: string): string[] | null => BANDS[dataset] ?? null
const defaultBand = (dataset: string, dict: EnergyDictionary) => (dataset.endsWith('_c') ? BANDS[dataset][0] : (dict.datasets[dataset].defaults.nrg_cons ?? BANDS[dataset][0]))
// The itemised taxes (codes.js's nrg_prc lists) with their allowances; with VAT they sum into
// TAX_FEE_LEV_CHRG (minus TAX_FEE_LEV_CHRG_ALLOW). "Other" last: it takes any remainder.
const TAX_ITEMS = [['TAX_RNW', 'TAX_RNW_ALLOW'], ['TAX_CAP', 'TAX_CAP_ALLOW'], ['TAX_ENV', 'TAX_ENV_ALLOW'], ['TAX_NUC', 'TAX_NUC_ALLOW'], ['OTH', 'ALLOW_OTH']]
/** The countries of a selection a dataset has (one code, or several), else the EU. */
function keepGeos(value: string | string[] | undefined, codes: string[]): string | string[] {
  const kept = ([] as string[]).concat(value ?? []).filter((c) => codes.includes(c))
  return kept.length > 1 ? kept : (kept[0] ?? 'EU27_2020')
}
type PriceView = { product: PriceProduct; consumer: PriceConsumer; view?: 'taxes' }
const datasetFor = (p: PriceView) => (p.view === 'taxes' ? BASE_DATASETS : DATASETS)[p.product][p.consumer]
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
// A follow-up asking for the price split by tax level instead of components.
const TO_TAXES =
  /^ (now )?((in|with|as|show( me)?|by) )?(non ?components?|without components|not in components|no components|(the )?tax (view|levels?)|(the )?price (before|with) and (after|without) tax(es)?|before and after tax(es)?|with and without tax(es)?|ohne bestandteile|vor und nach steuern|sans composantes|avant et apres taxes) ?$/
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
  const geo = keepGeos(places.codes, ds.dimensions.find((d) => d.id === 'geo')?.codes ?? [])
  const year = detectTime(p).years.at(-1)
  const band = defaultBand(dataset, dict)
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
  const taxes = TO_TAXES.test(p.text)
  if (!taxes && !TO_COMPONENTS.test(p.text)) return null
  const prices: PriceView = { product: info.product, consumer: info.consumer, ...(taxes ? { view: 'taxes' as const } : {}) }
  const dataset = datasetFor(prices)
  const ds = dict.datasets[dataset]
  if (!ds) return null
  const geos = ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const bandCodes = BANDS[dataset]
  const currentBand = Array.isArray(current.filters.nrg_cons) ? current.filters.nrg_cons[0] : current.filters.nrg_cons
  const geo = keepGeos(current.filters.geo, geos)
  const nrg_cons = bandCodes.includes(String(currentBand)) ? String(currentBand) : defaultBand(dataset, dict)
  return {
    dataset,
    filters: { geo, nrg_cons, currency: 'EUR', ...(ds.dimensions.some((d) => d.id === 'unit') ? { unit: ds.defaults.unit ?? 'KWH' } : {}) },
    time: { kind: 'all' },
    ...(current.focusPeriod ? { focusPeriod: current.focusPeriod } : {}),
    intent: 'snapshot',
    prices,
  }
}

/** The price dashboard on screen for another product, consumer or breakdown (components / tax levels). */
function retarget(current: Plan, next: PriceView, dict: EnergyDictionary): Plan {
  const prices: PriceView = { product: next.product, consumer: next.consumer, ...(next.view ? { view: next.view } : {}) }
  const dataset = datasetFor(prices)
  const ds = dict.datasets[dataset]
  const has = (dim: string, code: unknown) => !!ds.dimensions.find((d) => d.id === dim)?.codes.includes(String(code))
  return {
    ...current,
    dataset,
    filters: {
      geo: keepGeos(current.filters.geo, ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []),
      nrg_cons: BANDS[dataset].includes(String(current.filters.nrg_cons)) ? current.filters.nrg_cons : defaultBand(dataset, dict),
      currency: has('currency', current.filters.currency) ? current.filters.currency : 'EUR',
      ...(ds.dimensions.some((d) => d.id === 'unit') ? { unit: has('unit', current.filters.unit) ? current.filters.unit : (ds.defaults.unit ?? 'KWH') } : {}),
    },
    // Semesters (2025-S2) and years (2025) do not carry over between the two datasets' periods.
    focusPeriod: current.focusPeriod?.slice(0, 4),
    prices,
    notes: [],
  }
}

/** A follow-up to the price dashboard on screen: another country, year, product or consumer type. */
export function refinePrices(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.prices) return null
  const p = parse(text.replace(/[-–,?]/g, ' '))
  if (TO_TAXES.test(p.text)) return current.prices.view === 'taxes' ? null : retarget(current, { ...current.prices, view: 'taxes' }, dict)
  if (TO_COMPONENTS.test(p.text)) return current.prices.view === 'taxes' ? retarget(current, { ...current.prices, view: undefined }, dict) : null
  const words = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|des|the|la|le|les|das|die|der|what|about|now|jetzt|maintenant|show|zeige|montre|price|preis|prix|\d{4})$/.test(w))
  const places = detectGeos(p, codelists)
  const year = detectTime(p).years.at(-1)
  const mentionsGas = GAS.test(p.text)
  const mentionsElectricity = /\b(electricity|strom|electricite)\b/.test(p.text)
  const mentionsConsumer = any(p, INDUSTRY_WORDS) || /\b(household|haushalt|menage)s?\b/.test(p.text)
  const known = words.every((w) => GAS.test(` ${w} `) || /^(electricity|strom|electricite|household|haushalt|menage|industr\w*|business|non-household)s?$/.test(w) || detectGeos(parse(w), codelists).codes.length || detectGeos(parse(w), codelists).eu)
  if (!known || !(places.codes.length || places.eu || year || mentionsGas || mentionsElectricity || mentionsConsumer)) return null
  const next = { product: mentionsGas ? 'gas' : mentionsElectricity ? 'electricity' : current.prices.product, consumer: mentionsConsumer ? consumerOf(p) : current.prices.consumer, ...(current.prices.view ? { view: current.prices.view } : {}) } as PriceView
  const dataset = datasetFor(next)
  const ds = dict.datasets[dataset]
  const geos = ds.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const geo = places.codes.find((c) => geos.includes(c)) ?? (places.eu ? 'EU27_2020' : String(current.filters.geo))
  const sameDataset = dataset === current.dataset
  const nrg_cons = sameDataset && BANDS[dataset].includes(String(current.filters.nrg_cons)) ? current.filters.nrg_cons : defaultBand(dataset, dict)
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
  titleTaxes: string
  view: string
  views: { components: string; taxes: string }
  netPrice: string
  vatRecoverable: string
  focusPrice: string
  focusTaxShare: string
  focusNetworkShare: string
  vsPrev: string
  leadFocus: string
  sugTaxes: string
  selectedOverTime: string
  currency: string
  unit: string
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
  const taxView = prices.view === 'taxes'
  const dataset = datasetFor(prices)
  // Several countries can be chosen; the first one is the focus.
  const geos = ([] as string[]).concat(plan.filters.geo ?? 'EU27_2020').map(String)
  const geo = geos[0]
  const band = String(plan.filters.nrg_cons ?? defaultBand(dataset, dict))
  const currency = String(plan.filters.currency ?? 'EUR')
  const unit = plan.filters.unit ? String(plan.filters.unit) : undefined
  const baseFilters: Record<string, string> = { currency, ...(unit ? { unit } : {}) }
  // The breakdown's own dimension: components (nrg_prc) or tax levels (tax).
  const partDim = taxView ? 'tax' : 'nrg_prc'
  const partCodes = taxView ? TAXES : [...PARTS, ...TAX_ITEMS.flat()]

  // Every country, this band and year: the country comparison and the year the data is for.
  const byCountry = await fetchEurostatData(dataset, { filters: { ...baseFilters, nrg_cons: band, [partDim]: partCodes }, lang, signal })
  const years = (byCountry.dimensions.time?.codes ?? []).map((c) => c.code).sort()
  const label = (dim: string, code: string, from: EurostatResult = byCountry) => from.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code
  const geoLabel = (code: string) => label('geo', code).replace(/\s*\(.*?\)\s*$/, '')
  const withData = years.filter((y) => byCountry.observations.some((o) => o.keys.time === y && o.keys[partDim] === partCodes[0] && o.value != null))
  // A year asked for on the semester dataset (tax view) is its latest semester with data.
  const asked = plan.focusPeriod ? withData.filter((y) => y === plan.focusPeriod || y.startsWith(`${plan.focusPeriod}-`)).at(-1) : undefined
  const year = asked ?? withData.at(-1)
  if (!year) throw new NoDataError(dataset)
  const yearBefore = year.replace(/^\d{4}/, (y) => String(Number(y) - 1))
  const prev = withData.includes(yearBefore) ? yearBefore : undefined

  const partsAt = (result: EurostatResult, filter: (o: EurostatResult['observations'][number]) => boolean, otherLabel: string) => {
    const v = (code: string) => result.observations.find((o) => filter(o) && o.keys[partDim] === code)?.value
    if (taxView) {
      const xTax = v('X_TAX')
      const xVat = v('X_VAT')
      const iTax = v('I_TAX')
      if (xTax == null || xVat == null || iTax == null) return null
      const round = (x: number) => Math.round(x * 10000) / 10000
      return [
        { code: 'X_TAX', name: t.netPrice, value: xTax },
        { code: 'OTHER_TAX', name: otherLabel, value: round(xVat - xTax) },
        { code: 'VAT', name: t.vatRecoverable, value: round(iTax - xVat) },
      ]
    }
    const nrgSup = v('NRG_SUP')
    const netc = v('NETC')
    const taxes = v('TAX_FEE_LEV_CHRG')
    const vat = v('VAT')
    if (nrgSup == null || netc == null || taxes == null || vat == null) return null
    const allow = v('TAX_FEE_LEV_CHRG_ALLOW') ?? 0
    const round = (x: number) => Math.round(x * 10000) / 10000
    // The taxes item by item, each net of its allowance, as the original enprices shows them;
    // whatever the items do not cover goes to "Other", so the parts still sum to the total.
    const otherTaxes = taxes - vat - allow
    const items = TAX_ITEMS.map(([code, allowance]) => ({ code, name: label('nrg_prc', code, result), value: round((v(code) ?? 0) - (v(allowance) ?? 0)) }))
    const covered = items.reduce((sum, x) => sum + x.value, 0)
    items[items.length - 1].value = round(items[items.length - 1].value + otherTaxes - covered)
    return [
      { code: 'NRG_SUP', name: label('nrg_prc', 'NRG_SUP', result), value: nrgSup },
      { code: 'NETC', name: label('nrg_prc', 'NETC', result), value: netc },
      ...items,
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
  const geoName = geos.map(geoLabel).join(', ')
  const productName = t.products[prices.product]
  const consumerName = t.consumers[prices.consumer].toLowerCase()
  const shareOf = (parts: NonNullable<ReturnType<typeof partsAt>>, code: string) => {
    const total = totalOf(parts) ?? 0
    return total > 0 ? (100 * (parts.find((x) => x.code === code)?.value ?? 0)) / total : 0
  }

  const focus = ranked.find((r) => r.code === geo) ?? (geo === 'EU27_2020' && euParts ? { code: 'EU27_2020', name: geoLabel(geo), parts: euParts, total: euTotal! } : ranked[0])
  const focusPrev = prev ? partsAt(byCountry, (o) => o.keys.geo === focus.code && o.keys.time === prev, otherTaxesLabel) : null
  const focusPrevTotal = focusPrev ? totalOf(focusPrev) : null
  const changePct = focusPrevTotal ? (100 * (focus.total - focusPrevTotal)) / focusPrevTotal : null

  // A subsidy year can push a component (and so a share) negative or past 100%, e.g. the
  // Netherlands' capped energy price in 2022-2023: not a meaningful "highest/lowest tax" headline.
  // Taxes: every part but the price before taxes (tax view) or energy and network (components).
  const taxShareOf = (r: { parts: NonNullable<ReturnType<typeof partsAt>> }) => r.parts.filter((x) => !['X_TAX', 'NRG_SUP', 'NETC'].includes(x.code)).reduce((sum, x) => sum + shareOf(r.parts, x.code), 0)
  const highestTaxShare = ranked.filter((r) => taxShareOf(r) >= 0 && taxShareOf(r) <= 100).sort((a, b) => taxShareOf(b) - taxShareOf(a))
  const highest = ranked[0]
  const lowest = ranked[ranked.length - 1]

  // Countries asked for: the dashboard shows only them, with the EU average as the reference.
  // Without any, the EU overview (every country ranked, the map) leads.
  const selected = ranked.filter((r) => geos.includes(r.code)).sort((a, b) => geos.indexOf(a.code) - geos.indexOf(b.code))
  const countryFocus = selected.length > 0 && selected[0].code === focus.code
  const euRow = euParts && euTotal != null ? [{ code: 'EU27_2020', name: 'EU-27', parts: euParts, total: euTotal }] : []

  // Key figures.
  const kpis: KpiSpec[] = countryFocus
    ? [
        { label: fill(t.focusPrice, { geo: focus.name }), value: focus.total, unit: symbol, decimals, goodDirection: 'down', ...(changePct != null && prev ? { delta: changePct, deltaUnit: '%', deltaLabel: fill(t.vsPrev, { prev }) } : {}) },
        ...(euTotal != null ? [{ label: t.euAverage, value: euTotal, unit: symbol, decimals, goodDirection: 'neutral' as const }] : []),
        { label: fill(t.focusTaxShare, { geo: focus.name }), value: taxShareOf(focus), unit: '%', decimals: 1, goodDirection: 'neutral' },
        ...(taxView ? [] : [{ label: fill(t.focusNetworkShare, { geo: focus.name }), value: shareOf(focus.parts, 'NETC'), unit: '%', decimals: 1, goodDirection: 'neutral' as const }]),
        ...selected.slice(1, 3).map((r) => ({ label: fill(t.focusPrice, { geo: r.name }), value: r.total, unit: symbol, decimals, goodDirection: 'down' as const })),
      ]
    : [
        ...(euTotal != null ? [{ label: t.euAverage, value: euTotal, unit: symbol, decimals, goodDirection: 'neutral' as const }] : []),
        { label: fill(t.highest, { name: highest.name }), value: highest.total, unit: symbol, decimals, goodDirection: 'neutral' },
        { label: fill(t.lowest, { name: lowest.name }), value: lowest.total, unit: symbol, decimals, goodDirection: 'neutral' },
        ...(euParts ? [{ label: t.taxShare, value: taxShareOf({ parts: euParts }), unit: '%', decimals: 1, goodDirection: 'neutral' as const }] : []),
        ...(euParts && !taxView ? [{ label: t.networkShare, value: shareOf(euParts, 'NETC'), unit: '%', decimals: 1, goodDirection: 'neutral' as const }] : []),
      ]

  // Charts: country comparison (values, then shares), the focus country's own split, the band
  // effect (non-decomposed, the "auxiliary" view), main countries over time and the focus
  // country's components over time, and the map.
  const w: Partial<Record<'countries' | 'shares' | 'structure' | 'bands' | 'main' | 'history' | 'map', WidgetSpec>> = {}
  // The countries asked for (and the EU average), or the top 15.
  const top = countryFocus ? [...selected, ...euRow] : ranked.slice(0, 15)
  // Tax items a country does not levy (all zero) are left out of the legend.
  const seriesOf = (rows: typeof ranked) => (rows[0]?.parts ?? []).map(({ code, name }) => ({ name, data: rows.map((r) => r.parts.find((x) => x.code === code)?.value ?? 0) })).filter((x) => x.data.some((v) => v !== 0))
  w.countries = {
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
  }
  w.shares = {
    type: 'bar',
    title: t.shares,
    subtitle: `${productName} · ${consumerName} · ${year}`,
    categories: top.map((r) => r.name),
    series: seriesOf(top),
    horizontal: true,
    stacked: 'percent',
    size: 'half',
    role: 'composition',
  }
  const focusSlices = focus.parts.filter((x) => x.value > 0).map((x) => ({ name: x.name, y: x.value }))
  if (focusSlices.length >= 2) {
    w.structure = { type: 'pie', title: fill(t.structure, { geo: focus.name, year }), slices: focusSlices, unit: symbol, centerLabel: nf.format(focus.total), size: 'half', role: 'change' }
  }

  // The band effect: this country's total price at every (current) consumption band, non-decomposed.
  // Real bands only: "all bands" (TOT_) is their average, not a consumer size.
  const currentBands = BANDS[dataset].filter((c) => !c.startsWith('TOT_'))
  if (currentBands.length > 2) {
    const byBand = await fetchEurostatData(dataset, { filters: { ...baseFilters, geo: focus.code, [partDim]: partCodes }, sinceTimePeriod: year, untilTimePeriod: year, lang, signal }).catch(() => null)
    if (byBand) {
      const bandTotals = currentBands
        .map((code) => ({ code, label: label('nrg_cons', code, byBand), total: totalOf(partsAt(byBand, (o) => o.keys.nrg_cons === code, otherTaxesLabel)) }))
        .filter((b): b is { code: string; label: string; total: number } => b.total != null)
      if (bandTotals.length > 2) {
        w.bands = {
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
        }
      }
    }
  }

  // Main countries (with the one asked for) and the focus country's breakdown over time: both
  // are in the all-countries query already.
  const mainCodes = countryFocus ? [...selected.map((r) => r.code), ...euRow.map((r) => r.code)].slice(0, 6) : ranked.slice(0, 5).map((r) => r.code)
  if (withData.length > 1) {
    const totalAt = (geoCode: string, y: string) => totalOf(partsAt(byCountry, (o) => o.keys.geo === geoCode && o.keys.time === y, otherTaxesLabel))
    w.main = {
      type: 'line',
      title: countryFocus ? t.selectedOverTime : t.mainOverTime,
      subtitle: `${productName} · ${consumerName}`,
      categories: withData,
      series: mainCodes.map((code) => ({ name: geoLabel(code), data: withData.map((y) => totalAt(code, y)) })).filter((series) => series.data.some((v) => v != null)),
      highlight: year,
      unit: symbol,
      size: 'half',
      role: 'evolution',
    }
    const focusAt = (y: string) => partsAt(byCountry, (o) => o.keys.geo === focus.code && o.keys.time === y, otherTaxesLabel)
    const focusYears = withData.filter((y) => focusAt(y))
    if (focusYears.length > 2) {
      w.history = {
        type: 'area',
        title: fill(t.history, { geo: focus.name }),
        subtitle: `${productName} · ${consumerName}`,
        categories: focusYears,
        series: focus.parts.map(({ name }, i) => ({ name, data: focusYears.map((y) => focusAt(y)?.[i]?.value ?? null) })).filter((x) => x.data.some((v) => v)),
        stacked: true,
        highlight: year,
        unit: symbol,
        size: 'half',
        role: 'headline',
      }
    }
  }

  // Map: total price by country.
  const mapData = ranked.filter((r) => /^[A-Z]{2}$/.test(r.code)).map((r) => ({ code: r.code, name: r.name, value: r.total }))
  if (!countryFocus && mapData.length >= 3) w.map = { type: 'map', title: t.map, subtitle: `${productName} · ${consumerName} · ${year}`, data: mapData, size: 'full' }

  const order = countryFocus ? (['structure', 'history', 'countries', 'bands', 'main', 'shares'] as const) : (['countries', 'shares', 'structure', 'bands', 'main', 'history', 'map'] as const)
  const widgets: WidgetSpec[] = [{ type: 'kpis', items: kpis }, ...order.flatMap((k) => (w[k] ? [w[k]] : []))]

  // Summary and insights.
  const summary: string[] = []
  if (countryFocus && euTotal != null) summary.push(fill(t.leadFocus, { geo: focus.name, product: productName.toLowerCase(), consumer: consumerName, year, value: `${nf.format(focus.total)} ${symbol}`, taxShare: fmtPct(taxShareOf(focus)), eu: `${nf.format(euTotal)} ${symbol}` }))
  else if (euTotal != null) summary.push(fill(t.lead, { product: productName.toLowerCase(), consumer: consumerName, year, value: `${nf.format(euTotal)} ${symbol}`, top: highest.name, topValue: `${nf.format(highest.total)} ${symbol}`, bottom: lowest.name, bottomValue: `${nf.format(lowest.total)} ${symbol}` }))
  if (changePct != null && prev) summary.push(fill(t.change, { geo: focus.name, dir: changePct >= 0 ? t.rose : t.fell, pct: fmtPct(Math.abs(changePct)), prev }))

  const insights: Insight[] = []
  const taxTop = highestTaxShare[0]
  const taxBottom = highestTaxShare[highestTaxShare.length - 1]
  if (taxTop && !countryFocus) insights.push({ tone: 'up', parts: [fill(t.highestTax, { name: taxTop.name, share: fmtPct(taxShareOf(taxTop)) })] })
  if (taxBottom && !countryFocus && taxBottom.code !== taxTop?.code) insights.push({ tone: 'down', parts: [fill(t.lowestTax, { name: taxBottom.name, share: fmtPct(taxShareOf(taxBottom)) })] })
  const focusHistory = withData.map((y) => ({ y, total: totalOf(partsAt(byCountry, (o) => o.keys.geo === focus.code && o.keys.time === y, otherTaxesLabel)) })).filter((x): x is { y: string; total: number } => x.total != null)
  if (focusHistory.length > 1) {
    const peak = focusHistory.reduce((best, x) => (x.total > best.total ? x : best), focusHistory[0])
    if (peak.y === year) insights.push({ tone: 'record', parts: [fill(t.peakNow, { geo: focus.name, year, peak: `${nf.format(peak.total)} ${symbol}` })] })
    else insights.push({ tone: 'down', parts: [fill(t.peak, { geo: focus.name, peakYear: peak.y, peak: `${nf.format(peak.total)} ${symbol}`, year, pct: fmtPct(100 * (1 - focus.total / peak.total)) })] })
  }

  const title = fill(taxView ? t.titleTaxes : t.title, { product: productName, consumer: consumerName, geo: geoName, year })
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
    suggestions: pricesSuggestions(plan, s, dict),
    controls: pricesControls(plan, dict, codelists, lang, withData, year, t),
    context: [title, ...summary, ...top.map((r, i) => `${i + 1}. ${r.name}: ${nf.format(r.total)} ${symbol}`)].join('\n'),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: geos },
  })
  return spec
}

function pricesControls(plan: Plan, dict: EnergyDictionary, codelists: EnergyCodelists, lang: string, years: string[], year: string, t: PricesStrings): DashboardControls {
  const prices = plan.prices!
  const ds = dict.datasets[plan.dataset]
  const bandDim = ds.dimensions.find((d) => d.id === 'nrg_cons')
  const currentBands = BANDS[plan.dataset]
  const bandLabel = (code: string) => codeLabel(codelists, bandDim?.codelist ?? null, code, lang)
  const at = (next: Partial<PriceView>): Plan => retarget(plan, { ...prices, ...next }, dict)
  return {
    years: [...years].reverse().slice(0, 15).map((y) => ({ label: y, plan: { ...plan, focusPeriod: y }, active: y === year })),
    choices: [
      { key: 'product', label: t.product, options: (['electricity', 'gas'] as PriceProduct[]).map((product) => ({ label: t.products[product], plan: at({ product, consumer: prices.consumer }), active: prices.product === product })) },
      { key: 'consumer', label: t.consumer, options: (['household', 'nonHousehold'] as PriceConsumer[]).map((consumer) => ({ label: t.consumers[consumer], plan: at({ product: prices.product, consumer }), active: prices.consumer === consumer })) },
      { key: 'view', label: t.view, options: (['components', 'taxes'] as const).map((view) => ({ label: t.views[view], plan: at({ view: view === 'taxes' ? 'taxes' : undefined }), active: (prices.view ?? 'components') === view })) },
      ...(currentBands.length > 1 ? [{ key: 'band', label: t.band, options: currentBands.map((code) => ({ label: bandLabel(code), plan: { ...plan, filters: { ...plan.filters, nrg_cons: code } }, active: plan.filters.nrg_cons === code })) }] : []),
      ...(['currency', 'unit'] as const).flatMap((dim) => {
        const d = ds.dimensions.find((x) => x.id === dim)
        const codes = (d?.codes ?? []).filter((c) => (dim === 'currency' ? ['EUR', 'PPS'].includes(c) : c in UNIT_SYMBOL))
        if (codes.length < 2) return []
        const text = (c: string) => (dim === 'unit' ? UNIT_SYMBOL[c] : codeLabel(codelists, d?.codelist ?? null, c, lang))
        return [{ key: dim, label: t[dim], options: codes.map((code) => ({ label: text(code), plan: { ...plan, filters: { ...plan.filters, [dim]: code } }, active: String(plan.filters[dim]) === code })) }]
      }),
    ],
  }
}

function pricesSuggestions(plan: Plan, s: { prices: PricesStrings; sugExplain: string }, dict: EnergyDictionary): Suggestion[] {
  const prices = plan.prices!
  const other: PriceProduct = prices.product === 'gas' ? 'electricity' : 'gas'
  const otherConsumer: PriceConsumer = prices.consumer === 'household' ? 'nonHousehold' : 'household'
  const out: Suggestion[] = [
    { label: fill(s.prices.sugOther, { product: s.prices.products[other] }), plan: retarget(plan, { ...prices, product: other }, dict) },
    { label: fill(s.prices.sugConsumer, { consumer: s.prices.consumers[otherConsumer].toLowerCase() }), plan: retarget(plan, { ...prices, consumer: otherConsumer }, dict) },
    prices.view === 'taxes'
      ? { label: s.prices.sugComponents, plan: retarget(plan, { ...prices, view: undefined }, dict) }
      : { label: s.prices.sugTaxes, plan: retarget(plan, { ...prices, view: 'taxes' }, dict) },
  ]
  if (plan.filters.geo !== 'EU27_2020') out.push({ label: s.prices.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: 'EU27_2020' } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
