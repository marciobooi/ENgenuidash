import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { NoDataError } from './execute'
import { detectGeos, detectTime, parse } from './planner/parse'
import type { DashboardControls, DashboardSpec, Insight, KpiSpec, Plan, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * The energy profile of one country, as Eurostat's energy dashboard (ENDASH,
 * https://ec.europa.eu/eurostat/cache/visualisations/energy-dashboard/endash.html): its headline
 * indicators side by side (renewables, efficiency, intensity, productivity, import dependency,
 * fossil share, energy poverty), each against the EU, and how final consumption and electricity
 * are made up. Each indicator is also a dashboard of its own; this is the overview, asked for
 * with "energy profile of Germany" or "energy dashboard".
 */

export type ProfileStrings = Omit<Strings['profile'], 'indicators'> & { indicators: Record<string, string> }

const DATASET = 'nrg_ind_ren'
const EU = 'EU27_2020'
export const PROFILE_GEOS = [EU, 'BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE', 'IS', 'NO', 'ME', 'MK', 'AL', 'RS', 'TR', 'BA', 'XK', 'MD', 'UA', 'GE']

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')

// ---------- questions ----------

// "energy profile", "energy dashboard", "country profile", "energy scorecard", "key energy indicators".
const PROFILE =
  / (energy|country|energie|energetique) (profiles?|overview|scorecard|dashboard|fact ?sheet|report card|profil\w*|uebersicht|ubersicht|tableau de bord)| (profiles?|overview|scorecard|fact ?sheet|report card) (of|for|on) | (key|main|headline|all) (the )?(energy )?indicators |energie dashboard| energy (use |consumption )?(per|pro|par) (capita|person|head|kopf|habitant) |energieprofil|energieubersicht|profil energetique|endash /
// "per capita", "per person", "per head", "pro Kopf", "par habitant".
const PER_CAPITA_WORDS = / (per (capita|person|head|inhabitant|citizen)|pro kopf|par habitants?|par personne|per capita) /
const DEFINITION = /^ (what is|what are|define|was ist|qu est ce)\b/

/** The profile a question asks for ("energy profile of Germany"), or null. */
export function profilePlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,]/g, ' '))
  if (!PROFILE.test(p.text) || DEFINITION.test(p.text)) return null
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => PROFILE_GEOS.includes(c)) ?? EU
  const year = detectTime(p).years.at(-1)
  return {
    dataset: DATASET,
    filters: { geo, nrg_bal: 'REN', unit: 'PC', freq: 'A' },
    time: year ? { kind: 'range', since: String(year), until: String(year) } : { kind: 'last', n: 20 },
    focusPeriod: year ? String(year) : undefined,
    intent: 'snapshot',
    profile: PER_CAPITA_WORDS.test(p.text) ? { perCapita: true } : {},
  }
}

/** "and France?", "2019": another country or year for the profile on screen. */
export function refineProfile(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.profile || !dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,]/g, ' '))
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => PROFILE_GEOS.includes(c)) ?? (places.eu ? EU : undefined)
  const year = detectTime(p).years.at(-1)
  const per = PER_CAPITA_WORDS.test(p.text) ? true : / (totals?|absolute|gesamt|totaux) /.test(p.text) ? false : undefined
  const rest = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|wie|ist|es|show|zeige|montre|now|jetzt|maintenant|per|capita|person|head|pro|kopf|par|habitant|habitants|totals|total|totaux|absolute|gesamt|as|it|this|\d{4})$/.test(w))
  const known = rest.every((w) => detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!(geo || year || per !== undefined) || (!known && !PROFILE.test(p.text))) return null
  return {
    ...current,
    filters: { ...current.filters, ...(geo ? { geo } : {}) },
    ...(year ? { time: { kind: 'range', since: String(year), until: String(year) }, focusPeriod: String(year) } : {}),
    ...(per !== undefined ? { profile: per ? { perCapita: true as const } : {} } : {}),
    notes: [],
  }
}

// ---------- the dashboard ----------

interface Indicator {
  key: string
  dataset: string
  filters: Record<string, string | string[]>
  /** Which observations belong to it (datasets with several series). */
  pick?: (o: EurostatResult['observations'][number]) => boolean
  unit: string
  good: 'up' | 'down' | 'neutral'
  decimals: number
  /** Per capita: the factor from the dataset's unit to the unit shown, per person. */
  per?: number
}

const INDICATORS: Indicator[] = [
  { key: 'ren', dataset: 'nrg_ind_ren', filters: { nrg_bal: 'REN', unit: 'PC' }, unit: '%', good: 'up', decimals: 1 },
  { key: 'pec', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'PEC_EED', unit: 'MTOE' }, unit: 'Mtoe', good: 'down', decimals: 1 },
  { key: 'fec', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'FEC_EED', unit: 'MTOE' }, unit: 'Mtoe', good: 'down', decimals: 1 },
  { key: 'ei', dataset: 'nrg_ind_ei', filters: { nrg_bal: 'EI_GDP_CLV05', unit: 'KGOE_TEUR' }, unit: 'kgoe/€1000', good: 'down', decimals: 1 },
  { key: 'ep', dataset: 'nrg_ind_ep', filters: { unit: 'EUR_KGOE' }, unit: '€/kgoe', good: 'up', decimals: 2 },
  { key: 'dep', dataset: 'nrg_ind_id', filters: { siec: 'TOTAL', unit: 'PC' }, unit: '%', good: 'down', decimals: 1 },
  { key: 'fossil', dataset: 'nrg_ind_ffgae', filters: { unit: 'PC' }, unit: '%', good: 'down', decimals: 1 },
  { key: 'poverty', dataset: 'ilc_mdes01', filters: { hhcomp: 'TOTAL', rskpovth: 'TOTAL', unit: 'PC' }, unit: '%', good: 'down', decimals: 1 },
]

// Per person: the same consumption and production, divided by the population (1 January).
const PER_CAPITA: Indicator[] = [
  { key: 'pecPc', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'PEC_EED', unit: 'MTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e9 },
  { key: 'fecPc', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'FEC_EED', unit: 'MTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e9 },
  { key: 'hhPc', dataset: 'nrg_bal_c', filters: { siec: 'TOTAL', nrg_bal: 'FC_OTH_HH_E', unit: 'KTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e6 },
  { key: 'traPc', dataset: 'nrg_bal_c', filters: { siec: 'TOTAL', nrg_bal: 'FC_TRA_E', unit: 'KTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e6 },
  { key: 'indPc', dataset: 'nrg_bal_c', filters: { siec: 'TOTAL', nrg_bal: 'FC_IND_E', unit: 'KTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e6 },
  { key: 'elcPc', dataset: 'nrg_ind_peh', filters: { siec: 'TOTAL', nrg_bal: 'GEP', plants: 'TOTAL', operator: 'TOTAL', unit: 'GWH' }, unit: 'kWh', good: 'neutral', decimals: 0, per: 1e6 },
]

// Products and sectors of ENDASH's consumption and production charts.
const PRODUCTS = ['C0000X0350-0370', 'C0350-0370', 'P1000', 'S2000', 'G3000', 'O4000XBIO', 'RA000', 'W6100_6220', 'N900H', 'E7000', 'H8000']
const SECTORS = ['FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'FC_OTH_FISH_E', 'FC_OTH_NSP_E']
const ELECTRICITY = ['CF', 'RA100', 'RA130', 'RA200', 'RA300', 'RA400', 'RA500', 'N9000', 'X9900', 'X9900H']

const linkFor = (dataset: string, lang: string) => `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=${lang}`

/** Value per (series key, year) for one country. */
function seriesOf(result: EurostatResult, geo: string, per?: number, population?: EurostatResult | null): Map<string, number> {
  const out = new Map<string, number>()
  const people = new Map<string, number>()
  for (const o of population?.observations ?? []) if (o.keys.geo === geo && o.value) people.set(o.keys.time, o.value)
  for (const o of result.observations) {
    if (o.keys.geo !== geo || o.value == null) continue
    if (!per) out.set(o.keys.time, o.value)
    else if (people.has(o.keys.time)) out.set(o.keys.time, (o.value * per) / people.get(o.keys.time)!)
  }
  return out
}

/** Latest year with a value in each of the given series, for a pie: name → value. */
function latestSlices(result: EurostatResult, geo: string, dim: string, until?: string, perPerson?: { per: number; population: EurostatResult | null }): { year: string; slices: { name: string; y: number }[] } | null {
  const years = [...new Set(result.observations.filter((o) => o.keys.geo === geo && o.value != null && (!until || o.keys.time <= until)).map((o) => o.keys.time))].sort()
  for (const year of years.reverse()) {
    const slices = result.observations
      .filter((o) => o.keys.geo === geo && o.keys.time === year && o.value != null && o.value > 0)
      .map((o) => ({ name: result.dimensions[dim]?.codes.find((c) => c.code === o.keys[dim])?.label ?? o.keys[dim], y: o.value as number }))
      .map((x) => ({ ...x, name: x.name.replace(/^Final consumption - (other sectors - )?/i, '').replace(/ - energy use$/i, '').replace(/^./, (c) => c.toUpperCase()) }))
      .map((x) => (perPerson ? { ...x, y: (x.y * perPerson.per) / (perPerson.population?.observations.find((q) => q.keys.geo === geo && q.keys.time === year)?.value ?? NaN) } : x))
      .filter((x) => Number.isFinite(x.y))
      .sort((a, b) => b.y - a.y)
    if (slices.length >= 2) return { year, slices }
  }
  return null
}

function profileControls(plan: Plan, dict: EnergyDictionary, year: string, t: ProfileStrings): DashboardControls {
  const end = Number(dict.datasets[DATASET]?.dataEnd) || Number(year)
  const at = (y: string): Plan => ({ ...plan, time: { kind: 'range', since: y, until: y }, focusPeriod: y })
  const years = Array.from({ length: 15 }, (_, k) => String(end - k))
  if (!years.includes(year)) years.push(year)
  const per = !!plan.profile?.perCapita
  return {
    years: years.map((y) => ({ label: y, plan: at(y), active: y === year })),
    choices: [
      {
        key: 'view',
        label: t.view,
        options: [
          { label: t.viewTotals, plan: { ...plan, profile: {} }, active: !per },
          { label: t.viewPerCapita, plan: { ...plan, profile: { perCapita: true } }, active: per },
        ],
      },
    ],
  }
}

export async function buildProfileDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { profile: ProfileStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const t = s.profile
  const geo = String(plan.filters.geo ?? EU)
  const until = plan.focusPeriod
  const geos = geo === EU ? [EU] : [geo, EU]
  const timeQuery = { lastTimePeriod: 30, ...(until ? { untilTimePeriod: until } : {}) }
  const ask = (dataset: string, filters: Record<string, string | string[]>, query: Record<string, unknown> = timeQuery) =>
    dict.datasets[dataset] ? fetchEurostatData(dataset, { filters: { geo: geos, ...filters }, lang, signal, ...query }).catch(() => null) : Promise.resolve(null)

  const perCapita = !!plan.profile?.perCapita
  const list = perCapita ? PER_CAPITA : INDICATORS
  // Population on 1 January (demo_pjan is not in the dictionary: asked for directly).
  const population = perCapita ? await fetchEurostatData('demo_pjan', { filters: { geo: geos, age: 'TOTAL', sex: 'T', unit: 'NR' }, lang, signal, ...timeQuery }).catch(() => null) : null
  const [indicatorData, sectors, products, electricity] = await Promise.all([
    Promise.all(list.map((i) => ask(i.dataset, i.filters))),
    ask('nrg_bal_c', { geo: [geo], siec: 'TOTAL', nrg_bal: SECTORS, unit: 'KTOE' }, { lastTimePeriod: 4, ...(until ? { untilTimePeriod: until } : {}) }),
    ask('nrg_bal_c', { geo: [geo], siec: PRODUCTS, nrg_bal: 'FC_E', unit: 'KTOE' }, { lastTimePeriod: 4, ...(until ? { untilTimePeriod: until } : {}) }),
    ask('nrg_ind_peh', { geo: [geo], siec: ELECTRICITY, nrg_bal: 'GEP', plants: 'TOTAL', operator: 'TOTAL', unit: 'GWH' }, { lastTimePeriod: 4, ...(until ? { untilTimePeriod: until } : {}) }),
  ])
  const geoName = (indicatorData.find(Boolean)?.dimensions.geo?.codes.find((c) => c.code === geo)?.label ?? geo).replace(/\s*\(.*?\)\s*$/, '')
  const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })

  const kpis: KpiSpec[] = []
  const widgets: WidgetSpec[] = []
  const summary: string[] = []
  const insights: Insight[] = []
  const trendCharts: WidgetSpec[] = []
  let latestYear = ''
  const values: Record<string, { value: number; eu?: number; year: string; delta?: number; ind: Indicator }> = {}

  list.forEach((ind, n) => {
    const result = indicatorData[n]
    if (!result) return
    // Consumption datasets carry the two series in one result: filtered by the query already.
    const own = seriesOf(result, geo, ind.per, population)
    const years = [...own.keys()].sort()
    const year = years.at(-1)
    if (!year) return
    const value = own.get(year)!
    const eu = geo === EU ? undefined : seriesOf(result, EU, ind.per, population).get(year)
    const first = years.length > 1 ? years[Math.max(0, years.length - 11)] : undefined
    const delta = first && first !== year ? value - own.get(first)! : undefined
    values[ind.key] = { value, eu, year, delta, ind }
    if (year > latestYear) latestYear = year
    kpis.push({
      label: t.indicators[ind.key],
      value,
      unit: ind.unit,
      decimals: ind.decimals,
      ...(delta != null ? { delta, deltaUnit: ind.unit, deltaLabel: fill(t.since, { year: first! }) } : {}),
      caption: [year, eu != null ? fill(t.euValue, { value: `${nf(ind.decimals).format(eu)} ${ind.unit}` }) : ''].filter(Boolean).join(' · '),
      goodDirection: ind.good === 'up' || ind.good === 'down' ? ind.good : 'neutral',
      trend: years.slice(-15).map((y) => own.get(y) ?? null),
    })
    if (years.length > 2 && ['ren', 'dep', 'fossil', 'ei', 'pecPc', 'hhPc', 'elcPc'].includes(ind.key)) {
      const euSeries = seriesOf(result, EU, ind.per, population)
      const shown = years.slice(-20)
      trendCharts.push({
        type: 'line',
        title: fill(t.trend, { indicator: t.indicators[ind.key] }),
        subtitle: `${shown[0]}–${shown.at(-1)}`,
        categories: shown,
        series: [{ name: geoName, data: shown.map((y) => own.get(y) ?? null) }, ...(geo !== EU ? [{ name: t.eu, data: shown.map((y) => euSeries.get(y) ?? null) }] : [])],
        unit: ind.unit,
        size: 'half',
        role: 'evolution',
      })
    }
  })
  if (!kpis.length) throw new NoDataError(DATASET)

  // Consumption and production: how they are made up.
  const parts: [string, EurostatResult | null, string, string, string][] = [
    [t.bySector, sectors, 'nrg_bal', 'nrg_bal_c', 'ktoe'],
    [t.byProduct, products, 'siec', 'nrg_bal_c', 'ktoe'],
    [t.electricity, electricity, 'siec', 'nrg_ind_peh', 'GWh'],
  ]
  const pies: WidgetSpec[] = []
  for (const [title, result, dim, dataset, unit] of parts) {
    const found = result ? latestSlices(result, geo, dim, until, perCapita ? { per: unit === 'GWh' ? 1e6 : 1e6, population } : undefined) : null
    if (found) pies.push({ type: 'pie', title, subtitle: `${geoName} · ${found.year}${perCapita ? ` · ${t.perPerson}` : ''}`, slices: found.slices, unit: perCapita ? (unit === 'GWh' ? 'kWh' : 'kgoe') : unit, size: 'half', source: { code: dataset, url: linkFor(dataset, lang) } })
  }

  widgets.push({ type: 'kpis', items: kpis }, ...trendCharts, ...pies)

  // Summary and insights: what stands out, from the numbers.
  const v = values
  if (perCapita && v.pecPc) summary.push(fill(t.leadPerCapita, { geo: geoName, year: v.pecPc.year, value: `${nf(0).format(v.pecPc.value)} kgoe`, eu: v.pecPc.eu != null ? `(${fill(t.euValue, { value: `${nf(0).format(v.pecPc.eu)} kgoe` })})` : '' }).replace(/\s+\./, '.'))
  if (v.ren) summary.push(fill(t.leadRenewables, { geo: geoName, year: v.ren.year, value: `${nf(1).format(v.ren.value)} %`, eu: v.ren.eu != null ? `(${fill(t.euValue, { value: `${nf(1).format(v.ren.eu)} %` })})` : '' }).replace(/\s+\./, '.'))
  if (v.dep) summary.push(fill(t.leadDependency, { geo: geoName, year: v.dep.year, value: `${nf(1).format(v.dep.value)} %` }))
  for (const item of Object.values(v)) {
    const { ind, value, eu, delta } = item
    if (eu != null) {
      if (ind.good === 'neutral') continue
      const better = ind.good === 'up' ? value > eu : value < eu
      insights.push({ tone: better ? 'up' : 'down', parts: [fill(better ? t.betterThanEu : t.worseThanEu, { indicator: t.indicators[ind.key], geo: geoName, value: `${nf(ind.decimals).format(value)} ${ind.unit}`, eu: `${nf(ind.decimals).format(eu)} ${ind.unit}` })] })
    } else if (delta != null && Math.abs(delta) > 0) {
      const better = ind.good === 'up' ? delta > 0 : delta < 0
      insights.push({ tone: better ? 'up' : 'down', parts: [fill(t.movedTowards, { indicator: t.indicators[ind.key], dir: delta > 0 ? t.rose : t.fell, delta: `${nf(ind.decimals).format(Math.abs(delta))} ${ind.unit}` })] })
    }
  }

  const title = fill(perCapita ? t.titlePerCapita : t.title, { geo: geoName })
  const suggestions: Suggestion[] = []
  if (geo !== EU) suggestions.push({ label: t.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: EU } } })
  else suggestions.push({ label: t.sugCountry, plan: { ...plan, filters: { ...plan.filters, geo: 'DE' } } })
  suggestions.push({ label: perCapita ? t.sugTotals : t.sugPerCapita, plan: { ...plan, profile: perCapita ? {} : { perCapita: true } } })
  const sugPlans = suggestions
  sugPlans.push({ label: s.sugExplain, explain: true })

  const { spec } = sanitizeSpec({
    title,
    subtitle: t.subtitle,
    summary,
    insights: insights.slice(0, 6),
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'profile', kpiStyle: 'cards', controls: ['geo', 'year', 'view'], primaryControls: 3, accent: 'teal' },
    source: { code: 'ENDASH', title: t.sourceTitle, url: linkFor(DATASET, lang) },
    suggestions: sugPlans,
    controls: profileControls(plan, dict, until ?? latestYear, t),
    context: [title, ...summary, ...kpis.map((k) => `${k.label}: ${nf(k.decimals ?? 1).format(k.value)} ${k.unit ?? ''} (${k.caption ?? ''})`)].join('\n'),
    plan: { ...plan, focusPeriod: until ?? latestYear },
    shown: { geo: [geo] },
  })
  return spec
}
