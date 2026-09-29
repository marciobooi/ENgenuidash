import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary } from '../../data/eurostat'
import type { Strings } from '../../i18n'
import { NoDataError } from '../execute'
import { detectGeos, detectTime, parse, requestedUnit } from '../planner/parse'
import type { DashboardControls, DashboardSpec, KpiSpec, Plan, Suggestion } from '../types'
import { sanitizeSpec } from '../validate'
import { DEFAULT_DISAGGREGATION } from './layout'
import labels from './labels.json'
import { BalanceTable, FLOW_FORMULAS, FUEL_FAMILIES, balanceLinesFor, buildModel, displayedFuels, leafFuels, rowsOf } from './model'

/**
 * The energy flow diagram (ENSANKEY, https://ec.europa.eu/eurostat/cache/sankey/energy/sankey.html):
 * the energy balance of a country or the EU as flows from what is available to what is consumed, in
 * the shape people know (see layout.ts). Asked for with "energy flow diagram of Germany", "sankey".
 */

export type SankeyStrings = Strings['sankey']

const DATASET = 'nrg_bal_c'
const EU = 'EU27_2020'
const UNITS: Record<string, string> = { KTOE: 'ktoe', GWH: 'GWh', TJ: 'TJ' }
const GEOS = [EU, 'BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE', 'IS', 'NO', 'ME', 'MK', 'AL', 'RS', 'TR', 'BA', 'XK', 'MD', 'UA', 'GE']

// The flows of the picture as first drawn (the balance lines they read are the ones fetched).
const DEFAULT_FLOWS = ['F1_1_1', 'F1_1_2', 'F1_1', 'F1_2', 'F1_3', 'F1_4', 'N1', 'N2_1', 'N2_2', 'F3', 'F2_1', 'F2_2', 'F5_1', 'F5_2', 'F6_1_1', 'F6_1_2', 'F6_1', 'F6_2', 'F6_3', 'F6_4', 'F6_5', 'F6_6', 'F6_7', 'F6_8', 'N6']

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

// ---------- questions ----------

const SANKEY = / (sankeys?|energy sankey|energy flow (diagrams?|charts?)|energy flows?|flow diagrams?|ensankey|energiefluss\w*|flussdiagramm\w*|energieflussdiagramm\w*|diagrammes? de flux|flux d energie|flux energetiques?) /
const DEFINITION = /^ (what is|what are|define|was ist|qu est ce)\b/
const FUEL_WORDS: [string, RegExp][] = [
  ['SFF_P1000', / (coal|solid fuels?|solid fossil|kohle|charbon|combustibles solides) /],
  ['O4000', / (oil|petroleum|erdol|mineralol|petrole) /],
  ['G3000_C0350-370', / (gas|natural gas|erdgas|gaz) /],
  ['RA000', / (renewables?|renewable energy|erneuerbare\w*|renouvelables?) /],
  ['W6100_6220', / (waste|abfall|dechets) /],
  ['N900H', / (nuclear|nuklear|atom\w*|nucleaire) /],
  ['H8000', / (heat|warme|chaleur) /],
  ['E7000', / (electricity|strom|electricite) /],
]
const BY_FUEL = / (by (fuel|product|source)s?|coloured|colored|nach (brennstoff|energietrager)\w*|par (combustible|produit)s?) /

/** The diagram a question asks for ("energy flow diagram of Germany 2022"), or null. */
export function sankeyPlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  const ds = dict.datasets[DATASET]
  if (!ds) return null
  const p = parse(text.replace(/[-–,]/g, ' '))
  if (!SANKEY.test(p.text) || DEFINITION.test(p.text)) return null
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => GEOS.includes(c)) ?? EU
  const year = detectTime(p).years.at(-1)
  const fuel = FUEL_WORDS.find(([, re]) => re.test(p.text))?.[0]
  return {
    dataset: DATASET,
    filters: { geo, unit: requestedUnit(p, ds) ?? 'KTOE' },
    time: year ? { kind: 'range', since: String(year), until: String(year) } : { kind: 'last', n: 1 },
    focusPeriod: year ? String(year) : undefined,
    intent: 'snapshot',
    sankey: { ...(fuel ? { fuel } : {}), ...(fuel || BY_FUEL.test(p.text) ? { byFuel: true as const } : {}) },
  }
}

/** "and France?", "2019", "in GWh", "renewables", "by fuel": a change of the diagram on screen. */
export function refineSankey(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.sankey) return null
  const ds = dict.datasets[DATASET]
  const p = parse(text.replace(/[-–,]/g, ' '))
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => GEOS.includes(c)) ?? (places.eu ? EU : undefined)
  const year = detectTime(p).years.at(-1)
  const unit = requestedUnit(p, ds)
  const fuel = FUEL_WORDS.find(([, re]) => re.test(p.text))?.[0]
  const byFuel = BY_FUEL.test(p.text)
  const rest = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|wie|ist|es|show|zeige|montre|now|jetzt|maintenant|by|fuel|fuels|product|products|colou?red|as|only|just|nur|seulement|\d{4}|ktoe|gwh|tj)$/.test(w))
  const known = rest.every((w) => FUEL_WORDS.some(([, re]) => re.test(` ${w} `)) || detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!(geo || year || unit || fuel || byFuel) || (!known && !SANKEY.test(p.text))) return null
  const sankey = { ...current.sankey, ...(fuel ? { fuel } : {}), ...(fuel || byFuel ? { byFuel: true as const } : {}) }
  return {
    ...current,
    filters: { ...current.filters, ...(geo ? { geo } : {}), ...(unit ? { unit } : {}) },
    ...(year ? { time: { kind: 'range', since: String(year), until: String(year) }, focusPeriod: String(year) } : {}),
    sankey,
    notes: [],
  }
}

// ---------- the dashboard ----------

export async function buildSankeyDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { sankey: SankeyStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const t = s.sankey
  const ds = dict.datasets[DATASET]
  const geo = String(plan.filters.geo ?? EU)
  const unit = String(plan.filters.unit ?? 'KTOE')
  const fuel = plan.sankey?.fuel && FUEL_FAMILIES.includes(plan.sankey.fuel) ? plan.sankey.fuel : 'TOTAL'
  const byFuel = !!plan.sankey?.byFuel
  const siecCodes = ds.dimensions.find((d) => d.id === 'siec')?.codes ?? []
  const lineCodes = ds.dimensions.find((d) => d.id === 'nrg_bal')?.codes ?? []
  // Every elementary product of the family: the flows are worked out product by product.
  const leaves = [...new Set(displayedFuels(fuel, byFuel).flatMap(leafFuels))].filter((c) => siecCodes.includes(c))
  const lines = balanceLinesFor(DEFAULT_FLOWS, lineCodes)
  const result = await fetchEurostatData(DATASET, { filters: { geo, unit, nrg_bal: lines, siec: leaves }, lang, signal })
  const { years, rows } = rowsOf(result)
  const table = new BalanceTable(years, rows)
  const model = buildModel(table, fuel, byFuel)
  const active = years.filter((y) => (model.flows(y).get('N1')?.value ?? 0) > 0 || (model.flows(y).get('N6')?.value ?? 0) > 0)
  if (!active.length) throw new NoDataError(DATASET)
  const year = plan.focusPeriod && active.includes(plan.focusPeriod) ? plan.focusPeriod : active.at(-1)!
  const yearNote = plan.focusPeriod && year !== plan.focusPeriod ? [fill(t.yearFallback, { asked: plan.focusPeriod, year })] : []

  const geoName = (result.dimensions.geo?.codes.find((c) => c.code === geo)?.label ?? geo).replace(/\s*\(.*?\)\s*$/, '')
  const names = (labels as Record<string, Record<string, string>>)[lang] ?? labels.en
  const fuelLabel = names[fuel] ?? fuel
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
  const value = (code: string, y = year) => model.flows(y).get(code)?.value ?? 0
  const symbol = UNITS[unit] ?? unit
  const fmt = (v: number) => `${nf.format(Math.round(v))} ${symbol}`

  const before = active[active.indexOf(year) - 1]
  const kpi = (label: string, code: string, extra?: Partial<KpiSpec>): KpiSpec => ({
    label,
    value: Math.round(value(code)),
    unit: symbol,
    decimals: 0,
    ...(before && value(code, before) > 0 ? { delta: Math.round(value(code) - value(code, before)), deltaUnit: symbol, deltaLabel: `${before}` } : {}),
    trend: active.slice(-15).map((y) => Math.round(value(code, y))),
    ...extra,
  })
  const kpis: KpiSpec[] = [kpi(names.N1, 'N1', { goodDirection: 'neutral' }), kpi(names.E1_2, 'F1_2', { goodDirection: 'neutral' }), kpi(names.N6_1, 'F6_1', { goodDirection: 'neutral' })]
  if (fuel === 'TOTAL') kpis.push(kpi(names.E4, 'F4', { goodDirection: 'down' }))

  const available = value('N1')
  const imports = value('F1_2')
  const summary = [
    fill(t.summary, {
      geo: geoName,
      year,
      available: fmt(available),
      imports: fmt(imports),
      pct: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(available > 0 ? (100 * imports) / available : 0),
      final: fmt(value('F6_1')),
      losses: fmt(value('F4')),
      fuel: fuelLabel.toLowerCase(),
    }),
  ]

  const title = fill(t.title, { geo: geoName, year })
  const source = { code: DATASET, title: result.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${DATASET}/default/table?lang=${lang}` }
  const { spec } = sanitizeSpec({
    title,
    subtitle: fuel === 'TOTAL' ? '' : fuelLabel,
    summary,
    insights: [],
    notes: yearNote,
    widgets: [
      { type: 'kpis', items: kpis },
      {
        type: 'sankey',
        title: fill(t.diagramTitle, { geo: geoName }),
        subtitle: fuel === 'TOTAL' ? t.allProducts : fuelLabel,
        geo,
        geoName,
        unit: symbol,
        lang: ['de', 'fr'].includes(lang) ? lang : 'en',
        years,
        year,
        fuel,
        byFuel,
        table: rows,
        disaggregation: { ...DEFAULT_DISAGGREGATION },
        size: 'full',
      },
    ],
    layout: ['summary', 'notes', 'toolbar', 'kpis', 'charts', 'suggestions'],
    presentation: { template: 'sankey', kpiStyle: 'cards', controls: ['geo', 'year', 'unit', 'fuel', 'view'], primaryControls: 5, accent: 'teal' },
    unit: symbol,
    source,
    suggestions: sankeySuggestions(plan, s, fuel, byFuel),
    controls: sankeyControls(plan, dict, active, year, fuel, byFuel, t, names),
    context: [title, ...summary].join('\n'),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: [geo] },
  })
  void FLOW_FORMULAS
  return spec
}

function sankeyControls(plan: Plan, dict: EnergyDictionary, years: string[], year: string, fuel: string, byFuel: boolean, t: SankeyStrings, names: Record<string, string>): DashboardControls {
  const at = (y: string): Plan => ({ ...plan, time: { kind: 'range', since: y, until: y }, focusPeriod: y })
  const units = (dict.datasets[DATASET]?.dimensions.find((d) => d.id === 'unit')?.codes ?? []).filter((u) => u in UNITS)
  const withSankey = (over: NonNullable<Plan['sankey']>): Plan => ({ ...plan, sankey: over })
  return {
    years: [...years].reverse().slice(0, 40).map((y) => ({ label: y, plan: at(y), active: y === year })),
    units: units.map((u) => ({ label: UNITS[u], plan: { ...plan, filters: { ...plan.filters, unit: u } }, active: (plan.filters.unit ?? 'KTOE') === u })),
    choices: [
      { key: 'fuel', label: t.fuel, options: FUEL_FAMILIES.map((f) => ({ label: f === 'TOTAL' ? t.allProducts : (names[f] ?? f), plan: withSankey({ ...(f === 'TOTAL' ? {} : { fuel: f }), ...(byFuel ? { byFuel: true as const } : {}) }), active: fuel === f })) },
      {
        key: 'view',
        label: t.view,
        options: [
          { label: t.viewOne, plan: withSankey({ ...(fuel !== 'TOTAL' ? { fuel } : {}) }), active: !byFuel },
          { label: t.viewByFuel, plan: withSankey({ ...(fuel !== 'TOTAL' ? { fuel } : {}), byFuel: true }), active: byFuel },
        ],
      },
    ],
  }
}

function sankeySuggestions(plan: Plan, s: { sankey: SankeyStrings; sugExplain: string }, fuel: string, byFuel: boolean): Suggestion[] {
  const out: Suggestion[] = []
  out.push({ label: byFuel ? s.sankey.viewOne : s.sankey.viewByFuel, plan: { ...plan, sankey: { ...(fuel !== 'TOTAL' ? { fuel } : {}), ...(byFuel ? {} : { byFuel: true as const }) } } })
  if (plan.filters.geo !== EU) out.push({ label: s.sankey.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: EU } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
