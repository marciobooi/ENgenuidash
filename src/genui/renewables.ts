import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { compareChoice, placeNameOf, withVersus } from './compareControl'
import { compareRequest } from './comparing'
import { peerChips } from './peers'
import { renewablesTabByWords } from './customWords'
import { NoDataError } from './execute'
import { NATIONAL_RES_2030, RES_2020_TARGET } from './nationalTargets'
import { detectGeos, parse } from './planner/parse'
import type { DashboardSpec, Insight, KpiSpec, Plan, RenewablesTab, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * Renewable energy as Eurostat's SHARES database lays it out: one dashboard with eight tabs.
 *   shares       the shares of energy from renewable sources, overall and in electricity, heating and cooling and
 *                transport, against the EU 2030 reference points (nrg_ind_ren)
 *   capacity     installed capacity of each renewable technology (nrg_inf_epcrw)
 *   electricity  gross electricity generation by technology (nrg_ind_ured)
 *   heating      renewable energy in heating and cooling, by technology (nrg_ind_urhcd)
 *   transport    renewable energy in transport, by technology (nrg_ind_urtd)
 *   biomass      biomass supply for energy use (nrg_cb_bm)
 *   solid        solid biomass used for energy, by use (nrg_cb_rw)
 *   buildings    renewables in buildings, households and services (nrg_bal_c)
 * Every number is Eurostat's; the technologies are grouped into the main categories of the SHARES reporting
 * (hydro, geothermal, solar, tide/wave/ocean, wind, biomass) and the table behind each tab shows all values.
 */

const DATASET = 'nrg_ind_ren'
const EU = 'EU27_2020'
export const RENEWABLES_TABS: RenewablesTab[] = ['shares', 'capacity', 'electricity', 'heating', 'transport', 'biomass', 'solid', 'buildings']
export type RenewablesFrom = 'all' | '2010' | '2020'

/** EU-level reference points (Directive (EU) 2023/2413, RED III): the 2030 overall target and the transport target; heating and cooling rise 0.8 pp a year to 2025 and 1.1 pp to 2030. */
const TARGET_OVERALL = 42.5
const TARGET_TRANSPORT = 29
const HC_STEPS: [number, number][] = [[2025, 0.8], [2030, 1.1]]
/** The rise RED III asks of every country in heating and cooling from its 2020 share to 2030: 5 x 0.8 + 5 x 1.1 points. */
const HC_TOTAL_RISE = 5 * 0.8 + 5 * 1.1

// ---------- questions ----------

const RENEW =
  / (shares? (tool|database|data|methodology)|(the )?shares (of|in|for|by|from)|show (me )?(the )?shares|res shares|renewable shares|anteile (von|in|fur)|parts (de|en|pour)|shares dashboard|renewables? (dashboard|overview|scorecard|breakdown|by technolog\w*|by source|by sector|sectors|contributions?|capacity|capacities|installed|technolog\w*|mix|supply)|renewable energy (dashboard|overview|breakdown|by technolog\w*|by source|by sector|sectors|technolog\w*|capacity|capacities|contributions?)|res ?e|res ?h ?c?|res ?t|installed (renewable|capacity)|renewable (electricity|heating( and cooling)?|cooling|transport) (by|from|generation|capacity|technolog\w*|breakdown)|biomass (supply|use|used|dashboard|for energy)|solid biomass|renewables? in (buildings?|heating|cooling|transport|electricity)|erneuerbare\w*( energie\w*)? (dashboard|ubersicht|technolog\w*|kapazitat\w*|beitrag|beitrage|nach technolog\w*|nach sektor\w*|im gebaude\w*|in gebaude\w*)|kapazitat\w* (erneuerbar\w*)|tableau de bord (des )?(energies? )?renouvelables?|energies? renouvelables? (tableau de bord|apercu|par technolog\w*|par secteur|capacite\w*|contributions?|dans les batiments)|renouvelables (par technolog\w*|par secteur|capacite\w*|tableau de bord)|biomasse (offre|solide|utilisation))(?= )/
const DEFINITION = /^ (what is|what are|define|was ist|qu est ce)\b/

const TAB_WORDS: [RenewablesTab, RegExp][] = [
  ['solid', / (solid (biomass|biofuels?)|feste biomasse|biomasse solide|wood|holz|bois)\b/],
  ['buildings', / (buildings?|gebaude\w*|batiments?)\b/],
  ['biomass', / (biomass|biomasse)\b/],
  ['capacity', / (capacity|capacities|installed|installierte\w*|kapazitat\w*|leistung|capacite\w*|puissance)\b/],
  ['transport', / (transport|verkehr|transports?|mobility)\b/],
  ['heating', / (heating|cooling|heat|warme|heizung|kalte|chaleur|chauffage|refroidissement|res ?h ?c?)\b/],
  ['shares', / (shares|anteile|parts)\b/],
  ['electricity', / (electricity|power|generation|strom\w*|erzeugung|electricite|production d electricite|res ?e)\b/],
]
const tabOf = (text: string): RenewablesTab | undefined => TAB_WORDS.find(([, re]) => re.test(text))?.[0]
const FROM_WORDS: [RenewablesFrom, RegExp][] = [
  ['2020', / (since|from|ab|seit|depuis|des) (the )?(year )?2020 /],
  ['2010', / (since|from|ab|seit|depuis|des) (the )?(year )?2010 /],
  ['all', / (all years|every year|full period|alle jahre|toutes les annees|since 2004|from 2004|seit 2004) /],
]
const PERCENT = / (as (a )?(share|percent\w*|percentage)|in percent|share of the total|prozent\w*|anteil\w* am gesamt\w*|en pourcentage|en part) /
const ABSOLUTE = / (absolute|in absolute terms|absolut|valeurs absolues|in (gw|twh|ktoe|pj)) /

/** The renewables dashboard a question asks for ("renewable capacity by technology in Germany", "renewables in transport"), or null. */
export function renewablesPlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,?&]/g, ' '))
  const places = detectGeos(p, codelists)
  const byWords = renewablesTabByWords(p.text.replace(/\benergies\b/g, 'energy'), places.codes.length > 0 || places.eu)
  if ((!RENEW.test(p.text) && !byWords) || (DEFINITION.test(p.text) && !(places.codes.length || places.eu))) return null
  const geos = dict.datasets[DATASET].dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const geo = places.codes.find((c) => geos.includes(c)) ?? EU
  const tab = tabOf(p.text) ?? byWords ?? 'shares'
  const from = FROM_WORDS.find(([, re]) => re.test(p.text))?.[0]
  return { dataset: DATASET, filters: { geo }, time: { kind: 'all' }, intent: 'snapshot', renewables: { tab, ...(from && from !== 'all' ? { from } : {}), ...(PERCENT.test(p.text) ? { pct: true as const } : {}) } }
}

/** "capacity", "and France?", "since 2020", "as a share": a change of the renewables dashboard on screen. */
export function refineRenewables(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.renewables || !dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,?&]/g, ' '))
  const geos = dict.datasets[DATASET].dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => geos.includes(c)) ?? (places.eu ? EU : undefined)
  // "compare with France", "versus the EU", "no comparison"
  const asked = compareRequest(p.text, places, geos, String(current.filters.geo ?? EU), false)
  if (asked && 'off' in asked) return current.renewables.compare ? { ...current, renewables: { ...current.renewables, compare: undefined }, notes: [] } : null
  if (asked) return { ...current, renewables: { ...current.renewables, compare: asked.target }, notes: [] }
  const tab = tabOf(p.text)
  const from = FROM_WORDS.find(([, re]) => re.test(p.text))?.[0]
  const pct = PERCENT.test(p.text) ? true : ABSOLUTE.test(p.text) ? false : undefined
  const rest = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|show|zeige|montre|now|jetzt|maintenant|renewables?|renewable|energy|erneuerbare\w*|renouvelables?|energies?|energie\w*|by|nach|par|technology|technologies|technologie\w*|since|from|seit|depuis|year|as|a|share|percent\w*|total|absolute|zeigen|anzeigen|afficher|only|nur)$/.test(w) && !/^\d{4}$/.test(w))
  const known = rest.every((w) => tabOf(` ${w} `) || detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!(geo || tab || from || pct !== undefined) || (!known && !RENEW.test(p.text))) return null
  const r = current.renewables
  return {
    ...current,
    filters: { ...current.filters, ...(geo ? { geo } : {}) },
    renewables: { tab: tab ?? r.tab, ...(r.goal ? { goal: r.goal } : {}), ...(r.compare && r.compare !== (geo ?? current.filters.geo) ? { compare: r.compare } : {}), ...((from ?? r.from) && (from ?? r.from) !== 'all' ? { from: (from ?? r.from) as RenewablesFrom } : {}), ...((pct ?? r.pct) ? { pct: true as const } : {}) },
    notes: [],
  }
}

// ---------- the data of each tab ----------

export type Series = Map<string, number>
interface Loaded {
  /** The main categories (or the lines), each with its values by year (already in the unit shown). */
  groups: { key: string; values: Series }[]
  /** All values behind the tab: row label, values by year. */
  table: { label: string; values: Series }[]
  years: string[]
  /** Dataset shown as the source, and its title. */
  source: { code: string; title: string }
  /** Unit when it is not the tab's usual one (a country that reports wood in volume only). */
  unit?: string
}

const yearOf = (o: EurostatResult['observations'][number]) => o.keys.time
export const valuesOf = (r: EurostatResult | null, pick: (keys: Record<string, string>) => string | null): Map<string, Series> => {
  const out = new Map<string, Series>()
  for (const o of r?.observations ?? []) {
    if (o.value == null) continue
    const k = pick(o.keys)
    if (k == null) continue
    const s = out.get(k) ?? new Map()
    s.set(yearOf(o), (s.get(yearOf(o)) ?? 0) + o.value)
    out.set(k, s)
  }
  return out
}
export const sumSeries = (parts: (Series | undefined)[], div = 1): Series => {
  const out: Series = new Map()
  for (const s of parts) for (const [y, v] of s ?? []) out.set(y, (out.get(y) ?? 0) + v / div)
  return out
}
export const minus = (a: Series, b: Series): Series => new Map([...a].map(([y, v]) => [y, Math.max(v - (b.get(y) ?? 0), 0)]))
export const labelOf = (r: EurostatResult | null, dim: string, code: string) => r?.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code
export const yearsOf = (series: Series[]) => [...new Set(series.flatMap((s) => [...s.keys()]))].sort()

export type Ask = (dataset: string, filters: Record<string, string | string[]>, since?: string) => Promise<EurostatResult | null>

// The main categories of the SHARES reporting, by the codes behind them.
const SOLID = ['R5110-5150_W6000RI']
const CAPACITY_CODES = ['RA100', 'RA110', 'RA120', 'RA130', 'RA200', 'RA300', 'RA310', 'RA320', 'RA400', 'RA410', 'RA420', 'RA500', 'R5100', 'R5210P', 'R5220P', 'R5290', 'R5300']
const ELECTRICITY_CODES = ['RA000', 'RA100', 'RA200', 'RA300', 'RA310', 'RA320', 'RA410', 'RA420', 'RA500', ...SOLID, 'R5292P', 'R5300', 'W6210']
const HEATING_CODES = ['RA000', 'RA200', 'RA410', 'RA600', 'RA610', 'RA620', 'RA700', ...SOLID, 'R5160', 'R5292', 'R5300', 'W6210']
const TRANSPORT_CODES = ['RA000', 'R5250S', 'R5200', 'R5300', 'E7100', 'RHYD', 'RSYNF', 'RCF']
const BIOMASS_CODES = ['R5101', 'R5102', 'R5103', 'R5104', 'R5105', 'R5106', 'R5107', 'R5108', 'R5109', 'R5111', 'R5112', 'R5113', 'R5151', 'R5152', 'R5153', 'R5154', 'W6000RI', 'R5160', 'W6205', 'W6210', 'W6230']
const BUILDING_CODES = ['RA000', 'RA200', 'RA410', 'RA600', ...SOLID, 'R5160', 'R5290', 'R5300', 'W6210']

async function loadCapacity(ask: Ask, geo: string, since: string): Promise<Loaded> {
  const r = await ask('nrg_inf_epcrw', { geo, plant_tec: 'CAP_NET_ELC', siec: CAPACITY_CODES }, since)
  const v = valuesOf(r, (k) => k.siec)
  const g = (codes: string[]) => sumSeries(codes.map((c) => v.get(c)), 1000)
  const groups = [
    { key: 'hydro', values: g(['RA100']) },
    { key: 'wind', values: g(['RA300']) },
    { key: 'solar', values: g(['RA400']) },
    { key: 'geothermal', values: g(['RA200']) },
    { key: 'ocean', values: g(['RA500']) },
    { key: 'biomass', values: g(['R5100', 'R5300', 'R5210P', 'R5220P', 'R5290']) },
  ]
  return { groups, table: CAPACITY_CODES.filter((c) => v.has(c)).map((c) => ({ label: labelOf(r, 'siec', c), values: sumSeries([v.get(c)], 1000) })), years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_inf_epcrw', title: r?.label ?? '' } }
}

async function loadElectricity(ask: Ask, geo: string, since: string): Promise<Loaded> {
  const [r, den] = await Promise.all([ask('nrg_ind_ured', { geo, nrg_bal: 'GEP_RED', unit: 'GWH', siec: ELECTRICITY_CODES }, since), ask('nrg_ind_ured', { geo, nrg_bal: 'GFC_ELC', unit: 'GWH', siec: 'TOTAL' }, since)])
  const v = valuesOf(r, (k) => k.siec)
  const denominator = sumSeries([valuesOf(den, (k) => k.siec).get('TOTAL')], 1000)
  const g = (codes: string[]) => sumSeries(codes.map((c) => v.get(c)), 1000)
  const main = [
    { key: 'hydro', values: g(['RA100']) },
    { key: 'wind', values: g(['RA300']) },
    { key: 'solar', values: g(['RA410', 'RA420']) },
    { key: 'geothermal', values: g(['RA200']) },
    { key: 'ocean', values: g(['RA500']) },
    { key: 'biomass', values: g([...SOLID, 'R5292P', 'R5300', 'W6210']) },
  ]
  const other = minus(g(['RA000']), sumSeries(main.map((x) => x.values)))
  const groups = other.size && [...other.values()].some((x) => x > 0.5) ? [...main, { key: 'other', values: other }] : main
  return { groups, table: ELECTRICITY_CODES.filter((c) => v.has(c)).map((c) => ({ label: labelOf(r, 'siec', c), values: sumSeries([v.get(c)], 1000) })), years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_ind_ured', title: r?.label ?? '' }, ...{ denominator } } as Loaded
}

async function loadHeating(ask: Ask, geo: string, since: string): Promise<Loaded> {
  const r = await ask('nrg_ind_urhcd', { geo, unit: 'KTOE', nrg_bal: ['FC_IND_OTH_E', 'GHP_RED', 'PPRD_RED', 'GFC_HEAT_CL_E'], siec: HEATING_CODES }, since)
  // A technology's contribution: what is used directly, the derived heat made from it, and the ambient heat captured.
  const v = valuesOf(r, (k) => (k.nrg_bal === 'GFC_HEAT_CL_E' ? `TOTAL|${k.siec}` : ['FC_IND_OTH_E', 'GHP_RED', 'PPRD_RED'].includes(k.nrg_bal) ? k.siec : null))
  const g = (codes: string[]) => sumSeries(codes.map((c) => v.get(c)))
  const main = [
    { key: 'solidBiomass', values: g([...SOLID, 'R5160']) },
    { key: 'ambient', values: g(['RA600', 'RA700']) },
    { key: 'biogas', values: g(['R5300']) },
    { key: 'wasteRenewable', values: g(['W6210']) },
    { key: 'solarThermal', values: g(['RA410']) },
    { key: 'geothermal', values: g(['RA200']) },
    { key: 'bioliquids', values: g(['R5292']) },
  ]
  const other = minus(v.get('TOTAL|RA000') ?? new Map(), sumSeries(main.map((x) => x.values)))
  const groups = [...main, ...(other.size && [...other.values()].some((x) => x > 5) ? [{ key: 'other', values: other }] : [])]
  const table = [...new Set(HEATING_CODES)].filter((c) => v.has(c)).map((c) => ({ label: labelOf(r, 'siec', c), values: v.get(c)! }))
  return { groups, table: [...table, ...(v.has('TOTAL|RA000') ? [{ label: `${labelOf(r, 'siec', 'RA000')} (${labelOf(r, 'nrg_bal', 'GFC_HEAT_CL_E').slice(0, 60)})`, values: v.get('TOTAL|RA000')! }] : [])], years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_ind_urhcd', title: r?.label ?? '' } }
}

async function loadTransport(ask: Ask, geo: string, since: string): Promise<Loaded> {
  const r = await ask('nrg_ind_urtd', { geo, unit: 'KTOE', nrg_bal: ['FC_TRA_E_RED', 'FC_TRA_ROAD_E_RED', 'FC_TRA_RAIL_E_RED', 'GFC_TRA_E_NMULTI'], siec: TRANSPORT_CODES }, since)
  const v = valuesOf(r, (k) => (k.nrg_bal === 'GFC_TRA_E_NMULTI' ? `TOTAL|${k.siec}` : k.nrg_bal === 'FC_TRA_E_RED' ? `ALL|${k.siec}` : `MODE|${k.siec}`))
  const main = [
    { key: 'biofuels', values: sumSeries([v.get('ALL|R5250S')]) },
    { key: 'biogas', values: sumSeries([v.get('MODE|R5300'), v.get('ALL|R5300')]) },
    { key: 'renewableElectricity', values: sumSeries([v.get('MODE|E7100'), v.get('ALL|E7100')]) },
    { key: 'hydrogenSynthetic', values: sumSeries([v.get('ALL|RHYD'), v.get('ALL|RSYNF'), v.get('ALL|RCF')]) },
  ]
  const other = minus(v.get('TOTAL|RA000') ?? new Map(), sumSeries(main.map((x) => x.values)))
  const groups = [...main, ...(other.size && [...other.values()].some((x) => x > 5) ? [{ key: 'other', values: other }] : [])]
  const table = TRANSPORT_CODES.map((c) => ({ label: labelOf(r, 'siec', c), values: sumSeries([v.get(`ALL|${c}`), v.get(`MODE|${c}`), v.get(`TOTAL|${c}`)].slice(0, 2)) })).filter((x) => x.values.size)
  return { groups, table, years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_ind_urtd', title: r?.label ?? '' } }
}

async function loadBiomass(ask: Ask, geo: string, since: string): Promise<Loaded> {
  let r = await ask('nrg_cb_bm', { geo, unit: 'TJ', nrg_bal: 'IPRD', siec: BIOMASS_CODES }, since)
  let v = valuesOf(r, (k) => k.siec)
  // Some countries (Finland) report their wood in volume only: shown as it is reported, in thousand m³.
  const volume = ![...v.values()].some((x) => [...x.values()].some((n) => n > 0))
  if (volume) {
    r = await ask('nrg_cb_bm', { geo, unit: 'THS_M3', nrg_bal: 'IPRD', siec: BIOMASS_CODES }, since)
    v = valuesOf(r, (k) => k.siec)
  }
  const g = (codes: string[]) => sumSeries(codes.map((c) => v.get(c)), volume ? 1 : 1000)
  const groups = [
    { key: 'forest', values: g(['R5101']) },
    { key: 'coProducts', values: g(['R5107']) },
    { key: 'postConsumerWood', values: g(['R5112']) },
    { key: 'processedWood', values: g(['R5113']) },
    { key: 'agricultural', values: g(['R5151']) },
    { key: 'organicWaste', values: g(['W6205', 'W6210', 'W6230', 'W6000RI']) },
  ]
  return { groups, table: BIOMASS_CODES.filter((c) => v.has(c)).map((c) => ({ label: labelOf(r, 'siec', c), values: sumSeries([v.get(c)], volume ? 1 : 1000) })), years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_cb_bm', title: r?.label ?? '' }, ...(volume ? { unit: 'thousand m³' } : {}) }
}

async function loadSolid(ask: Ask, geo: string, since: string): Promise<Loaded> {
  const lines = ['TI_E', 'FC_IND_E', 'FC_OTH_E', 'NRG_E', 'FC_TRA_E']
  const r = await ask('nrg_cb_rw', { geo, unit: 'TJ', siec: SOLID, nrg_bal: lines }, since)
  const v = valuesOf(r, (k) => k.nrg_bal)
  const g = (codes: string[]) => sumSeries(codes.map((c) => v.get(c)), 1000)
  const groups = [
    { key: 'transformation', values: g(['TI_E']) },
    { key: 'industry', values: g(['FC_IND_E']) },
    { key: 'otherSectors', values: g(['FC_OTH_E']) },
    { key: 'energySector', values: g(['NRG_E', 'FC_TRA_E']) },
  ]
  return { groups, table: lines.filter((c) => v.has(c)).map((c) => ({ label: labelOf(r, 'nrg_bal', c), values: sumSeries([v.get(c)], 1000) })), years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_cb_rw', title: r?.label ?? '' } }
}

async function loadBuildings(ask: Ask, geo: string, since: string): Promise<Loaded> {
  const r = await ask('nrg_bal_c', { geo, unit: 'KTOE', nrg_bal: ['FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_E'], siec: BUILDING_CODES }, since)
  const v = valuesOf(r, (k) => (k.nrg_bal === 'FC_E' ? null : k.siec))
  const all = valuesOf(r, (k) => (k.nrg_bal === 'FC_E' ? k.siec : null))
  const hh = valuesOf(r, (k) => (k.nrg_bal === 'FC_OTH_HH_E' ? k.siec : null))
  const cp = valuesOf(r, (k) => (k.nrg_bal === 'FC_OTH_CP_E' ? k.siec : null))
  const g = (codes: string[]) => sumSeries(codes.map((c) => v.get(c)))
  const main = [
    { key: 'solidBiomass', values: g([...SOLID, 'R5160']) },
    { key: 'ambient', values: g(['RA600']) },
    { key: 'solarThermal', values: g(['RA410']) },
    { key: 'biogas', values: g(['R5300']) },
    { key: 'geothermal', values: g(['RA200']) },
    { key: 'bioliquids', values: g(['R5290']) },
    { key: 'wasteRenewable', values: g(['W6210']) },
  ]
  const groups = main.filter((x) => x.values.size)
  const table = [
    ...BUILDING_CODES.filter((c) => hh.has(c)).map((c) => ({ label: `${labelOf(r, 'siec', c)} · ${labelOf(r, 'nrg_bal', 'FC_OTH_HH_E').slice(0, 40)}`, values: hh.get(c)! })),
    ...BUILDING_CODES.filter((c) => cp.has(c)).map((c) => ({ label: `${labelOf(r, 'siec', c)} · ${labelOf(r, 'nrg_bal', 'FC_OTH_CP_E').slice(0, 40)}`, values: cp.get(c)! })),
  ]
  return { groups, table, years: yearsOf(groups.map((x) => x.values)), source: { code: 'nrg_bal_c', title: r?.label ?? '' }, ...{ hh: hh.get('RA000'), cp: cp.get('RA000'), all: all.get('RA000') } } as Loaded
}

const LOADERS: Record<Exclude<RenewablesTab, 'shares'>, (ask: Ask, geo: string, since: string) => Promise<Loaded>> = {
  capacity: loadCapacity,
  electricity: loadElectricity,
  heating: loadHeating,
  transport: loadTransport,
  biomass: loadBiomass,
  solid: loadSolid,
  buildings: loadBuildings,
}

/** Unit shown for each tab, and its decimals for a country of that size. */
const UNITS: Record<Exclude<RenewablesTab, 'shares'>, string> = { capacity: 'GW', electricity: 'TWh', heating: 'ktoe', transport: 'ktoe', biomass: 'PJ', solid: 'PJ', buildings: 'ktoe' }

export type RenewablesStrings = Strings['renewables']
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')

// ---------- the dashboard ----------

export async function buildRenewablesDashboard(plan: Plan, dict: EnergyDictionary, lang: string, s: { renewables: RenewablesStrings; sugExplain: string }, signal?: AbortSignal): Promise<DashboardSpec> {
  const t = s.renewables
  const lc = (x: string) => (lang === 'de' ? x : x.toLowerCase())
  const tab = plan.renewables?.tab ?? 'shares'
  const from = plan.renewables?.from ?? 'all'
  const percent = !!plan.renewables?.pct
  const compareGeo = plan.renewables?.compare && plan.renewables.compare !== String(plan.filters.geo ?? EU) ? plan.renewables.compare : undefined
  const geo = String(plan.filters.geo ?? EU)
  const since = from === 'all' ? '2004' : from
  const ask: Ask = (dataset, filters, sinceYear) =>
    dict.datasets[dataset] ? fetchEurostatData(dataset, { filters, lang, signal, ...(sinceYear ? { sinceTimePeriod: sinceYear } : {}) }).catch(() => null) : Promise.resolve(null)

  const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })
  const pct = (v: number) => nf(1).format(v)
  const widgets: WidgetSpec[] = []
  const kpis: KpiSpec[] = []
  const peers: Suggestion[] = []
  const insights: Insight[] = []
  const summary: string[] = []
  const notes: string[] = []
  let geoName: string
  let source: { code: string; title: string }
  const tabName = t.tabs[tab]

  if (tab === 'shares') {
    // ----- tab 1: the shares of energy from renewable sources, overall and by sector -----
    const r = await ask(DATASET, { geo, unit: 'PC', nrg_bal: ['REN', 'REN_ELC', 'REN_HEAT_CL', 'REN_TRA', 'REN_HEAT_CL_WHC', 'REN_WHC_DHEAT_DCL'] }, since)
    if (!r) throw new NoDataError(DATASET)
    geoName = geo === EU ? t.sugEu : (labelOf(r, 'geo', geo) || geo).replace(/\s*\(.*?\)\s*$/, '')
    source = { code: DATASET, title: r.label }
    const v = valuesOf(r, (k) => k.nrg_bal)
    const years = yearsOf([...v.values()])
    if (!years.length) throw new NoDataError(DATASET)
    const last = years.at(-1)!
    const lastN = Number(last)
    const sectors: { key: 'overall' | 'electricity' | 'transport' | 'heating'; code: string }[] = [
      { key: 'overall', code: 'REN' },
      { key: 'electricity', code: 'REN_ELC' },
      { key: 'heating', code: 'REN_HEAT_CL' },
      { key: 'transport', code: 'REN_TRA' },
    ]
    const at = (code: string, y: string) => v.get(code)?.get(y) ?? null
    // A sector's latest figure can be a year older than the headline (heating and transport come later).
    const latest = (code: string) => {
      const y = [...(v.get(code)?.keys() ?? [])].sort().at(-1)
      return y ? { y, v: at(code, y) as number } : null
    }
    const euLevel = geo === EU
    const goal2020Shown = plan.renewables?.goal === '2020'
    // The categories run to 2030 so the reference points have a place on the axis.
    const axis = Array.from({ length: 2030 - Number(years[0]) + 1 }, (_, i) => String(Number(years[0]) + i))
    // The path of each sector to its 2030 reference point, from the 2020 value of the place shown (EU level only).
    // A country's own 2030 contribution (final energy and climate plan) replaces the EU level for the overall share.
    const nat = NATIONAL_RES_2030[geo]
    const natText = nat ? (nat.max ? `${pct(nat.value)} - ${pct(nat.max)}` : pct(nat.value)) : ''
    const path = (key: string, code: string): (number | null)[] | null => {
      const base = at(code, '2020')
      if (base == null || lastN < 2020) return null
      if (key === 'overall' || key === 'transport') {
        const goal = key === 'overall' ? (nat?.value ?? TARGET_OVERALL) : TARGET_TRANSPORT
        return axis.map((y) => (Number(y) >= 2020 ? Math.round((base + ((goal - base) * (Number(y) - 2020)) / 10) * 10) / 10 : null))
      }
      if (key === 'heating') {
        let x = base
        return axis.map((y) => {
          const n = Number(y)
          if (n < 2020) return null
          if (n > 2020) x += (n <= HC_STEPS[0][0] ? HC_STEPS[0][1] : HC_STEPS[1][1])
          return Math.round(x * 10) / 10
        })
      }
      return null
    }
    for (const sec of sectors) {
      const data = axis.map((y) => (Number(y) <= lastN ? at(sec.code, y) : null))
      if (!data.some((x) => x != null)) continue
      const p = goal2020Shown ? null : path(sec.key, sec.code)
      // The binding 2020 target (overall: the country's own; transport: 10 % for everyone; the EU: 20 % and 10 %).
      const goal2020 = sec.key === 'overall' ? (euLevel ? 20 : RES_2020_TARGET[geo]) : sec.key === 'transport' && (euLevel || RES_2020_TARGET[geo] != null) ? 10 : undefined
      widgets.push({
        type: 'line',
        title: t.sectors[sec.key],
        subtitle: `${geoName} · %`,
        categories: axis,
        series: [{ name: t.sectors[sec.key], data }, ...(p ? [{ name: sec.key === 'overall' && nat ? fill(t.pathNational, { value: natText }) : t.path[sec.key as 'overall' | 'heating' | 'transport'], data: p }] : []), ...(goal2020 != null && goal2020Shown ? [{ name: fill(t.target2020, { value: pct(goal2020) }), data: axis.map((y) => (Number(y) >= 2010 && Number(y) <= 2020 ? goal2020 : null)) }] : [])],
        highlight: last,
        unit: '%',
        size: 'half',
        role: sec.key === 'overall' ? 'headline' : 'evolution',
      })
    }
    // Where each sector stands: gauges against the EU 2030 level.
    const overall = at('REN', last)
    const transport = latest('REN_TRA')?.v ?? null
    if (overall != null) widgets.push({ type: 'gauge', title: t.gaugeOverall, subtitle: t.gaugeSub, value: Math.round(overall * 10) / 10, label: `${geoName}, ${last}`, max: 50, targets: [...(nat ? [{ value: nat.value, label: natText }] : []), { value: TARGET_OVERALL, label: pct(TARGET_OVERALL) }], goal: 'reach', unit: '%', size: 'half', role: 'headline' })
    if (transport != null) widgets.push({ type: 'gauge', title: t.gaugeTransport, subtitle: t.gaugeSub, value: Math.round(transport * 10) / 10, label: `${geoName}, ${latest('REN_TRA')?.y ?? last}`, max: 40, targets: [{ value: TARGET_TRANSPORT, label: pct(TARGET_TRANSPORT) }], goal: 'reach', unit: '%', size: 'half', role: 'headline' })
    // The all-countries rankings: the overall share and each sector's, each in its latest year.
    const all = await ask(DATASET, { geo: [...EU27_LIST], unit: 'PC', nrg_bal: ['REN', 'REN_ELC', 'REN_HEAT_CL', 'REN_TRA'] }, String(lastN - 1))
    // Each country's own 2020 share of heating and cooling: the base of its path to 2030.
    const heat2020 = await ask(DATASET, { geo: [...EU27_LIST], unit: 'PC', nrg_bal: 'REN_HEAT_CL' }, '2020')
    const base2020 = new Map((heat2020?.observations ?? []).filter((o) => o.value != null && o.keys.time === '2020').map((o) => [o.keys.geo, o.value as number]))
    for (const sec of sectors) {
      const rows = (all?.observations ?? []).filter((o) => o.value != null && o.keys.nrg_bal === sec.code)
      const y = rows.map((o) => o.keys.time).sort().at(-1)
      const rank = rows.filter((o) => o.keys.time === y).map((o) => ({ code: o.keys.geo, name: labelOf(all, 'geo', o.keys.geo).replace(/\s*\(.*?\)\s*$/, ''), value: o.value as number })).sort((a, b) => b.value - a.value)
      if (rank.length < 10 || !y) continue
      if (sec.key === 'overall' && !euLevel) peers.push(...peerChips(rank, geo, (n, v) => fill(t.peer, { name: n, value: v }), (c) => ({ ...plan, renewables: { ...plan.renewables!, compare: c } }), lang))
      widgets.push({ type: 'bar', title: fill(sec.key === 'overall' ? t.ranking : t.rankingSector, { year: y, sector: lc(t.sectors[sec.key]) }), subtitle: `${t.sectors[sec.key]} · %`, categories: rank.map((x) => x.name), series: [{ name: t.sectors[sec.key], data: rank.map((x) => Math.round(x.value * 10) / 10) }, ...(sec.key === 'overall' ? [{ name: t.ranking2030, data: rank.map((x) => NATIONAL_RES_2030[x.code]?.value ?? null) }] : []), ...(sec.key === 'heating' ? [{ name: t.rankingHeat, data: rank.map((x) => (base2020.has(x.code) ? Math.round((base2020.get(x.code)! + HC_TOTAL_RISE) * 10) / 10 : null)) }] : [])], horizontal: true, ...(sec.key === 'transport' ? { reference: { value: TARGET_TRANSPORT, label: fill(t.euTarget, { value: pct(TARGET_TRANSPORT) }) } } : {}), unit: '%', decimals: 1, size: sec.key === 'overall' ? 'full' : 'half', role: 'ranking' })
      const place = rank.findIndex((x) => x.code === geo)
      if (place >= 0 && !euLevel) insights.push({ tone: 'neutral', parts: [fill(sec.key === 'overall' ? t.insRank : t.insRankSector, { geo: geoName, rank: String(place + 1), of: String(rank.length), year: y, sector: lc(t.sectors[sec.key]) })] })
    }
    // Key figures, summary, insights.
    for (const sec of sectors) {
      const l = latest(sec.code)
      if (!l) continue
      const prev = at(sec.code, String(Number(l.y) - 1))
      kpis.push({ label: t.sectors[sec.key], value: Math.round(l.v * 10) / 10, unit: '%', decimals: 1, caption: l.y, goodDirection: 'up', ...(prev != null ? { delta: Math.round((l.v - prev) * 10) / 10, deltaUnit: 'pp', deltaLabel: String(Number(l.y) - 1) } : {}), trend: axis.filter((y) => Number(y) <= Number(l.y)).map((y) => at(sec.code, y)) })
    }
    const shown = (code: string) => {
      const l = latest(code)
      return l ? `${pct(l.v)}%${l.y !== last ? ` (${l.y})` : ''}` : '–'
    }
    if (overall != null) {
      const need = (TARGET_OVERALL - overall) / Math.max(2030 - lastN, 1)
      summary.push(fill(t.sumShares, { geo: geoName, year: last, overall: `${pct(overall)}%`, elc: shown('REN_ELC'), hc: shown('REN_HEAT_CL'), tra: shown('REN_TRA'), target: `${pct(TARGET_OVERALL)}%` }))
      if (nat) insights.push({ tone: overall >= nat.value ? 'up' : 'neutral', parts: [fill(t.insNational, { geo: geoName, value: `${natText}%`, gap: pct(Math.max(nat.value - overall, 0)), year: last })] })
      if (overall < TARGET_OVERALL) insights.push({ tone: 'down', parts: [fill(t.insNeed, { geo: geoName, pp: pct(need), year: last })] })
      else insights.push({ tone: 'up', parts: [fill(t.insReached, { geo: geoName, year: last })] })
      const first2020 = at('REN', '2020')
      if (first2020 != null && lastN > 2020) insights.push({ tone: overall >= first2020 ? 'up' : 'down', parts: [fill(t.insSince2020, { geo: geoName, from: `${pct(first2020)}%`, to: `${pct(overall)}%` })] })
    }
    const fast = sectors.map((sec) => ({ sec, d: (at(sec.code, last) ?? 0) - (at(sec.code, String(lastN - 5)) ?? at(sec.code, years[0]) ?? 0) })).filter((x) => x.sec.key !== 'overall').sort((a, b) => b.d - a.d)[0]
    if (fast && fast.d > 0) insights.push({ tone: 'up', parts: [fill(t.insFastest, { sector: lc(t.sectors[fast.sec.key]), pp: pct(fast.d) })] })
    notes.push(t.noteSeries, goal2020Shown ? t.note2020 : t.noteTargets, t.noteRankRefs, ...(nat && !goal2020Shown ? [t.noteNationalRes] : []), t.noteTransport29)
    // The table: all values.
    widgets.push({
      type: 'table',
      title: t.tableAll,
      columns: years,
      rows: ['REN', 'REN_ELC', 'REN_HEAT_CL', 'REN_TRA', 'REN_HEAT_CL_WHC', 'REN_WHC_DHEAT_DCL'].filter((c) => v.has(c)).map((c) => ({ label: labelOf(r, 'nrg_bal', c), values: years.map((y) => at(c, y)) })),
    })
  } else {
    // ----- tabs 2-8: stacked bars by technology -----
    const loaded = await LOADERS[tab](ask, geo, since)
    const probe = await ask(DATASET, { geo, unit: 'PC', nrg_bal: 'REN' }, '2024')
    geoName = geo === EU ? t.sugEu : (labelOf(probe, 'geo', geo) || geo).replace(/\s*\(.*?\)\s*$/, '')
    source = loaded.source
    const unit = loaded.unit ?? UNITS[tab]
    const groups = loaded.groups.filter((g) => [...g.values.values()].some((x) => Math.abs(x) > 0))
    // Years with nothing reported (some countries have only zeros) are left out.
    const years = loaded.years.filter((y) => groups.some((g) => (g.values.get(y) ?? 0) > 0))
    if (!years.length) throw new NoDataError(loaded.source.code)
    const total = new Map(years.map((y) => [y, groups.reduce((a, g) => a + (g.values.get(y) ?? 0), 0)]))
    const last = years.at(-1)!
    const lastN = Number(last)
    const tot = total.get(last) ?? 0
    const decimals = tot >= 100 ? 0 : tot >= 10 ? 1 : 2
    const round = (x: number) => Math.round(x * 10 ** (decimals + 1)) / 10 ** (decimals + 1)
    const name = (key: string) => (t.groups as Record<string, string>)[key] ?? key
    widgets.push({
      type: 'bar',
      title: fill(t.stackTitle[tab], { unit }),
      subtitle: `${geoName} · ${percent ? t.shareOfTotal : unit}`,
      categories: years,
      series: groups.map((g) => ({ name: name(g.key), data: years.map((y) => (g.values.has(y) ? round(g.values.get(y)!) : null)) })),
      stacked: percent ? 'percent' : true,
      unit: percent ? '%' : unit,
      decimals: percent ? 1 : decimals,
      size: 'full',
      role: 'composition',
    })
    // The latest year as shares of the total.
    const slices = groups.map((g) => ({ name: name(g.key), y: round(g.values.get(last) ?? 0) })).filter((x) => x.y > 0)
    if (slices.length >= 2) widgets.push({ type: 'pie', title: fill(t.pieTitle, { year: last }), subtitle: `${geoName} · ${unit}`, slices, centerLabel: `${nf(decimals).format(tot)} ${unit}`, unit, size: 'half', role: 'change' })
    // Each technology over time, as lines.
    if (years.length > 2) widgets.push({ type: 'line', title: t.linesTitle, subtitle: `${geoName} · ${unit}`, categories: years, series: groups.map((g) => ({ name: name(g.key), data: years.map((y) => (g.values.has(y) ? round(g.values.get(y)!) : null)) })), unit, size: 'half', role: 'evolution' })
    // Electricity: each source as a share of all electricity (gross final consumption of electricity).
    const denom = (loaded as unknown as { denominator?: Series }).denominator
    if (tab === 'electricity' && denom?.size) {
      const sy = years.filter((y) => (denom.get(y) ?? 0) > 0)
      widgets.push({ type: 'bar', title: t.elecShareTitle, subtitle: `${geoName} · %`, categories: sy, series: groups.map((g) => ({ name: name(g.key), data: sy.map((y) => (g.values.has(y) ? Math.round((1000 * g.values.get(y)!) / denom.get(y)!) / 10 : null)) })), stacked: true, unit: '%', decimals: 1, size: 'full', role: 'composition' })
      const ly = sy.at(-1)
      if (ly) {
        const top = [...groups].sort((a, b) => (b.values.get(ly) ?? 0) - (a.values.get(ly) ?? 0))[0]
        const totalShare = groups.reduce((a, g) => a + (g.values.get(ly) ?? 0), 0) / denom.get(ly)!
        insights.push({ tone: 'neutral', parts: [fill(t.insElecShare, { name: name(top.key), share: `${pct((100 * (top.values.get(ly) ?? 0)) / denom.get(ly)!)}%`, total: `${pct(100 * totalShare)}%`, year: ly })] })
      }
    }
    // Buildings: households against services.
    const extra = loaded as unknown as { hh?: Series; cp?: Series; all?: Series }
    if (tab === 'buildings' && (extra.hh || extra.cp)) {
      widgets.push({ type: 'bar', title: t.hhVsServices, subtitle: `${geoName} · ktoe`, categories: years, series: [{ name: t.groups.households, data: years.map((y) => extra.hh?.get(y) ?? null) }, { name: t.groups.services, data: years.map((y) => extra.cp?.get(y) ?? null) }], stacked: true, unit: 'ktoe', decimals: 0, size: 'full', role: 'detail' })
      // Households, everyone else, and the total of all final consumers.
      if (extra.all) {
        const other = years.map((y) => (extra.all!.has(y) ? Math.max((extra.all!.get(y) ?? 0) - (extra.hh?.get(y) ?? 0), 0) : null))
        widgets.push({ type: 'line', title: t.hhSplit, subtitle: `${geoName} · ktoe`, categories: years, series: [{ name: t.groups.households, data: years.map((y) => extra.hh?.get(y) ?? null) }, { name: t.groups.nonHouseholds, data: other }, { name: t.groups.total, data: years.map((y) => extra.all!.get(y) ?? null) }], unit: 'ktoe', size: 'full', role: 'evolution' })
        loaded.table.push({ label: t.groups.households, values: extra.hh ?? new Map() }, { label: t.groups.nonHouseholds, values: new Map(years.flatMap((y, i) => (other[i] != null ? [[y, other[i] as number] as [string, number]] : []))) }, { label: t.groups.total, values: extra.all })
      }
    }
    // Key figures.
    const prev = total.get(String(lastN - 1))
    const at2020 = total.get('2020')
    const leader = [...groups].sort((a, b) => (b.values.get(last) ?? 0) - (a.values.get(last) ?? 0))[0]
    kpis.push({ label: t.kpiTotal[tab], value: round(tot), unit, decimals, caption: last, goodDirection: 'up', ...(prev != null && prev > 0 ? { delta: Math.round((100 * (tot - prev)) / prev * 10) / 10, deltaUnit: '%', deltaLabel: String(lastN - 1) } : {}), trend: years.map((y) => total.get(y) ?? null) })
    if (leader && tot > 0) kpis.push({ label: fill(t.kpiLeader, { name: name(leader.key) }), value: Math.round((100 * (leader.values.get(last) ?? 0)) / tot * 10) / 10, unit: '%', decimals: 1, caption: t.shareOfTotal, goodDirection: 'neutral' })
    if (at2020 != null && at2020 > 0 && lastN > 2020) kpis.push({ label: fill(t.kpiSince2020, { year: '2020' }), value: Math.round((100 * (tot - at2020)) / at2020 * 10) / 10, unit: '%', decimals: 1, goodDirection: 'up' })
    const wind = groups.find((g) => g.key === 'wind')
    const sun = groups.find((g) => g.key === 'solar')
    if ((tab === 'capacity' || tab === 'electricity') && wind && sun && tot > 0) kpis.push({ label: t.kpiWindSolar, value: Math.round((100 * ((wind.values.get(last) ?? 0) + (sun.values.get(last) ?? 0))) / tot * 10) / 10, unit: '%', decimals: 1, caption: t.shareOfTotal, goodDirection: 'neutral' })
    // Summary and insights.
    if (leader && tot > 0) summary.push(fill(t.sumStack[tab], { geo: geoName, year: last, value: `${nf(decimals).format(tot)} ${unit}`, top: name(leader.key), share: `${pct((100 * (leader.values.get(last) ?? 0)) / tot)}%` }))
    if (at2020 != null && at2020 > 0 && lastN > 2020) summary.push(fill(t.sumChange, { from: '2020', pct: `${pct(Math.abs((100 * (tot - at2020)) / at2020))}%`, dir: tot >= at2020 ? t.rose : t.fell }))
    const growth = groups.map((g) => ({ g, d: (g.values.get(last) ?? 0) - (g.values.get(String(lastN - 5)) ?? g.values.get(years[0]) ?? 0) })).sort((a, b) => b.d - a.d)[0]
    if (growth && growth.d > 0) insights.push({ tone: 'up', parts: [fill(t.insGrowth, { name: name(growth.g.key), d: `${nf(decimals).format(growth.d)} ${unit}`, from: String(lastN - 5 >= Number(years[0]) ? lastN - 5 : years[0]) })] })
    if (tot > 0 && leader) insights.push({ tone: 'neutral', parts: [fill(t.insLeader, { name: name(leader.key), share: `${pct((100 * (leader.values.get(last) ?? 0)) / tot)}%`, year: last })] })
    if (tab === 'biomass') notes.push(t.noteBiomass)
    if (tab === 'heating') notes.push(t.noteHeating)
    if (tab === 'transport') notes.push(t.noteTransport)
    if (tab === 'buildings') notes.push(t.noteBuildings)
    notes.push(t.noteSeries)
    widgets.push({ type: 'table', title: t.tableAll, columns: years, rows: loaded.table.map((x) => ({ label: x.label, values: years.map((y) => x.values.get(y) ?? null) })) })
  }

  widgets.unshift({ type: 'kpis', items: kpis })
  const versusName = compareGeo ? await placeNameOf(dict, DATASET, compareGeo, lang) : undefined
  const title = withVersus(fill(t.title, { geo: geoName }), versusName, lang)
  const link = (code: string) => `https://ec.europa.eu/eurostat/databrowser/view/${code}/default/table?lang=${lang}`
  const { spec } = sanitizeSpec({
    title,
    subtitle: t.tabs[tab],
    summary,
    insights: insights.slice(0, 5),
    notes,
    widgets,
    layout: ['summary', 'notes', 'toolbar', 'kpis', 'charts', 'insights', 'table', 'suggestions'],
    presentation: { template: 'renewables', kpiStyle: 'cards', controls: ['geo', 'compare', 'period', 'goal', 'view'], primaryControls: 3, accent: 'teal' },
    source: { code: source.code, title: source.title || source.code, url: link(source.code) },
    ...(versusName ? { compareNames: [geoName, versusName] as [string, string] } : {}),
    suggestions: suggestions(plan, s, tab, peers),
    controls: await controls(plan, dict, lang, t, tab, from, percent, compareGeo),
    context: [title, tabName, ...summary, ...kpis.map((k) => `${k.label}: ${k.value} ${k.unit ?? ''}`)].join('\n'),
    plan,
    shown: { geo: [geo] },
  })
  return spec
}

/** The EU Member States, for the ranking of the overall share. */
const EU27_LIST = ['BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE']

async function controls(plan: Plan, dict: EnergyDictionary, lang: string, t: RenewablesStrings, tab: RenewablesTab, from: RenewablesFrom, percent: boolean, compareGeo: string | undefined) {
  const goal = plan.renewables?.goal
  const at = (over: Partial<NonNullable<Plan['renewables']>>): Plan => {
    const next = { tab, ...(from !== 'all' ? { from } : {}), ...(percent ? { pct: true as const } : {}), ...(goal ? { goal } : {}), ...(compareGeo ? { compare: compareGeo } : {}), ...over }
    if (!next.goal) delete next.goal
    if (!next.compare) delete next.compare
    if (next.from === 'all') delete next.from
    if (!next.pct) delete next.pct
    return { ...plan, renewables: next as NonNullable<Plan['renewables']> }
  }
  const compare = await compareChoice({ plan, dict, dataset: DATASET, lang, current: compareGeo, set: (c) => at({ compare: c }), t })
  return {
    tabs: RENEWABLES_TABS.map((k) => ({ label: t.tabs[k], plan: at({ tab: k }), active: k === tab })),
    periods: (['all', '2010', '2020'] as RenewablesFrom[]).map((f) => ({ label: t.from[f], plan: at({ from: f }), active: f === from })),
    choices: tab === 'shares' ? [compare, { key: 'goal', label: t.goalLabel, options: [{ label: t.goal2030, plan: at({ goal: undefined }), active: !goal }, { label: t.goal2020, plan: at({ goal: '2020' }), active: goal === '2020' }] }] : [{ key: 'view', label: t.view, options: [{ label: t.absolute, plan: at({ pct: undefined }), active: !percent }, { label: t.shareOfTotal, plan: at({ pct: true }), active: percent }] }, compare],
  }
}

function suggestions(plan: Plan, s: { renewables: RenewablesStrings; sugExplain: string }, tab: RenewablesTab, peers: Suggestion[]): Suggestion[] {
  const t = s.renewables
  const out: Suggestion[] = [...peers]
  if (tab === 'shares') {
    out.push({ label: t.sugCapacity, plan: { ...plan, renewables: { tab: 'capacity' } } }, { label: t.sugElectricity, plan: { ...plan, renewables: { tab: 'electricity' } } })
  } else out.push({ label: t.sugShares, plan: { ...plan, renewables: { tab: 'shares' } } })
  if (plan.filters.geo !== EU) out.push({ label: t.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: EU } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
